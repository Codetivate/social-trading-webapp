
import MetaTrader5 as mt5
import time
import threading
import json
import os
import redis
import requests
from dotenv import load_dotenv
from typing import List, Dict, Any, Optional
from datetime import datetime

# 📥 Load Config
load_dotenv()
API_SECRET = os.getenv("API_SECRET", "AlphaBravoCharlieDeltaEchoFoxtro")
BASE_URL = os.getenv("AUTH_URL", "http://localhost:3000")
BROKER_API_URL = f"{BASE_URL}/api/user/broker"

# ==========================================
# 🛡️ HYDRA SENTINEL: SAFETY GUARD SERVICE
# ==========================================
# Independent Process for Monitoring Risk & Publishing Positions
# Zero Latency Impact on Execution Engine

# Redis Configuration (Local)
REDIS_HOST = 'localhost'
REDIS_PORT = 6379
redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)


# 🗺️ USER MAPPING CACHE: Login -> UserId
# Used to sync stats to the correct user.
USER_MAP: Dict[str, str] = {}
USER_MAP_LOCK = threading.Lock()

# 🏭 TERMINAL DISCOVERY (Dynamic)
def discover_terminals():
    print("[INIT] Scanning for MetaTrader 5 Terminals...")
    
    # 🌟 SINGLE MACHINE MODE RESTRICTION (User Request)
    # If MT5_PATH is set (via start_engine.ps1), ONLY monitor that terminal.
    # This prevents the Sentinel from opening other inactive terminals on the user's machine.
    override_path = os.getenv("MT5_PATH")
    if override_path:
        # Check if it exists or if it's just a raw string
        # Clean quotes just in case
        override_path = override_path.strip().strip('"').strip("'")
        if os.path.exists(override_path):
            print(f"[INIT] Single Target Override: {override_path}")
            return [os.path.normpath(override_path)]
    
    KNOWN_TARGETS = [
        r"C:\Program Files\MetaTrader 5 EXNESS\terminal64.exe",
        r"C:\Program Files\MetaTrader 5 EXNESS 002\terminal64.exe",
        r"C:\Program Files\MetaTrader 5 EXNESS 003\terminal64.exe"
    ]
    
    # Check Cloud Grid
    for i in range(1, 21):
        grid_path = f"C:\\MT5_Instance_{i:02d}\\terminal64.exe"
        if os.path.exists(grid_path):
             KNOWN_TARGETS.append(grid_path)
    
    potential_roots = [
        os.environ.get("ProgramFiles", "C:\\Program Files"),
        os.environ.get("ProgramFiles(x86)", "C:\\Program Files (x86)")
    ]
    
    found = set()
    
    # 0. Add Known Targets
    for kt in KNOWN_TARGETS:
        if os.path.exists(kt):
            found.add(os.path.normpath(kt))

    # 1. Scan Directories
    for root in potential_roots:
        if not os.path.exists(root): continue
        try:
            for d in os.listdir(root):
                # Look for "MetaTrader", "Exness", "XM", etc.
                if "MetaTrader" in d or "Exness" in d or "MT5" in d:
                    full_path = os.path.join(root, d, "terminal64.exe")
                    if os.path.exists(full_path):
                        found.add(os.path.normpath(full_path))
        except Exception as e:
            print(f"[WARN] Scan Error in {root}: {e}")

    # 2. Sort Pool
    def priority_sort(path):
        norm = os.path.normpath(path)
        for i, kt in enumerate(KNOWN_TARGETS):
            if os.path.normpath(kt) == norm: return i
        if "EXNESS" in norm.upper(): return 100
        return 999
        
    sorted_pool = sorted(list(found), key=priority_sort)
    print(f"[INFO] Discovered {len(sorted_pool)} Terminals for Monitoring.")
    return sorted_pool

TERMINAL_PATHS = discover_terminals()
if not TERMINAL_PATHS:
    print("[WARN] No terminals found. Using default fallback.")
    TERMINAL_PATHS = ["C:/Program Files/MetaTrader 5/terminal64.exe"]

# Shared Terminals Lock (If needed, but Monitoring is mostly Read-Only)
MT5_GLOBAL_LOCK = threading.RLock()


LOCK_KEY_GLOBAL = "lock:terminal:global"

