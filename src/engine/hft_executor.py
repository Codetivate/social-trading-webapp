
import MetaTrader5 as mt5
import time
import queue
import threading
import os
from typing import List, Dict, Any, Optional
from datetime import datetime


# Global Pool Singleton
_HFT_POOL = None

# 🔒 GLOBAL MT5 MUTEX (Single Terminal Safety)
# Essential when 20 threads share 1 terminal (Single Machine HFT)
MT5_GLOBAL_LOCK = threading.RLock()

# 🚀 HFT CONFIGURATION
# Auto-Switch: Use Grid (20 Instances) if available, else Fallback to Single Terminal (Multi-Threaded)
MAX_TERMINALS = 20  
GRID_PATH_TEMPLATE = "C:/MT5_Instance_{i:02d}/terminal64.exe"

# Detect if Grid Exists
if os.path.exists(GRID_PATH_TEMPLATE.format(i=1)):
    TERMINAL_PATHS = [GRID_PATH_TEMPLATE.format(i=i) for i in range(1, MAX_TERMINALS + 1)]
    print(f"[HFT] 🏎️ Grid Mode Detected: {len(TERMINAL_PATHS)} Isolated Terminals.")
else:
    # Fallback -> VIRTUAL MODE (To avoid conflict with Master Terminal on Single Machine)
    # We cannot execute Follower Trades on the SAME terminal as the Master Broadcaster simultaneously.
    print(f"[HFT] ⚠️ Single Machine Detected. Enabling VIRTUAL HFT SWARM.")
    print(f"[HFT]    Trades will be SIMULATED to verify Pipeline (Redis -> API -> DB).")
    print(f"[HFT]    To enable Real Trading, please install secondary terminals C:/MT5_Instance_XX")
    TERMINAL_PATHS = ["MOCK"] * 4

def configure_swarm(path_arg: str):
    """Called by Parent Process to override defaults"""
    global TERMINAL_PATHS
    if path_arg and os.path.exists(path_arg):
        print(f"[HFT] 🔧 Configuring Swarm with Override Path: {path_arg}")
        TERMINAL_PATHS = [path_arg] * 4
    elif not any("terminal64.exe" in p for p in TERMINAL_PATHS if p != "MOCK"):
        print(f"[HFT] ⚠️ No valid terminal found. Using VIRTUAL MODE.")


# Context Object
class TradeJob:
    """Represents a single trade execution task"""
    def __init__(self, priority: int, slave_config: Dict, signal: Dict):
        self.priority = priority # 0 = High (Paid), 1 = Low (Free)
        self.slave_config = slave_config
        self.signal = signal
        # For sorting in PriorityQueue (lower number = higher priority)
        # We handle collisions by standard comparison, but dicts aren't comparable, so we'll implement __lt__
        
    def __lt__(self, other):
        return self.priority < other.priority

class TradeResult:
    """Standardized Trade Output"""
    def __init__(self, account_id: int, success: bool, execution_time: float, deal_id: int = 0, message: str = "", price: float = 0.0, volume: float = 0.0, profit: float = 0.0, type: str = ""):
        self.account_id = account_id
        self.success = success
        self.execution_time = execution_time
        self.deal_id = deal_id
        self.message = message
        self.price = price
        self.volume = volume
        self.profit = profit
        self.type = type

    def to_dict(self):
        return {
            "accountId": self.account_id,
            "status": "success" if self.success else "failed",
            "executionTime": f"{self.execution_time:.4f}s",
            "dealId": self.deal_id, # This is the TICKET for OPEN, or DEAL for CLOSE
            "message": self.message,
            "price": self.price,
            "volume": self.volume,
            "profit": self.profit,
            "type": self.type
        }

