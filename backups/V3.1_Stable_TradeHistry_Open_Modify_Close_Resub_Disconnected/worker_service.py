
import MetaTrader5 as mt5
import os
import json
import time
import redis
import threading
import queue
from datetime import datetime

# ⚙️ CONFIGURATION
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
CONTAINER_ID = os.getenv("CONTAINER_ID", "node-default") # 🐝 Swarm Identity
QUEUE_WORKER_PREFIX = f"queue:worker:{CONTAINER_ID}:"
MAX_CONCURRENT_WINE_OPS = 5  # ⚡ 4GB RAM Constraint

# 🔒 CONCURRENCY CONTROL
# All threads share this semaphore. Only N threads can touch Wine/MT5 at once.
WINE_SEMAPHORE = threading.Semaphore(MAX_CONCURRENT_WINE_OPS)

# 📡 REDIS CONNECTION
r_client = redis.from_url(REDIS_URL, decode_responses=True)

class BotWorker(threading.Thread):
    def __init__(self, bot_path):
        super().__init__()
        self.bot_path = bot_path
        # Normalize path for queue key (e.g. /opt/bot_01/terminal64.exe -> bot_01)
        queue_suffix = bot_path 
        if "/opt/" in bot_path:
             queue_suffix = bot_path.split("/")[-2] # bot_01
        
        self.queue_key = f"{QUEUE_WORKER_PREFIX}{queue_suffix}"
        self.daemon = True
        self.running = True
        
    def run(self):
        print(f"[WORKER] 🤖 Started for {self.bot_path}")
        
        # 1. Initialize MT5 Connection (Once per Thread)
        if not mt5.initialize(path=self.bot_path):
            print(f"[ERROR] Failed to init MT5 at {self.bot_path}: {mt5.last_error()}")
            return

        while self.running:
            try:
                # 2. 📥 BLOCKING POP (Worker Queue)
                result = r_client.blpop([self.queue_key], timeout=5)
                
                if not result:
                    continue
                    
                _, payload_json = result
                job = json.loads(payload_json)
                self.process_batch(job)
                
            except Exception as e:
                print(f"[ERROR] Worker {self.bot_path}: {e}")
                time.sleep(1)
                
        mt5.shutdown()

    def process_batch(self, job):
        master_task = job['master_task']
        followers = job['followers']
        signal = master_task['signal']
        action = signal.get('action', 'OPEN')
        
        print(f"[WORKER] ⚙️ Processing Batch: {action} {len(followers)} followers on {self.bot_path}")
        
        # 3. 🛡️ ACQUIRE SEMAPHORE (Global Throttle)
        with WINE_SEMAPHORE:
            # 4. 🚀 BATCH EXECUTION LOOP
            for follower in followers:
                try:
                    self.execute_trade(follower, signal, action)
                except Exception as e:
                    print(f"[ERROR] Exec Fail for {follower.get('login')}: {e}")

    def calculate_safe_lot(self, symbol, master_volume, risk_factor, action_type):
        """
        🛡️ ANTIGRAVITY SAFETY ENGINE
        Calculates the safest proportional lot size based on:
        1. Pro-Rata Ratio (User %)
        2. Broker Limits (Min/Max/Step)
        3. Free Margin (Prevent Stop-Out)
        """
        import math
        
        # 1. Get Basics
        symbol_info = mt5.symbol_info(symbol)
        if not symbol_info:
            print(f"   [WARN] Symbol {symbol} not found")
            return master_volume # Fallback

        min_vol = symbol_info.volume_min
        max_vol = symbol_info.volume_max
        step_vol = symbol_info.volume_step
        
        # 2. Pro-Rata Target
        # Formula: Master * (User% / 100)
        target_vol = master_volume * (risk_factor / 100.0)
        
        # 3. Rounding to Step
        if step_vol > 0:
            target_vol = math.floor(target_vol / step_vol) * step_vol
            target_vol = round(target_vol, 2)
        
        # 4. First Clamp (Broker Limits)
        if target_vol < min_vol: target_vol = min_vol
        if target_vol > max_vol: target_vol = max_vol
        
        # 5. 💰 MARGIN SAFETY CHECK
        # Only feasible if we are logged in. We assume Login happened or happens.
        # Note: calculate_safe_lot is called inside execute_trade AFTER login switch.
        account_info = mt5.account_info()
        if not account_info: return target_vol
        
        free_margin = account_info.margin_free
        
        # Get Current Price for Margin Calc
        tick = mt5.symbol_info_tick(symbol)
        price = tick.ask if action_type == mt5.ORDER_TYPE_BUY else tick.bid
        
        try:
            required_margin = mt5.order_calc_margin(action_type, symbol, target_vol, price)
            
            if required_margin and required_margin > free_margin:
                # 🚨 DANGER: Insufficient Funds
                # Downgrade to Max Possible
                safe_ratio = (free_margin * 0.95) / required_margin # 95% buffer
                safe_vol = target_vol * safe_ratio
                
                # Re-round and Re-Clamp
                if step_vol > 0:
                    safe_vol = math.floor(safe_vol / step_vol) * step_vol
                    safe_vol = round(safe_vol, 2)
                
                if safe_vol < min_vol:
                    print(f"   ⚠️ Margin Low: Forcing Min Lot {min_vol} (User Request)")
                    safe_vol = min_vol
                
                print(f"    ⚠️ Downgraded Lot {target_vol} -> {safe_vol} (Margin Safety)")
                target_vol = safe_vol
                
        except Exception as e:
             print(f"   [WARN] Margin Calc Error: {e}")

        return target_vol

    def execute_trade(self, follower, signal, action):
        target_login = int(follower['login'])
        
        # A. Switch Account (if needed)
        curr = mt5.account_info()
        if not curr or curr.login != target_login:
            if not mt5.login(login=target_login, password=follower['password'], server=follower['server']):
                print(f"   [FAIL] Login {target_login}: {mt5.last_error()}")
                return

        # B. Prepare Request
        symbol = signal.get('symbol')
        master_vol = float(signal.get('volume', 0.01))
        risk_factor = float(follower.get('risk_factor', 100)) # Default 100%
        master_ticket = signal.get('ticket')
        
        order_type = mt5.ORDER_TYPE_BUY if signal.get('type') == 'BUY' else mt5.ORDER_TYPE_SELL
        
        # 🛡️ CALCULATE SAFE LOT
        if action == 'OPEN':
            volume = self.calculate_safe_lot(symbol, master_vol, risk_factor, order_type)
            if volume <= 0: return 
        else:
            # For Close, ideally we close what we have. 
            # MVP: Use Master Volume (or partial if supported)
            volume = master_vol 
        
        request = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": symbol,
            "volume": volume,
            "magic": 234000,
            "comment": f"CPY:{master_ticket}",
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": mt5.ORDER_FILLING_IOC,
            "type": order_type
        }
        
        # C. Send Order
        res = mt5.order_send(request)
        if res.retcode != mt5.TRADE_RETCODE_DONE:
             print(f"   ❌ {target_login}: {res.comment}")
        else:
             print(f"   ✅ {target_login}: Ticket {res.order} (Vol: {volume})")


def start_worker_service():
    # 🔍 DISCOVER BOTS
    bot_paths = []
    
    # A. Custom Path (Dev Mode / Windows)
    custom_path = os.getenv("MT5_PATH")
    if custom_path and os.path.exists(custom_path):
        print(f"[SERVICE] Adding Custom Bot Path: {custom_path}")
        bot_paths.append(custom_path)

    # B. Auto-Discovery (Docker / Linux)
    base_dir = "/opt"
    if os.name == 'nt': base_dir = "C:\\" # Scanning C:\bot_XX is risky, usually disabled on Windows
    
    if os.path.exists(base_dir):
        for d in os.listdir(base_dir):
            if d.startswith("bot_"):
                full = os.path.join(base_dir, d, "terminal64.exe")
                if os.path.exists(full):
                    bot_paths.append(full)
                 
    print(f"[SERVICE] Found {len(bot_paths)} Bots. Spawning threads...")
    
    threads = []
    for path in bot_paths:
        t = BotWorker(path)
        t.start()
        threads.append(t)
        
    for t in threads:
        t.join()

if __name__ == "__main__":
    start_worker_service()