class MonitorWorker(threading.Thread):
    def __init__(self, terminal_path: str, worker_id: int):
        super().__init__()
        self.terminal_path = terminal_path
        self.worker_id = worker_id
        self.daemon = True
        self.last_login = 0
        self.last_sync = 0
        
    def run(self):
        print(f"[MONITOR #{self.worker_id}] 🛡️ Sentinel Logic Started on {self.terminal_path}")
        
        while True:
            try:
                # 🤝 COOPERATIVE YIELD: Check Global Lock
                # If verify.py is verifying, we MUST BACK OFF immediately.
                if redis_client:
                    global_lock = redis_client.get(LOCK_KEY_GLOBAL)
                    if global_lock == "LOCKED_VERIFY":
                        # print(f"[MONITOR #{self.worker_id}] ✋ Yielding to Login Verification... (Global Lock Active)")
                        time.sleep(3.0) # Backoff longer to avoid spam
                        continue

                with MT5_GLOBAL_LOCK:
                    # 1. Initialize (Lazy)
                    term_info = mt5.terminal_info()
                    if not term_info or not term_info.connected:
                        # print(f"[MONITOR #{self.worker_id}] Connecting to Terminal...")
                        if not mt5.initialize(path=self.terminal_path):
                            print(f"[MONITOR] Init failed on {self.terminal_path}, Error: {mt5.last_error()}")
                            time.sleep(5)
                            continue
                        else:
                             print(f"[MONITOR #{self.worker_id}] Connected to MT5.")
                        
                    # 2. Check Login
                    info = mt5.account_info()
                    current_login = info.login if info else 0
                    
                    if current_login > 0:
                        # print(f"[MONITOR #{self.worker_id}] Active Login: {current_login}")
                        
                        # 3. Resolve User ID
                        user_id = self.resolve_user(current_login)
                        
                        # 4. Sync Stats (Every 1s)
                        if time.time() - self.last_sync > 1.0:
                             positions = mt5.positions_get()
                             if positions is None: positions = []
                             
                             # ⚡ SYNC TO BACKEND (PnL Connection)
                             if user_id:
                                 # print(f"[MONITOR #{self.worker_id}] Syncing Balance for {user_id}...")
                                 self.sync_balance(info, positions, user_id)
                             
                             # ✅ PUBLISH POSITIONS (Redis Cache for UI)
                             self.publish_positions(current_login)

                             self.last_sync = time.time()
                    else:
                        print(f"[MONITOR #{self.worker_id}] No Account Logged In.")
                    
                time.sleep(1.0) # Polling cycle

            except Exception as e:
                print(f"[MONITOR #{self.worker_id}] Error: {e}")
                time.sleep(5)

    def resolve_user(self, login: int) -> Optional[str]:
        """Resolves MT5 Login to Platform User ID"""
        login_str = str(login)
        with USER_MAP_LOCK:
            if login_str in USER_MAP:
                return USER_MAP[login_str]
        
        # Cache Miss: Fetch from API
        try:
            # We treat 'login' as the User ID in the header to trigger the specific lookup logic in route.ts
            r = requests.get(BROKER_API_URL, headers={
                 "x-bridge-secret": API_SECRET,
                 "x-user-id": login_str
            }, timeout=2)
            
            if r.status_code == 200:
                data = r.json()
                real_user_id = data.get("userId")
                if real_user_id:
                     with USER_MAP_LOCK:
                         USER_MAP[login_str] = real_user_id
                     print(f"[MONITOR] Mapped Login {login} -> User {real_user_id}")
                     return real_user_id
        except Exception as e:
            # print(f"[MONITOR] Resolve User Failed: {e}")
            pass
            
        return None

    def sync_balance(self, account_info, positions, user_id):
        try:
            # Calculate Floating PnL Map
            floating = {}
            for p in positions:
                 # Net PnL = profit + swap + commission
                 net = p.profit + getattr(p, 'swap', 0) + getattr(p, 'commission', 0)
                 floating[str(p.ticket)] = net

            payload = {
                "balance": account_info.balance,
                "equity": account_info.equity,
                "margin": account_info.margin,
                "freeMargin": account_info.margin_free,
                "leverage": account_info.leverage,
                "login": account_info.login,
                "floating": floating, 
                "positions": [{
                    "ticket": str(p.ticket),
                    "symbol": p.symbol,
                    "volume": p.volume,
                    "price": p.price_open,
                    "currentPrice": p.price_current,
                    "profit": p.profit,
                    "swap": getattr(p, 'swap', 0),
                    "commission": getattr(p, 'commission', 0),
                    "sl": p.sl,
                    "tp": p.tp,
                    "type": "BUY" if p.type == 0 else "SELL",
                    "openTime": int(p.time)
                } for p in positions]
            }
            
            r = requests.put(BROKER_API_URL, json=payload, headers={
                "x-bridge-secret": API_SECRET, 
                "x-user-id": user_id
            }, timeout=1)
        except Exception:
            pass # Silent fail



    def publish_positions(self, login: int):
        """Publishes active positions to Redis for UI"""
        try:
            positions = mt5.positions_get()
            if positions is None: positions = []
            
            data = []
            for p in positions:
                data.append({
                    "ticket": p.ticket,
                    "symbol": p.symbol,
                    "type": "BUY" if p.type == mt5.ORDER_TYPE_BUY else "SELL",
                    "volume": p.volume,
                    "profit": p.profit, 
                    "swap": getattr(p, 'swap', 0),
                    "commission": getattr(p, 'commission', 0),
                    "comment": p.comment
                })
            
            redis_client.set(f"positions:{login}", json.dumps(data), ex=10)
        except Exception as e:
            pass



if __name__ == "__main__":
    print("🛡️ Hydra Sentinel Service Starting (Stats Only)...")
    
    workers = []
    for i, path in enumerate(TERMINAL_PATHS):
        w = MonitorWorker(path, i+1)
        w.start()
        workers.append(w)
        
    print(f"[INIT] {len(workers)} Sentinel Workers Active.")
    
    try:
        while True: time.sleep(1)
    except KeyboardInterrupt:
        print("Stopping Sentinel...")
