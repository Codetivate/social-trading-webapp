
import MetaTrader5 as mt5
import time
import threading
import json
import os
import redis
from typing import List, Dict, Any, Optional
from datetime import datetime

# ==========================================
# 🛡️ HYDRA SENTINEL: SAFETY GUARD SERVICE
# ==========================================
# Independent Process for Monitoring Risk & Publishing Positions
# Zero Latency Impact on Execution Engine

# Redis Configuration (Local)
REDIS_HOST = 'localhost'
REDIS_PORT = 6379
redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)

# Global Config Store (Updated via Redis Pub/Sub)
# Format: { "login_id": { "allocation": 1000, "session_id": 42, ... } }
# We key by LOGIN because we monitor ACCOUNTS.
# But what if one account has MULTIPLE Sessions?
# The Requirement is Per-Master Isolation.
# Config should be a LIST of sessions per Login?
# Or we flatten it: "login:session_id" -> Config?
# Let's simple list of Guard Configs.
GUARD_CONFIGS: Dict[int, List[Dict]] = {} 
CONFIG_LOCK = threading.Lock()

# Terminal Discovery (Same as HFT)
MAX_TERMINALS = 20  
GRID_PATH_TEMPLATE = "C:/MT5_Instance_{i:02d}/terminal64.exe"
follower_paths = []
for i in range(5, MAX_TERMINALS + 1):
    path = GRID_PATH_TEMPLATE.format(i=i)
    if os.path.exists(path):
        follower_paths.append(path)

TERMINAL_PATHS = follower_paths if follower_paths else ["C:/Program Files/MetaTrader 5/terminal64.exe"] # Fallback

# Shared Terminals Lock (If needed, but Monitoring is mostly Read-Only)
# However, 'mt5.initialize' switches context. We MUST lock.
MT5_GLOBAL_LOCK = threading.RLock()