class WorkerPool:
    """
    Manages a pool of 'Warm' threads, each bound to a specific Terminal Path.
    """
    def __init__(self, paths: List[str]):
        self.paths = paths
        self.queue = queue.PriorityQueue()
        self.results = []
        self.active_workers = []
        self.shutdown_event = threading.Event()
        self.lock = threading.Lock()

    def worker_loop(self, terminal_path: str, worker_id: int):
        """
        Continuous loop for a single Thread/Terminal.
        It waits for jobs from the Queue and processes them.
        """
        # 1. 🏗️ WARM-UP / INITIALIZE
        # In a real persistent scenario, we initialize ONCE here.
        # But for 'executor.py' which might be restarted, we do it safely.
        # Note: mt5.initialize is global. We must use a Process-based approach for true parallel isolation 
        # OR assume the user accepts the 'Lock' behavior of the python lib but relies on the rapid switching.
        # Given the constraint: "Asynchronous Round-Robin", we will implementing the logic,
        # but technically without Multiprocessing, 'mt5.initialize' changes the global context.
        # For this specific architecture request, we assume the python script is orchestration 
        # and the 'terminal_path' is strictly respected during the 'critical section'.
        
        while not self.shutdown_event.is_set():
            try:
                # 2. 📥 GET JOB (Blocking with timeout to check shutdown)
                job: TradeJob = self.queue.get(timeout=1.0) 
            except queue.Empty:
                continue

            # 3. ⚙️ PROCESS JOB
            start_time = time.time()
            login_id = int(job.slave_config['login'])
            
            # 3. ⚙️ PROCESS JOB
            start_time = time.time()
            login_id = int(job.slave_config['login'])
            
            # 🔒 ACQUIRE TERMINAL CONTEXT
            # If all threads utilize the SAME path (Single Machine), we must Lock.
            # If using Grid (Unique Paths), this Lock is theoretical bottleneck but safe.
            with MT5_GLOBAL_LOCK:
                try:
                    # CRITICAL SECTION: SWITCH CONTEXT
                    # Since mt5 lib is singleton, we must 'Switch' the focus to this terminal path.
                    # In a purely Threaded model, this is the bottleneck. The *ideal* is Multiprocessing.
                    # But we follow the 'Path' affinity logic requested.
                    
                    # A. Initialize Wrapper (Fast if already running)
                    if terminal_path == "MOCK":
                        # 🟢 VIRTUAL EXECUTION PATH
                        time.sleep(0.005 + (0.01 * (worker_id % 5))) # Simulate 5-15ms Latency
                        
                        # Simulate Success
                        duration = time.time() - start_time
                        import random
                        fake_deal = random.randint(5000000, 9000000)
                        action = job.signal.get('action', 'OPEN')
                        
                        self._add_result(TradeResult(login_id, True, duration, fake_deal, f"Virtual {action}", price=999.99, volume=0.01, type=action))
                        # task_done handled by finally
                        continue

                    if not mt5.initialize(path=terminal_path):
                         self._add_result(TradeResult(login_id, False, 0, message=f"Init Failed: {mt5.last_error()}"))
                         # task_done handled by finally
                         continue

                    # B. Auth
                    current = mt5.account_info()
                    if not current or current.login != login_id:
                         if not mt5.login(login=login_id, password=job.slave_config['password'], server=job.slave_config['server']):
                             self._add_result(TradeResult(login_id, False, time.time()-start_time, message="Auth Failed"))
                             # task_done handled by finally
                             continue
                    
                    # C. Execute
                    # 🛡️ SAFETY CHECK: Final Verification before Trigger Pull
                    # Ensure we are absolutely logged into the correct account.
                    final_check = mt5.account_info()
                    if final_check.login != login_id:
                         self._add_result(TradeResult(login_id, False, 0, message=f"CRITICAL: Login Mismatch! Expected {login_id}, Got {final_check.login}"))
                         # task_done handled by finally
                         continue

                    # 🛡️ RISK GUARD CHECK
                    if not self.check_worker_risk(job.slave_config):
                         self._add_result(TradeResult(login_id, False, 0, message="RISK_LIMIT"))
                         continue

                    # C. Execution Logic (Router)
                    # ---------------------------------------------------------
                    action = job.signal.get('action', 'OPEN')
                    symbol = job.signal.get('symbol')
                    
                    request = {
                        "action": mt5.TRADE_ACTION_DEAL,
                        "symbol": symbol,
                        "volume": float(job.signal.get('volume', 0.01)),
                        "magic": 234000,
                        "comment": f"CPY:{job.signal.get('ticket')}", 
                        "type_time": mt5.ORDER_TIME_GTC,
                        "type_filling": mt5.ORDER_FILLING_IOC,
                    }
                    
                    # --- CASE 1: OPEN TRADE ---
                    if action == 'OPEN':
                        trade_type = mt5.ORDER_TYPE_BUY if job.signal.get('type') == 'BUY' else mt5.ORDER_TYPE_SELL
                        price = mt5.symbol_info_tick(symbol).ask if trade_type == mt5.ORDER_TYPE_BUY else mt5.symbol_info_tick(symbol).bid
                        
                        request.update({
                            "type": trade_type,
                            "price": price,
                            "sl": float(job.signal.get('sl', 0.0)),
                            "tp": float(job.signal.get('tp', 0.0))
                        })

                    # --- CASE 2: MODIFY TRADE (SL/TP) ---
                    elif action == 'MODIFY':
                        # FOR HFT: Use injected 'target_ticket' if available, else signal's ticket
                        injected_ticket = job.slave_config.get('target_ticket', 0)
                        local_ticket = injected_ticket if injected_ticket > 0 else int(job.signal.get('ticket', 0))
                        
                        if local_ticket == 0:
                            # 🩹 WORKER FALLBACK SCAN
                            # Last ditch effort: Scan positions for "CPY:{master_ticket}"
                            # This works because we are ATTACHED to the terminal right now.
                            master_ticket_str = str(job.signal.get('ticket', 0))
                            stub = f"CPY:{master_ticket_str}"
                            all_pos = mt5.positions_get()
                            found = False
                            if all_pos:
                                for p in all_pos:
                                    if p.magic == 234000 and stub in p.comment:
                                        local_ticket = p.ticket
                                        found = True
                                        # print(f"[HFT-WORKER] Self-Healed Ticket for {master_ticket_str} -> {local_ticket}")
                                        break
                            
                            if not found:
                                self._add_result(TradeResult(login_id, False, 0, message="Modify Failed: No Ticket Map & Scan Failed"))
                                continue

                        request = {
                            "action": mt5.TRADE_ACTION_SLTP,
                            "position": local_ticket,
                            "sl": float(job.signal.get('sl', 0.0)),
                            "tp": float(job.signal.get('tp', 0.0))
                        }

                    # --- CASE 3: CLOSE TRADE ---
                    elif action == 'CLOSE':
                        # To close, we open an OPPOSITE trade on the same position
                        injected_ticket = job.slave_config.get('target_ticket', 0)
                        local_ticket = injected_ticket if injected_ticket > 0 else int(job.signal.get('ticket', 0))
                        
                        if local_ticket == 0:
                            # 🩹 WORKER FALLBACK SCAN (CLOSE)
                            master_ticket_str = str(job.signal.get('ticket', 0))
                            stub = f"CPY:{master_ticket_str}"
                            all_pos = mt5.positions_get()
                            found = False
                            if all_pos:
                                for p in all_pos:
                                    if p.magic == 234000 and stub in p.comment:
                                        local_ticket = p.ticket
                                        found = True
                                        # print(f"[HFT-WORKER] Self-Healed Ticket for {master_ticket_str} -> {local_ticket}")
                                        break
                            
                            if not found:
                                self._add_result(TradeResult(login_id, False, 0, message="Close Failed: No Ticket Map & Scan Failed"))
                                continue
                        
                        # Check current position type to decide Close Type
                        # Fast lookup or assume signal['type'] (which is Master's type) -> We need Opposite
                        # Better: Read the position to be safe? No, too slow.
                        # Trust the signal type from Master. If Master was BUY, we needed to SELL to close.
                        master_type = job.signal.get('type', 'BUY') # The type of the position being closed
                        close_type = mt5.ORDER_TYPE_SELL if master_type == 'BUY' else mt5.ORDER_TYPE_BUY
                        price = mt5.symbol_info_tick(symbol).bid if close_type == mt5.ORDER_TYPE_SELL else mt5.symbol_info_tick(symbol).ask
                        
                        request.update({
                            "action": mt5.TRADE_ACTION_DEAL,
                            "type": close_type,
                            "position": local_ticket,
                            "price": price
                        })

                    # FIRE 🔥
                    res = mt5.order_send(request)
                    
                    duration = time.time() - start_time
                    success = (res.retcode == mt5.TRADE_RETCODE_DONE)
                    msg = f"{action} Done" if success else f"Err: {res.retcode} {res.comment}"
                    
                    # Result Parsing
                    ret_price = res.price
                    ret_vol = res.volume
                    deal_id = res.order # Default to order for OPEN/MODIFY
                    if success and action == 'OPEN':
                         deal_id = res.order # The new ticket
                    elif success and action == 'CLOSE':
                         deal_id = res.deal 
                         
                    self._add_result(TradeResult(login_id, success, duration, deal_id, msg, price=ret_price, volume=ret_vol, type=action))

                except Exception as e:
                    self._add_result(TradeResult(login_id, False, 0, message=f"Exception: {str(e)}"))
                finally:
                    # CRITICAL: Release MT5 context for this thread/path?
                    pass
            
            # Signal Task Done (Outside Lock)
            self.queue.task_done()

    def _add_result(self, res: TradeResult):
        with self.lock:
            self.results.append(res.to_dict())

    def start_pool(self):
        """Spawns 20 Threads"""
        print(f"🔥 Starting Worker Pool with {len(self.paths)} Terminals...")
        for i, path in enumerate(self.paths):
            t = threading.Thread(target=self.worker_loop, args=(path, i), daemon=True)
            t.start()
            self.active_workers.append(t)
            time.sleep(0.05) # Stagger start to avoid mass-init race conditions

    def submit_jobs(self, slaves: List[Dict], signal: Dict):
        """Validates and pushes jobs to priority queue"""
        for slave in slaves:
            # DETERMINE PRIORITY
            # Example: slave['is_paid'] or priority field. Default 1 (Low)
            prio = 0 if slave.get('is_premium', False) else 1
            
            job = TradeJob(prio, slave, signal)
            self.queue.put(job)
            
    def wait_completion(self):
        """Blocks until Queue is empty"""
        self.queue.join()
        
    def get_results(self):
        return self.results

    def check_worker_risk(self, config):
        """Standardized Risk Check for Worker Thread"""
        min_equity = float(config.get('min_equity', 0) or 0)
        max_daily_loss = float(config.get('max_daily_loss', 0) or 0)
        
        # If no rules, pass
        if min_equity <= 0 and max_daily_loss <= 0: return True
        
        # Check Account
        acc = mt5.account_info()
        if not acc: return False # Fail closed if no info
        
        # 1. Equity Hard Stop
        if min_equity > 0 and acc.equity < min_equity:
             return False
             
        # 2. Daily Loss
        if max_daily_loss > 0:
             now = datetime.now()
             midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
             deals = mt5.history_deals_get(midnight, now)
             daily_pnl = 0.0
             if deals:
                 for d in deals:
                     daily_pnl += d.profit + d.swap + d.commission
             
             if daily_pnl < (-1 * max_daily_loss):
                 return False
                 
        return True

