
import MetaTrader5 as mt5
import time
import queue
import threading
import os
from typing import List, Dict, Any, Optional
from datetime import datetime
import json


# Global Pool Singleton
_HFT_POOL = None

# 🔒 GLOBAL MT5 MUTEX (Single Terminal Safety)
# Essential when 20 threads share 1 terminal (Single Machine HFT)
MT5_GLOBAL_LOCK = threading.RLock()

# 🚀 HFT CONFIGURATION
# Auto-Switch: Use Grid (Instances 05-20) for Followers. 01-04 Reserved for Masters.
MAX_TERMINALS = 20  
GRID_PATH_TEMPLATE = "C:/MT5_Instance_{i:02d}/terminal64.exe"

# Detect if Grid Exists (Partitioning Strategy)
# Check specifically for the Follower Partition (05+)
follower_paths = []
for i in range(5, MAX_TERMINALS + 1):
    path = GRID_PATH_TEMPLATE.format(i=i)
    if os.path.exists(path):
        follower_paths.append(path)

if follower_paths:
    TERMINAL_PATHS = follower_paths
    print(f"[HFT] 🏎️ Grid Mode Detected: {len(TERMINAL_PATHS)} Isolated Terminals (Partition 5-20).")
    print(f"[HFT]    - Reserved for Followers (Isolation Active)")
else:
    # Single Machine Mode (Wait for Override)
    print(f"[HFT] ⚠️ Single Machine Detected. Waiting for Configuration...")
    TERMINAL_PATHS = [] # Will be populated by configure_swarm

def configure_swarm(path_arg: str):
    """Called by Parent Process to override defaults"""
    global TERMINAL_PATHS
    
    if path_arg and os.path.exists(path_arg):
        print(f"[HFT] 🔧 Configuring Swarm with Real Terminal: {path_arg}")
        print(f"[HFT]    🚀 REAL TRADING ENABLED (Capacity: 4 Threads / 1 Terminal)")
        TERMINAL_PATHS = [path_arg] * 4
    elif not TERMINAL_PATHS:
        print(f"[HFT] ⚠️ No Grid & No Override Path. Defaulting to VIRTUAL MODE.")
        TERMINAL_PATHS = ["MOCK"] * 4