class MonitorWorker(threading.Thread):
    def __init__(self, terminal_path: str, worker_id: int):
        super().__init__()
        self.terminal_path = terminal_path
        self.worker_id = worker_id
        self.daemon = True
        self.last_login = 0
        
    def run(self):
        print(f"[MONITOR #{self.worker_id}] 🛡️ Sentinel Logic Started on {self.terminal_path}")
        
        while True:
            try:
                # 1. Get List of Accounts to Check
                # Round Robin or Check All?
                # We need to cycle through all active logins assigned to this "Grid"?
                # Actually, we don't know which login is on which terminal until we try.
                # BUT, since we are decoupling, we can just iterate the GUARD_CONFIGS keys.
                # ISSUE: Switching accounts is slow (2-5s).
                # Ideally, HFT engine keeps them logged in?
                # The Sentinel should probably be lazy and check the CURRENTLY LOGGED IN account first.
                
                with MT5_GLOBAL_LOCK:
                    if not mt5.initialize(path=self.terminal_path):
                        print(f"[MONITOR] Init failed on {self.terminal_path}")
                        time.sleep(5)
                        continue
                        
                    # Who is logged in?
                    info = mt5.account_info()
                    current_login = info.login if info else 0
                    
                    # Do we have configs for this login?
                    with CONFIG_LOCK:
                        # Find configs for this login
                        active_login_configs = GUARD_CONFIGS.get(current_login, [])
                    
                    if active_login_configs:
                        # ✅ CHECK RISK for this account
                        self.check_risk(current_login, active_login_configs)
                        
                        # ✅ PUBLISH POSITIONS (Real-Time UI)
                        self.publish_positions(current_login)
                        
                    else:
                        # Idle or Wrong Account.
                        # We could try to switch, but HFT engine manages logins.
                        # Sentinel is passive. It waits for HFT to login, then it guards.
                        # OR if HFT is idle, Sentinel can cycle?
                        # Let's keep it PASSIVE for now to avoid fighting HFT for login.
                        pass

                time.sleep(1.0) # 1Hz Polling (High freq enough?)

            except Exception as e:
                print(f"[MONITOR] Error: {e}")
                time.sleep(5)

    def check_risk(self, login: int, configs: List[Dict]):
        """
        Checks PnL limits for ALL sessions active on this account.
        Apply Per-Master Isolation.
        """
        positions = mt5.positions_get()
        if positions is None: return

        # Pre-calc totals per session to save iterations?
        # Iterate positions once.
        # Map: session_id -> { pnl: 0.0, volume: 0.0, trades: [] }
        
        session_stats = {}
        
        for pos in positions:
            if pos.magic != 234000: continue
            
            # Parse Session ID from Comment 'CPY:S<ID>:...'
            sid = 0
            try:
                if "CPY:S" in pos.comment:
                     parts = pos.comment.split(':')
                     # CPY:S123:Ticket -> parts[0]=CPY, parts[1]=S123
                     sid_str = parts[1].replace('S', '')
                     sid = int(sid_str)
            except:
                sid = 0 # Legacy or Failed parse
            
            if sid not in session_stats:
                session_stats[sid] = { 'pnl': 0.0, 'positions': [] }
            
            # Safe Attribute Access (Fix for user error 'no attribute commission')
            # Some brokers don't return swap/commission?
            # Use getattr with default
            profit = getattr(pos, 'profit', 0.0)
            swap = getattr(pos, 'swap', 0.0)
            comm = getattr(pos, 'commission', 0.0)
            
            net_pnl = profit + swap + comm
            session_stats[sid]['pnl'] += net_pnl
            session_stats[sid]['positions'].append(pos)

        # Now Check Each Config against Stats
        for cfg in configs:
            target_sid = cfg.get('session_id', 0)
            
            # If Config has Session ID (New Mode)
            # Use specific stats. 
            # If Config has session_id=0 (Old Mode) -> Use ALL 234000 trades? 
            # Or use stats[0]? Let's assume stats[0] is strictly for untagged.
            # If config is legacy, maybe we sum everything?
            # Let's stick to Strict Mapping: Config(S42) checks Stats(S42).
            
            stats = session_stats.get(target_sid)
            if not stats:
                 # No open trades for this session -> Safe.
                 continue
                 
            # Calculate Limit
            alloc = float(cfg.get('allocation', 0))
            # Fallback to balance? Sentinel might not know balance if we don't fetch it.
            # We are inside 'initialize', so we can fetch account info.
            # But let's rely on passed config or safe default.
            if alloc <= 0: alloc = 1000 # Default safe? Or infinite?
            
            # Parse HardCut
            safety = cfg.get('config', {})
            if isinstance(safety, str):
                try: safety = json.loads(safety)
                except: safety = {}
                
            hard_cut_pct = float(safety.get('hardCut', 95.0))
            risk_limit = alloc * (hard_cut_pct / 100.0)
            
            current_pnl = stats['pnl']
            
            # TRIGGER?
            if risk_limit > 0 and current_pnl < (-1 * risk_limit):
                print(f"[SENTINEL] 🚨 HARD CUT TRIGGERED for Login {login} Session {target_sid}")
                print(f"           PnL: {current_pnl:.2f} < -{risk_limit:.2f}")
                self.panic_close(stats['positions'])

    def panic_close(self, positions_to_close):
        print(f"[SENTINEL] Closing {len(positions_to_close)} positions...")
        for pos in positions_to_close:
            try:
                # Reverse type
                t = mt5.ORDER_TYPE_SELL if pos.type == mt5.ORDER_TYPE_BUY else mt5.ORDER_TYPE_BUY
                price = mt5.symbol_info_tick(pos.symbol).bid if t == mt5.ORDER_TYPE_SELL else mt5.symbol_info_tick(pos.symbol).ask
                
                req = {
                    "action": mt5.TRADE_ACTION_DEAL,
                    "symbol": pos.symbol,
                    "volume": pos.volume,
                    "type": t,
                    "position": pos.ticket,
                    "price": price,
                    "magic": 234000,
                    "comment": "AI_HARD_CUT",
                    "type_time": mt5.ORDER_TIME_GTC,
                    "type_filling": mt5.ORDER_FILLING_IOC,
                }
                res = mt5.order_send(req)
                if res.retcode != mt5.TRADE_RETCODE_DONE:
                    print(f"[SENTINEL] Close Failed {pos.ticket}: {res.comment}")
            except Exception as e:
                print(f"[SENTINEL] Close Exception: {e}")

    def publish_positions(self, login: int):
        """Publishes active positions to Redis for UI"""
        try:
            positions = mt5.positions_get()
            if positions is None: positions = []
            
            # Convert to JSON-friendly (Fixing datetime and big floats)
            data = []
            for p in positions:
                data.append({
                    "ticket": p.ticket,
                    "symbol": p.symbol,
                    "type": "BUY" if p.type == mt5.ORDER_TYPE_BUY else "SELL",
                    "volume": p.volume,
                    "profit": p.profit, # Gross
                    "swap": getattr(p, 'swap', 0),
                    "commission": getattr(p, 'commission', 0),
                    "comment": p.comment
                })
            
            # Key: positions:{login}
            redis_client.set(f"positions:{login}", json.dumps(data), ex=10)
            # print(f"[MONITOR] Published {len(data)} positions for {login}")
            
        except Exception as e:
            print(f"[MONITOR] Publish Error: {e}")

def config_listener():
    """Subscribes to Redis for Config Updates"""
    pubsub = redis_client.pubsub()
    pubsub.subscribe('sentinel:config')
    print("[INIT] Config Listener Started...")
    
    for message in pubsub.listen():
        if message['type'] == 'message':
            try:
                # data = [{ "login": 123, "session_id": 42, ... }, ...]
                updates = json.loads(message['data'])
                
                with CONFIG_LOCK:
                    # Clear old? Or Merge?
                    # Since we receive the "Full List" usually from executor sync, we can replace.
                    # But we need to group by Login.
                    GUARD_CONFIGS.clear()
                    
                    for item in updates:
                        login = int(item.get('login', 0))
                        if login == 0: continue
                        
                        if login not in GUARD_CONFIGS:
                             GUARD_CONFIGS[login] = []
                        GUARD_CONFIGS[login].append(item)
                        
                print(f"[CONFIG] Updated Guard Configs for {len(GUARD_CONFIGS)} Logins.")
                
            except Exception as e:
                print(f"[ERROR] Config Update Failed: {e}")

if __name__ == "__main__":
    print("🛡️ Hydra Sentinel Service Starting...")
    
    # 1. Start Config Listener Thread
    threading.Thread(target=config_listener, daemon=True).start()
    
    # 2. Start Monitor Workers (One per Terminal Path)
    workers = []
    for i, path in enumerate(TERMINAL_PATHS):
        w = MonitorWorker(path, i+1)
        w.start()
        workers.append(w)
        
    print(f"[INIT] {len(workers)} Sentinel Workers Active.")
    
    # Keep Main Alive
    try:
        while True: time.sleep(1)
    except KeyboardInterrupt:
        print("Stopping Sentinel...")