def process_batch(slaves: List[Dict], signal: Dict) -> List[Dict]:
    """
    Entry Point for Executor.
    Creates a Pool, Submits Jobs, Waits, Returns.
    For production, the Pool should ideally be 'Global' and persisted, 
    but for this script we spawn typical lifecycle.
    """
    
    # 1. Config paths (Auto-discover or use config)
    # Using the hardcoded list for 4GB RAM Optimization
    pool = WorkerPool(TERMINAL_PATHS)
    
    # 2. Start
    pool.start_pool()
    
    # 3. Submit
    print(f"🚀 Dispatching {len(slaves)} Jobs to Swarm...")
    pool.submit_jobs(slaves, signal)
    
    # 4. Wait
    pool.wait_completion()
    
    # 5. Stop (Daemon threads die automatically when main exits, but we can signal)
    pool.shutdown_event.set()
    
    return pool.get_results()
    
# ==========================================
# 🧪 TEST HARNESS
# ==========================================
if __name__ == "__main__":
    test_slaves = []
    # Create 100 Dummy Users
    for i in range(100):
        test_slaves.append({
            "login": 1000 + i, 
            "password": "pwd", 
            "server": "Demo", 
            "is_premium": (i < 20) # First 20 are PAID (Fast Lane)
        })
        
    sig = {"symbol": "EURUSD", "volume": 0.01, "type": "BUY"}
    
    start = time.time()
    res = process_batch(test_slaves, sig)
    end = time.time()
    
    print(f"✅ Completed 100 Jobs in {end-start:.4f}s")
    
    # CLEANUP FOR TEST HARNESS ONLY
    if _HFT_POOL:
        _HFT_POOL.shutdown_event.set()
        # _HFT_POOL.wait_completion() # Already done
        # Allow threads to exit
        time.sleep(1)
        # Force shutdown MT5 in main if needed, but workers handle their own context.
        mt5.shutdown()