# Context Object
class TradeJob:
    """Represents a single trade execution task"""
    def __init__(self, priority: int, slave_config: Dict, signal: Dict):
        self.priority = priority # 0 = High (Paid), 1 = Low (Free)
        self.slave_config = slave_config
        self.signal = signal
        
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
        Waits for jobs from the Queue.
        """
        while not self.shutdown_event.is_set():
            try:
                # 2. 📥 GET JOB
                job: TradeJob = self.queue.get(timeout=1.0) 
            except queue.Empty:
                continue 

            # 3. ⚙️ PROCESS JOB
            start_time = time.time()
            login_id = 0
            
            try:
                login_id = int(job.slave_config.get('login', 0))

                with MT5_GLOBAL_LOCK:
                    # CRITICAL SECTION: SWITCH CONTEXT
                    
                    if terminal_path == "MOCK":
                        # 🟢 VIRTUAL EXECUTION PATH
                        time.sleep(0.005 + (0.01 * (worker_id % 5))) 
                        import random
                        fake_deal = random.randint(5000000, 9000000)
                        action = job.signal.get('action', 'OPEN')
                        self._add_result(TradeResult(login_id, True, time.time()-start_time, fake_deal, f"Virtual {action}", 999.99, 0.01, 0.0, action))
                        continue # FINALLY block will call task_done()

                    if not mt5.initialize(path=terminal_path):
                        self._add_result(TradeResult(0, False, 0, message=f"Init Failed: {terminal_path}"))
                        continue
                        
                    # AUTHENTICATION
                    creds = job.slave_config
                    login_id = int(creds.get('login', 0))
                    
                    # Login Check (Optimization: Don't re-login if same)
                    current_info = mt5.account_info()
                    if not current_info or current_info.login != login_id:
                        if not mt5.login(login=login_id, password=creds.get('password'), server=creds.get('server')):
                             self._add_result(TradeResult(login_id, False, 0, message=f"Login Failed: {mt5.last_error()}"))
                             continue
                    
                    # EXECUTION ROUTER (Pure Logic)
                    action = job.signal.get('action', 'OPEN')
                    symbol = job.signal.get('symbol')
                    master_ticket = job.signal.get('ticket') # This is MASTER ticket
                    session_id = job.slave_config.get('session_id', 0)
                    
                    comment_tag = f"CPY:S{session_id}:{master_ticket}" if session_id > 0 else f"CPY:{master_ticket}"
                    
                    request = {
                        "action": mt5.TRADE_ACTION_DEAL,
                        "symbol": symbol,
                        "volume": float(job.signal.get('volume', 0.01)),
                        "magic": 234000,
                        "comment": comment_tag, 
                        "type_time": mt5.ORDER_TIME_GTC,
                        "type_filling": mt5.ORDER_FILLING_IOC,
                    }
                    
                    # --- CASE 1: OPEN TRADE ---
                    if action == 'OPEN':
                        tick = mt5.symbol_info_tick(symbol)
                        if not tick:
                             self._add_result(TradeResult(login_id, False, 0, message=f"Symbol Error: {symbol}"))
                             continue
                             
                        trade_type = mt5.ORDER_TYPE_BUY if job.signal.get('type') == 'BUY' else mt5.ORDER_TYPE_SELL
                        price = tick.ask if trade_type == mt5.ORDER_TYPE_BUY else tick.bid
                        
                        request.update({
                            "type": trade_type,
                            "price": price,
                            "sl": float(job.signal.get('sl', 0.0) or 0.0),
                            "tp": float(job.signal.get('tp', 0.0) or 0.0)
                        })

                    # --- CASE 2: MODIFY TRADE (SL/TP) ---
                    elif action == 'MODIFY':
                        # Must find LOCAL ticket. job.signal['ticket'] is MASTER ticket.
                        injected_ticket = job.slave_config.get('target_ticket', 0)
                        local_ticket = injected_ticket
                        
                        if local_ticket == 0:
                            # 🩹 FALLBACK SCAN: Look for CPY:{master}
                            # Stub logic depends on comment tag used in OPEN
                            # Default Tag: CPY:{master_ticket} OR CPY:S{session}:{master_ticket}
                            # We search for SUBSTRING match of the Master Ticket.
                            search_term = f":{master_ticket}" 
                            
                            all_pos = mt5.positions_get(symbol=symbol) # Optimize: Filter by symbol
                            found = False
                            if all_pos:
                                for p in all_pos:
                                    if p.magic == 234000 and search_term in p.comment:
                                        local_ticket = p.ticket
                                        found = True
                                        break
                            
                            if not found:
                                self._add_result(TradeResult(login_id, False, 0, message=f"Modify Fail: Map Missing & Scan Failed for {master_ticket}"))
                                continue
                        
                        sl_val = float(job.signal.get('sl', 0.0) or 0.0)
                        tp_val = float(job.signal.get('tp', 0.0) or 0.0)
                        
                        request = {
                            "action": mt5.TRADE_ACTION_SLTP,
                            "position": local_ticket,
                            "sl": sl_val,
                            "tp": tp_val
                        }
                        
                    # --- CASE 3: CLOSE TRADE ---
                    elif action == 'CLOSE':
                        injected_ticket = job.slave_config.get('target_ticket', 0)
                        local_ticket = injected_ticket 
                        
                        if local_ticket == 0:
                            # 🩹 FALLBACK SCAN
                            search_term = f":{master_ticket}"
                            all_pos = mt5.positions_get(symbol=symbol)
                            found = False
                            if all_pos:
                                for p in all_pos:
                                    if p.magic == 234000 and search_term in p.comment:
                                        local_ticket = p.ticket
                                        found = True
                                        break
                            
                            if not found:
                                # Position already closed?
                                self._add_result(TradeResult(login_id, True, 0, message="Close: Already Closed / Not Found"))
                                continue
                        
                        pos_info = mt5.positions_get(ticket=local_ticket)
                        if not pos_info:
                             self._add_result(TradeResult(login_id, True, 0, message="Close: Already Closed"))
                             continue
                        
                        p_obj = pos_info[0]
                        close_type = mt5.ORDER_TYPE_SELL if p_obj.type == mt5.ORDER_TYPE_BUY else mt5.ORDER_TYPE_BUY
                        
                        tick = mt5.symbol_info_tick(symbol)
                        if not tick:
                             self._add_result(TradeResult(login_id, False, 0, message=f"Close Fail: Symbol {symbol}"))
                             continue
                        
                        price = tick.bid if close_type == mt5.ORDER_TYPE_SELL else tick.ask
                        
                        request.update({
                            "action": mt5.TRADE_ACTION_DEAL,
                            "type": close_type,
                            "position": local_ticket,
                            "price": price, 
                            "volume": p_obj.volume, # ✅ Use ACTUAL volume
                            "comment": "CPY_CLOSE"
                        })

                    # FIRE 🔥
                    # 🛡️ LAST-MILE SAFETY CHECK: Ensure we are still on the correct account
                    pre_fire_info = mt5.account_info()
                    if not pre_fire_info or pre_fire_info.login != login_id:
                         msg = f"CRITICAL: Account Drift! Expected {login_id}, Found {pre_fire_info.login if pre_fire_info else 'None'}. Aborting."
                         print(f"       -> [🛑] {msg}")
                         self._add_result(TradeResult(login_id, False, 0, message=msg))
                         continue

                    res = mt5.order_send(request)
                    end_time = time.time()
                    duration = end_time - start_time
                    
                    if res.retcode == mt5.TRADE_RETCODE_DONE:
                        # SUCCESS
                        # Use ORDER ticket as it becomes the POSITION ticket
                        deal_id = res.order 
                        res_obj = TradeResult(login_id, True, duration, deal_id=deal_id, profit=0.0)
                        self._add_result(res_obj)
                        print(f"       -> Slave {login_id}: ✅ {action} Done (Ticket: {deal_id})")
                    else:
                        # FAIL
                        msg = f"MT5 Error: {res.comment} ({res.retcode})"
                        # DEBUG
                        print(f"[DEBUG] Failed Req: {request}")
                        self._add_result(TradeResult(login_id, False, duration, message=msg))
                        print(f"       -> Slave {login_id}: ❌ {msg}")
                        
            except Exception as e:
                import traceback
                traceback.print_exc()
                self._add_result(TradeResult(login_id, False, 0, message=str(e)))
            finally:
                # 🛑 CRITICAL: Ensure task_done is called ONCE per job
                self.queue.task_done()

    def _add_result(self, res: TradeResult):
        with self.lock:
            self.results.append(res.to_dict())

    def start_pool(self):
        """Spawns the workers"""
        print(f"🔥 Starting Worker Pool with {len(self.paths)} Terminals...")
        for i, path in enumerate(self.paths):
            t = threading.Thread(target=self.worker_loop, args=(path, i+1), daemon=True)
            self.active_workers.append(t)
            t.start()
            time.sleep(0.05) 

    def submit_jobs(self, slaves: List[Dict], signal: Dict):
        """
        Takes a list of slave configs and a signal.
        Distributes them to the Queue.
        """
        for s in slaves:
            prio = 0 if s.get('is_premium') else 1
            job = TradeJob(prio, s, signal)
            self.queue.put(job)
            
    def wait_completion(self):
        """Blocking wait until queue empty"""
        self.queue.join()
        
    def get_results(self):
        return self.results


def init_persistent_engine():
    """Starts the HFT Pool and keeps it alive"""
    global _HFT_POOL
    if not _HFT_POOL:
        _HFT_POOL = WorkerPool(TERMINAL_PATHS)
        _HFT_POOL.start_pool()
        print(f"[HFT] 🔥 Persistent High-Speed Pool Started ({len(TERMINAL_PATHS)} Threads)")

def dispatch_jobs(slaves: List[Dict], signal: Dict) -> List[Dict]:
    """
    Dispatches jobs to the LIVE pool.
    """
    global _HFT_POOL
    if not _HFT_POOL: init_persistent_engine()
    
    # Reset Results for this batch 
    _HFT_POOL.results = [] 
    
    print(f"🚀 Dispatching {len(slaves)} Jobs to Swarm...")
    _HFT_POOL.submit_jobs(slaves, signal)
    
    # Wait for completion (Blocking)
    _HFT_POOL.wait_completion()
    
    return _HFT_POOL.get_results()

# Alias for compatibility with executor.py
def process_batch(slaves: List[Dict], signal: Dict) -> List[Dict]:
    return dispatch_jobs(slaves, signal)

# ==========================================
# 🧪 TEST HARNESS
# ==========================================
if __name__ == "__main__":
    pass
