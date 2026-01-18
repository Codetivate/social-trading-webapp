
import MetaTrader5 as mt5
import time
import queue
import threading
import os
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import json


# Global Pool Singleton
_HFT_POOL = None

# ⚙️ REDIS FOR HFT MAPPING
import redis
r_client_hft = None
try:
    # 🔒 STRICT POOLING: Limit to 5 connections max
    _hft_redis_pool = redis.ConnectionPool.from_url(os.getenv("REDIS_URL", "redis://localhost:6379"), max_connections=5, decode_responses=True)
    r_client_hft = redis.Redis(connection_pool=_hft_redis_pool)
except Exception as e:
    print(f"[HFT] ⚠️ Redis Connection Failed: {e}")

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
    print(f"[HFT] Single Machine Detected. Waiting for Configuration...")
    TERMINAL_PATHS = [] # Will be populated by configure_swarm

# 🧠 SMART SYMBOL NORMALIZATION (Ported from executor.py)
# ---------------------------------------------------------
SUFFIXES = ["", "m", "c", "b", "z", ".m", ".c", ".s", ".std", ".pro", ".r", "_i", ".p", ".ecn", "#", "ft", "ft.r", ".t"]
PREFIXES = ["m", "M", "i", "pro.", ".", "#", "b"]

SYNONYM_GROUPS = [
    set(["GOLD", "XAUUSD", "GC", "MGC", "QO"]),
    set(["SILVER", "XAGUSD", "SI", "SIL"]),
    set(["US30", "DJ30", "YM", "MYM", "WallStreet", "US30Cash"]),
    set(["US500", "SP500", "ES", "MES", "SPX500"]),
    set(["US100", "NAS100", "NQ", "MNQ", "USTECH"]),
    set(["USOIL", "WTI", "CL", "QM", "MCL", "XTIUSD"]),
    set(["UKOIL", "BRENT", "LCO", "XBRUSD"]),
    set(["GER30", "DAX30", "DAX40", "DE30", "DE40"]),
    set(["BTCUSD", "Bitcoin", "BTC"]),
]

FUTURES_ROOTS = {
    "XAUUSD": ["GC", "MGC"], "GOLD": ["GC", "MGC"],
    "US500": ["ES", "MES"], "US100": ["NQ", "MNQ"], "US30": ["YM", "MYM"],
    "SET50": ["S50"]
}

def resolve_dynamic_future(base_root):
    """Simple check for futures like GCZ25"""
    months = ["F","G","H","J","K","M","N","Q","U","V","X","Z"]
    years = ["25","26","27","5","6","7"]
    for y in years:
        for m in months:
            candidate = f"{base_root}{m}{y}"
            if mt5.symbol_select(candidate, True): return candidate
    return None

def ensure_symbol(raw_symbol):
    """
    Robustly attempts to select the symbol, handling suffix/prefix mismatches, synonyms, and fuzzy matches.
    """
    if not raw_symbol: return None
    clean_input = raw_symbol.strip()
    
    # 1. Direct Try
    if mt5.symbol_select(clean_input, True): return clean_input
    
    # 2. Try Suffixes
    for s in SUFFIXES:
         candidate = f"{clean_input}{s}"
         if mt5.symbol_select(candidate, True): return candidate

    # 3. Strip & Re-Suffix logic
    # Detect if input HAS a suffix we should strip?
    # Or just strip widely.
    base_candidates = set()
    base_candidates.add(clean_input)
    
    # Attempt to strip known suffixes from input
    for s in SUFFIXES:
        if s and clean_input.endswith(s):
            stripped = clean_input[:-len(s)]
            if stripped: base_candidates.add(stripped)
            
    # Also strip known prefixes
    for p in PREFIXES:
        if p and clean_input.startswith(p):
            stripped = clean_input[len(p):]
            if stripped: base_candidates.add(stripped)

    # PROCESS CANDIDATES (Original + Stripped)
    for base in base_candidates:
        # A. Check Base Direct
        if mt5.symbol_select(base, True): return base
        
        # B. Check Base + Suffixes
        for s in SUFFIXES:
            if mt5.symbol_select(f"{base}{s}", True): return f"{base}{s}"
            
        # C. Check Synonyms of Base
        found_group = next((g for g in SYNONYM_GROUPS if base in g), None)
        if found_group:
            for synonym in found_group:
                if synonym == base: continue
                # Syn Direct
                if mt5.symbol_select(synonym, True): return synonym
                # Syn + Suffixes
                for s in SUFFIXES:
                    if mt5.symbol_select(f"{synonym}{s}", True): return f"{synonym}{s}"
                # Syn Futures
                fut = resolve_dynamic_future(synonym)
                if fut: return fut

        # D. Check Futures of Base
        fut = resolve_dynamic_future(base)
        if fut: return fut

    # 4. 🚨 FUZZY FALLBACK (Last Resort)
    # If we are here, we failed to match. 
    # Scan ALL symbols for a containment match if input is long enough.
    # e.g. Input: "US30Cash" -> Matches "US30Cache.pro"
    if len(clean_input) >= 3:
        try:
            # Check for generic containment of the primary part
            # Use the shortest candidate as key (most likely the root)
            root_key = min(base_candidates, key=len)
            if len(root_key) < 3: root_key = clean_input 
            
            # Get all symbols? Too heavy?
            # Optimization: Try `symbols_get` with root_key as partial?
            # mt5.symbols_get() doesn't support wildcards in Python API properly usually?
            # Docs say: symbols_get(group="*EUR*")
            matches = mt5.symbols_get(group=f"*{root_key}*")
            if matches:
                # Pick the first one that is "visible" or select it
                for s in matches:
                    if mt5.symbol_select(s.name, True): 
                        print(f"       -> [🔍] Fuzzy Match: {clean_input} -> {s.name}")
                        return s.name
        except: pass

    return None
# ---------------------------------------------------------
def calculate_safe_lot(master_lot_size, equity, leverage, risk_factor_percent, symbol="EURUSD", mode="FIXED", master_equity=0.0, allocation=0.0):
    """
    🧮 PRO-RATA + EQUITY RATIO CALCULATION (HFT Port)
    Uses MT5 Native Margin Calculation for precision.
    """
    multiplier = risk_factor_percent / 100.0

    # 1. Determine Raw Lot based on Mode
    raw_lot = 0.0
    
    if mode == "EQUITY" and master_equity > 0 and (equity > 0 or allocation > 0):
        # ⚖️ EQUITY RATIO MODE
        # Formula: MasterLot * (FollowerBasis / MasterEquity) * (UserMultiplier)
        # Basis: Use Allocation if set (>0), otherwise fallback to Total Equity.
        basis = allocation if allocation > 0 else equity
        
        equity_ratio = basis / master_equity
        raw_lot = master_lot_size * equity_ratio * multiplier
        # print(f"   [CALC] Ratio: {basis:.2f} (Alloc={allocation>0}) / {master_equity:.2f} = {equity_ratio:.2f}x -> Lot {raw_lot:.2f}")
    else:
        # 📏 FIXED RATIO MODE (Legacy / Fallback)
        raw_lot = master_lot_size * multiplier 
    
    # 2. Broker Limits (Min/Max/Step)
    sym_info = mt5.symbol_info(symbol)
    if not sym_info:
        return round(raw_lot, 2)
        
    min_lot = sym_info.volume_min
    max_lot = sym_info.volume_max
    step_lot = sym_info.volume_step
    
    # Round to Step
    if step_lot > 0:
        raw_lot = round(raw_lot / step_lot) * step_lot
        
    # Clamp
    final_lot = max(min_lot, min(raw_lot, max_lot))
    
    # 3. Margin Safety Check (Native MT5)
    needed_margin = 0.0
    price = sym_info.ask
    
    # Try Native Calc first (Best Limit)
    try:
        margin_native = mt5.order_calc_margin(mt5.ORDER_TYPE_BUY, symbol, final_lot, price)
        if margin_native:
            needed_margin = margin_native
        else:
            raise ValueError("Native Calc returned None")
    except:
        # 🩹 Fallback: Manual Calc with Heuristic Contract Size
        contract_size = sym_info.trade_contract_size
        if contract_size < 1: 
            # Smart Guess
            if "XAU" in symbol or "GOLD" in symbol: contract_size = 100
            elif "JPY" in symbol: contract_size = 100000 
            elif "BTC" in symbol: contract_size = 1
            else: contract_size = 100000 # Forex Standard
            
        if leverage < 1: leverage = 500 
        needed_margin = (final_lot * contract_size * price) / leverage

    # 🛡️ SAFETY
    account = mt5.account_info() 
    if account:
        free_margin = account.margin_free
        # Buffer: Require 110% of margin just to be safe
        required_buffer = needed_margin * 1.0 # Strict for now, or 1.1

        if free_margin < required_buffer:
            print(f"       -> [RISK] ⚠️ Insufficient Margin for {final_lot} lots. (Need: {needed_margin:.2f}, Free: {free_margin:.2f})")
            
            # 🛑 FORCE MIN LOT?
            # Calculate Margin for Min Lot
            min_margin = 0.0
            try:
                min_margin = mt5.order_calc_margin(mt5.ORDER_TYPE_BUY, symbol, min_lot, price)
            except: 
                min_margin = (min_lot * (100 if "XAU" in symbol else 100000) * price) / 500

            if min_margin and free_margin > min_margin:
                print(f"       -> [RISK] 📉 Downgrading to MIN LOT ({min_lot}) to survive.")
                return min_lot
            else:
                 print(f"       -> [RISK] ❌ CRITICAL: Cannot afford Min Lot ({min_margin:.2f}). Skipping.")
                 return 0.0 # Skip
                 
    return round(final_lot, 2)


def configure_swarm(path_arg: str):
    """Called by Parent Process to override defaults"""
    global TERMINAL_PATHS
    
    if path_arg and os.path.exists(path_arg):
        print(f"[HFT] 🔧 Configuring Swarm with Real Terminal: {path_arg}")
        print(f"[HFT]    🚀 REAL TRADING ENABLED (Force Single-Thread for Safety)")
        TERMINAL_PATHS = [path_arg] # Single Thread to prevent race conditions in Turbo Mode
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
    def __init__(self, account_id: int, success: bool, execution_time: float, deal_id: int = 0, message: str = "", price: float = 0.0, volume: float = 0.0, profit: float = 0.0, type: str = "", deal_data: Dict = None):
        self.account_id = account_id
        self.success = success
        self.execution_time = execution_time
        self.deal_id = deal_id
        self.message = message
        self.price = price
        self.volume = volume
        self.profit = profit
        self.type = type
        self.deal_data = deal_data or {}

    def to_dict(self):
        base = {
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
        if self.deal_data:
            base.update(self.deal_data)
            
        # 🛡️ FORCE TICKET ID IDENTITY
        # deal_data contains 'ticket' (The Deal/Transaction Ticket).
        # We want to report the POSITION TICKET (self.deal_id) as the main identifier for the DB.
        # This fixes the "Modify Fail" caused by DB storing Deal ID.
        base['ticket'] = self.deal_id 

        return base

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
            # DEBUG: Trace Job Pickup
            # print(f"[DEBUG-WORKER] Picked up Job for {job.slave_config.get('login')}")

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
                        
                    
                    # 3. 🔒 REDIS LOCK (Broadcast Visibility)
                    # Use same key derivation as Broadcaster to signal "Worker Busy"
                    redis_lock_key = None
                    if r_client_hft:
                        try:
                            lock_seed = terminal_path if terminal_path else "default"
                            lock_seed = os.path.normpath(str(lock_seed)).lower().strip()
                            import hashlib
                            path_hash = hashlib.md5(lock_seed.encode()).hexdigest()
                            redis_lock_key = f"lock:terminal:{path_hash}"
                            r_client_hft.set(redis_lock_key, f"HFT_WORKER_{login_id}", ex=10)
                        except: pass

                    # AUTHENTICATION
                    creds = job.slave_config
                    login_id = int(creds.get('login', 0))
                    
                    # 🛡️ SAFETY GUARD: Prevent Master Self-Copy
                    # Ensure we never place a copy trade ON the Master account itself.
                    sig_master_id_str = str(job.signal.get('masterId', ''))
                    follower_uuid = str(job.slave_config.get('follower_id', ''))
                    
                    # 1. Check UUID Match (User Level Loopback)
                    if sig_master_id_str and follower_uuid and sig_master_id_str == follower_uuid:
                         msg = f"Skipped: Loopback Protection (Slave UUID {follower_uuid} == Master UUID)"
                         self._add_result(TradeResult(login_id, False, 0, message=msg))
                         print(f"       -> Slave {login_id}: 🛑 {msg}")
                         if redis_lock_key and r_client_hft: r_client_hft.delete(redis_lock_key)
                         continue

                    # 2. Check MT5 Login Match (Account Level Loopback)
                    # Handle case where masterId in signal IS the MT5 Login (Numeric String)
                    sig_master_login = int(job.signal.get('master_login', 0))
                    
                    if (sig_master_id_str.isdigit() and int(sig_master_id_str) == login_id) or (sig_master_login != 0 and sig_master_login == login_id):
                         msg = f"Skipped: Loopback Protection (Slave {login_id} == Master {sig_master_id_str}/{sig_master_login})"
                         self._add_result(TradeResult(login_id, False, 0, message=msg))
                         print(f"       -> Slave {login_id}: 🛑 {msg}")
                         if redis_lock_key and r_client_hft: r_client_hft.delete(redis_lock_key)
                         continue
                    
                    # Login Check (Optimization: Don't re-login if same)
                    current_info = mt5.account_info()
                    if not current_info or current_info.login != login_id:
                        if not mt5.login(login=login_id, password=creds.get('password'), server=creds.get('server')):
                             msg = f"Login Failed: {mt5.last_error()}"
                             self._add_result(TradeResult(login_id, False, 0, message=msg))
                             print(f"       -> Slave {login_id}: ❌ {msg}")
                             if redis_lock_key and r_client_hft: r_client_hft.delete(redis_lock_key)
                             continue
                        
                        # 🛡️ SYNC GUARD: Wait for MT5 state to stabilize after switch
                        # Prevents "Positions=0" race condition immediately after login
                        time.sleep(0.5)

                    # 🧐 MARGIN STABILIZER (Fixes False Positive "Insufficient Margin: 0.00")
                    for _ in range(5):
                        acct_chk = mt5.account_info()
                        if acct_chk and acct_chk.margin_free > 0: break
                        if acct_chk and acct_chk.balance > 0 and acct_chk.margin_free == 0.0:
                             time.sleep(0.2) # Wait for hydration
                        else:
                             break 
                    
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
                        # 0. 🛡️ ROBUST SYMBOL SELECTION (First!)
                        # Must ensure symbol exists to get correct Step/Min Lot for Safe Calc
                        clean_symbol = ensure_symbol(symbol)
                        if not clean_symbol:
                             msg = f"Symbol Not Found: {symbol}"
                             self._add_result(TradeResult(login_id, False, 0, message=msg))
                             print(f"       -> Slave {login_id}: ❌ {msg}")
                             continue
                        
                        symbol = clean_symbol # Update to actual available symbol

                        # 1. ⚖️ PRO-RATA / EQUITY RATIO CALCULATION
                        # We are already logged in context.
                        risk_val = float(job.slave_config.get('risk_factor', 100.0))
                        m_lot = float(job.signal.get('volume', 0.01))
                        
                        # 🆕 Extract Mode & Master Equity & Allocation
                        copy_mode = job.slave_config.get('copy_mode', 'FIXED')
                        master_eq = float(job.signal.get('master_equity', 0.0))
                        allocation = float(job.slave_config.get('allocation', 0.0))
                        
                        # [DEBUG]
                        # print(f"       -> [DEBUG-JOB] Keys: {list(job.slave_config.keys())} | AllocRaw: {job.slave_config.get('allocation')}")

                        acct = mt5.account_info()
                        if acct:
                            print(f"       -> [DEBUG-CALC] Slave {login_id}: Mode={copy_mode}, Alloc={allocation}, MasterEq={master_eq}, SlaveEq={acct.equity}")
                            safe_vol = calculate_safe_lot(m_lot, acct.equity, acct.leverage, risk_val, symbol, mode=copy_mode, master_equity=master_eq, allocation=allocation)
                            if safe_vol <= 0:
                                msg = "SKIPPED: Margin/Risk Limit Reached"
                                self._add_result(TradeResult(login_id, False, 0, message=msg))
                                print(f"       -> Slave {login_id}: 🛑 {msg}")
                                continue
                            
                            # Update Request Volume
                            request['volume'] = safe_vol
                            print(f"       -> Slave {login_id}: ⚖️ {copy_mode} {m_lot} -> {safe_vol} (Risk: {risk_val}%)")

                        tick = mt5.symbol_info_tick(symbol)
                        if not tick:
                             # Retry once
                             time.sleep(0.2)
                             tick = mt5.symbol_info_tick(symbol)
                        
                        if not tick:
                             msg = f"No Tick Data: {symbol}"
                             self._add_result(TradeResult(login_id, False, 0, message=msg))
                             print(f"       -> Slave {login_id}: ❌ {msg}")
                             continue
                        
                        # 🛡️ DUPLICATE GUARD: Check if we already have this trade
                        # This prevents "Ghost" catch-up from opening duplicates if we restarted
                        # or if a signal was processed twice.
                        is_duplicate = False
                        
                        # Only scan if we have a ticket to track (we always do for Copy)
                        if master_ticket:
                            dup_scan = mt5.positions_get(symbol=symbol)
                            if dup_scan:
                                str_m_ticket = str(master_ticket)
                                for p in dup_scan:
                                    # 🛡️ RELAXED: Trust "CPY:" in comment, ignore Magic
                                    try:
                                        if "CPY:" in p.comment:
                                            parts = p.comment.split(':')
                                            if len(parts) > 1:
                                                existing_id = parts[-1].strip().split(' ')[0]
                                                if existing_id == str_m_ticket:
                                                    is_duplicate = True
                                                    self._add_result(TradeResult(login_id, True, 0, message=f"Duplicate Prevented: Found {p.ticket}"))
                                                    print(f"       -> [🛡️] Duplicate Guard: Aborted {master_ticket}. Already have {p.ticket}.")
                                                    
                                                    # 🗺️ HEAL MAP: Ensure we track this existing trade
                                                    f_uuid = job.slave_config.get('follower_id')
                                                    if f_uuid:
                                                        self._save_ticket_map(master_ticket, p.ticket, f_uuid)
                                                    break
                                    except: pass

                        if is_duplicate: continue

                        # Proceed with OPEN
                        sig_type = job.signal.get('type')
                        invert = job.slave_config.get('invert_copy', False)
                        
                        if invert:
                            # 🔄 INVERT: Swap Buy/Sell
                            trade_type = mt5.ORDER_TYPE_SELL if sig_type == 'BUY' else mt5.ORDER_TYPE_BUY
                            print(f"       -> Slave {login_id}: 🔄 INVERTED {sig_type} -> {'SELL' if trade_type == mt5.ORDER_TYPE_SELL else 'BUY'}")
                        else:
                            trade_type = mt5.ORDER_TYPE_BUY if sig_type == 'BUY' else mt5.ORDER_TYPE_SELL

                        price = tick.ask if trade_type == mt5.ORDER_TYPE_BUY else tick.bid
                        
                        # Calculate SL/TP
                        sl_raw = float(job.signal.get('sl', 0.0) or 0.0)
                        tp_raw = float(job.signal.get('tp', 0.0) or 0.0)
                        m_entry = float(job.signal.get('price', 0.0)) # Master Entry Px
                        
                        final_sl = sl_raw
                        final_tp = tp_raw
                        
                        if invert:
                            # 🧠 INVERTED RANGE LOGIC (User Request):
                            # Master SL Range -> Follower TP Range (Profit from Master Loss)
                            # Master TP Range -> Follower SL Range (Loss from Master Profit)
                            
                            # 1. Calc Ranges (Absolute Distance)
                            dist_sl = abs(m_entry - sl_raw) if sl_raw > 0 else 0.0
                            dist_tp = abs(m_entry - tp_raw) if tp_raw > 0 else 0.0
                            
                            # 2. Apply to Local Entry (Direction Aware)
                            # If we are BUYING (Master Sold), we want Price UP.
                            # If Master Sold, their SL is ABOVE. Their TP is BELOW.
                            # We want our SL to hit when they hit TP (Below).
                            # We want our TP to hit when they hit SL (Above).
                            
                            if trade_type == mt5.ORDER_TYPE_BUY:
                                # We BUY. 
                                # SL: Price - Master_TP_Dist
                                # TP: Price + Master_SL_Dist
                                if dist_tp > 0: final_sl = round(price - dist_tp, 5)
                                else: final_sl = 0.0
                                
                                if dist_sl > 0: final_tp = round(price + dist_sl, 5)
                                else: final_tp = 0.0
                                
                            else: # SELL
                                # We SELL.
                                # SL: Price + Master_TP_Dist
                                # TP: Price - Master_SL_Dist
                                if dist_tp > 0: final_sl = round(price + dist_tp, 5)
                                else: final_sl = 0.0
                                
                                if dist_sl > 0: final_tp = round(price - dist_sl, 5)
                                else: final_tp = 0.0
                                
                            print(f"       -> Slave {login_id}: 🔄 Inverted Ranges. Dist_SL(Gain)={dist_sl:.5f}, Dist_TP(Risk)={dist_tp:.5f}")
                            print(f"       -> Slave {login_id}: 🔄 Final SL {final_sl}, TP {final_tp}")
                        
                        request.update({
                            "type": trade_type,
                            "symbol": symbol, # 🛡️ CRITICAL: Use NORMALIZED symbol
                            "price": price,
                            "sl": final_sl,
                            "tp": final_tp
                        })

                    # --- CASE 2: MODIFY TRADE (SL/TP) ---
                    elif action == 'MODIFY':
                        # Must find LOCAL ticket. job.signal['ticket'] is MASTER ticket.
                        injected_ticket = job.slave_config.get('target_ticket', 0)
                        local_ticket = injected_ticket
                        
                        if local_ticket == 0:
                            # 🗺️ MAP LOOKUP (HFT Redis)
                            # If Executor didn't inject it, try to resolve it ourselves.
                            f_uuid = job.slave_config.get('follower_id')
                            if r_client_hft and f_uuid:
                                map_key = f"map:ticket:{master_ticket}:{f_uuid}"
                                try:
                                    mapped_str = r_client_hft.get(map_key)
                                    if mapped_str:
                                        local_ticket = int(mapped_str)
                                        # print(f"[DEBUG-WORKER] Resolved Map: {master_ticket} -> {local_ticket}")
                                except: pass

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
                                    # 🛡️ RELAXED MATCH: Trust comment tag, ignore Magic
                                    if search_term in p.comment:
                                        local_ticket = p.ticket
                                        found = True
                                        break
                            
                            if not found:
                                self._add_result(TradeResult(login_id, False, 0, message=f"Modify Fail: Map Missing & Scan Failed for {master_ticket}"))
                                continue
                        
                        sl_val = float(job.signal.get('sl', 0.0) or 0.0)
                        tp_val = float(job.signal.get('tp', 0.0) or 0.0)

                        # 🔍 VERIFY & GET SYMBOL
                        pos_info = mt5.positions_get(ticket=local_ticket)
                        if not pos_info:
                            self._add_result(TradeResult(login_id, False, 0, message=f"Modify Fail: Ticket {local_ticket} not found"))
                            continue
                        
                        p_obj = pos_info[0]
                        local_symbol = p_obj.symbol # ✅ Use explicit symbol
                        
                        # Apply Invert Logic if needed
                        if job.slave_config.get('invert_copy', False):
                             # 🔄 INVERT MODIFY
                             entry_price = p_obj.price_open
                             p_type = p_obj.type
                             m_entry = float(job.signal.get('master_entry', 0.0))
                             
                             if m_entry > 0:
                                 # 1. Calc Ranges
                                 dist_sl_range = abs(m_entry - sl_val) if sl_val > 0 else 0.0
                                 dist_tp_range = abs(m_entry - tp_val) if tp_val > 0 else 0.0
                                 
                                 if p_type == mt5.ORDER_TYPE_BUY:
                                     # BUY: SL(-), TP(+)
                                     if dist_tp_range > 0: sl_val = round(entry_price - dist_tp_range, 5)
                                     else: sl_val = 0.0
                                     if dist_sl_range > 0: tp_val = round(entry_price + dist_sl_range, 5)
                                     else: tp_val = 0.0
                                 else: 
                                     # SELL: SL(+), TP(-)
                                     if dist_tp_range > 0: sl_val = round(entry_price + dist_tp_range, 5)
                                     else: sl_val = 0.0
                                     if dist_sl_range > 0: tp_val = round(entry_price - dist_sl_range, 5)
                                     else: tp_val = 0.0
                                     
                                 print(f"       -> Slave {login_id}: 🔄 Inverted MODIFY. SL:{sl_val} TP:{tp_val}")
                             else:
                                 print(f"       -> Slave {login_id}: ⚠️ Invert Skip: Master Entry Missing.")

                        request = {
                            "action": mt5.TRADE_ACTION_SLTP,
                            "position": local_ticket,
                            "symbol": local_symbol, # ✅ Added Symbol
                            "sl": sl_val,
                            "tp": tp_val
                        }
                        
                    # --- CASE 3: CLOSE TRADE ---
                    elif action == 'CLOSE':
                        print(f"   [DEBUG-WORKER] Processing CLOSE for Master Ticket: {master_ticket}...")
                        injected_ticket = job.slave_config.get('target_ticket', 0)
                        local_ticket = injected_ticket 
                        
                        if local_ticket == 0:
                            # 🗺️ MAP LOOKUP (HFT Redis)
                            f_uuid = job.slave_config.get('follower_id')
                            if r_client_hft and f_uuid:
                                map_key = f"map:ticket:{master_ticket}:{f_uuid}"
                                try:
                                    mapped_str = r_client_hft.get(map_key)
                                    if mapped_str:
                                        local_ticket = int(mapped_str)
                                        # print(f"      [DEBUG-WORKER] Resolved Map via Redis: {master_ticket} -> {local_ticket}")
                                    else:
                                        print(f"      [DEBUG-WORKER] Map Lookup Failed (Key: {map_key}). Trying Scan...")
                                except: pass 
                        
                        # 4. VERIFY EXISTENCE
                        pos_info = mt5.positions_get(ticket=local_ticket)
                        if not pos_info:
                             print(f"      [DEBUG-WORKER] ⚠️ Mapped Ticket {local_ticket} not found in MT5. Falling back to Scan...")
                             local_ticket = 0 # trigger scan below

                        if local_ticket == 0:
                            # 🩹 FALLBACK SCAN (Comment Search)
                            search_term = f":{master_ticket}"
                            
                            if symbol and symbol != "*" and not symbol.startswith('!'):
                                all_pos = mt5.positions_get(symbol=symbol)
                            else:
                                all_pos = mt5.positions_get() # Scan ALL
                                
                            found = False
                            if all_pos:
                                for p in all_pos:
                                    if search_term in p.comment:
                                        local_ticket = p.ticket
                                        found = True
                                        print(f"      [DEBUG-WORKER] ✅ Panic Scan Found Ticket: {local_ticket}")
                                        # 🩹 HEAL MAP
                                        f_uuid = job.slave_config.get('follower_id')
                                        if f_uuid: self._save_ticket_map(master_ticket, local_ticket, f_uuid)
                                        break
                            
                            if not found:
                                # 🕵️ HISTORY CHECK (Fixed): Don't query position=0!
                                # Scan last 7 days of history for the Comment Tag.
                                from_date = datetime.utcnow() - timedelta(days=7)
                                history_deals = mt5.history_deals_get(from_date, datetime.utcnow() + timedelta(hours=1))
                                
                                history_deal = None
                                if history_deals:
                                    search_term_hist = f":{master_ticket}"
                                    for d in history_deals:
                                        # Match Comment AND Ensure it's an Exit Deal
                                        if search_term_hist in d.comment and d.entry in [mt5.DEAL_ENTRY_OUT, mt5.DEAL_ENTRY_OUT_BY, mt5.DEAL_ENTRY_INOUT]:
                                            history_deal = d
                                            # Found the latest one
                                            # Continue searching in case of multiple? No, latest is fine (list is sorted by time?)
                                            # Actually history_deals is usually valid.
                                            # We just break on first match (or last match?)
                                            # Let's take the LAST one found in list (usually most recent)
                                            # break 
                                            pass
                                
                                if history_deal:
                                    print(f"       -> Slave {login_id}: ✅ Found in History (Already Closed). Price: {history_deal.price}")
                                    # ⚡ SYNTHETIC SUCCESS: Mock the result flow to report it
                                    # We construct a TradeResult directly here
                                    
                                    # Calculate PnL/Vol from history
                                    final_profit = history_deal.profit
                                    final_vol = history_deal.volume
                                    
                                    # Report Success
                                    self._add_result(TradeResult(
                                        login_id, True, 0, 
                                        price=history_deal.price, 
                                        volume=final_vol,
                                        message=f"Synced History Close ({history_deal.price})"
                                    ))
                                    if redis_lock_key and r_client_hft: r_client_hft.delete(redis_lock_key)
                                    continue
                                else:
                                    # Truly missing
                                    self._add_result(TradeResult(login_id, True, 0, message="Close: Already Closed / Not Found"))
                                    print(f"       -> Slave {login_id}: ⚠️ Close: Position not found (Map:{injected_ticket} -> Scan Failed -> History Failed)")
                                    if redis_lock_key and r_client_hft: r_client_hft.delete(redis_lock_key)
                                    continue
                            
                            # RE-FETCH Info for the found ticket
                            pos_info = mt5.positions_get(ticket=local_ticket)
                            if not pos_info:
                                self._add_result(TradeResult(login_id, True, 0, message="Close: Ghost Ticket"))
                                continue
                        
                        p_obj = pos_info[0]
                        close_type = mt5.ORDER_TYPE_SELL if p_obj.type == mt5.ORDER_TYPE_BUY else mt5.ORDER_TYPE_BUY
                        
                        # 🛡️ USE ACTUAL SYMBOL from Position (Handle Suffixes)
                        actual_symbol = p_obj.symbol
                        tick = mt5.symbol_info_tick(actual_symbol)
                        if not tick:
                             self._add_result(TradeResult(login_id, False, 0, message=f"Close Fail: Symbol {actual_symbol}"))
                             continue
                        
                        price = tick.bid if close_type == mt5.ORDER_TYPE_SELL else tick.ask
                        
                        # ⚖️ PARTIAL CLOSE CALCULATION
                        # Priority: Percentage (Ratio) > Volume (Absolute)
                        
                        # 1. Determine Target Volume
                        pct = float(job.signal.get('pct', 0.0))
                        
                        if pct > 0:
                            # 🎯 RATIO METHOD (Robust)
                            # If Master closed 50%, we close 50% of OUR volume.
                            raw_target = p_obj.volume * pct
                            calc_method = f"Ratio {pct:.1%}"
                        else:
                            # ⚠️ LEGACY METHOD (Absolute)
                            # Susceptible to drift if our volume != Master * Risk
                            signal_vol = float(job.signal.get('volume', p_obj.volume))
                            risk_val = float(job.slave_config.get('risk_factor', 100.0))
                            raw_target = signal_vol * (risk_val / 100.0)
                            calc_method = f"Vol {signal_vol} * {risk_val}%"
                        
                        # 2. Broker Step/Min Logic
                        sym_info = mt5.symbol_info(actual_symbol)
                        final_vol = p_obj.volume # Default to Full
                        
                        if sym_info:
                            step_vol = sym_info.volume_step
                            min_vol = sym_info.volume_min
                            
                            # Round to Step
                            if step_vol > 0:
                                raw_target = round(raw_target / step_vol) * step_vol
                                
                            # Clamp: At least Min, At most Position Volume
                            calc_vol = max(min_vol, raw_target)
                            
                            # Only cap at available if we exceed it (Close Full)
                            final_vol = min(calc_vol, p_obj.volume)
                            
                            # Float precision fix
                            final_vol = float(round(final_vol, 2))
                            
                        print(f"       -> Slave {login_id}: 📉 Close Calc ({calc_method}): Target={raw_target:.4f} -> {final_vol} (Avail: {p_obj.volume})")

                        request.update({
                            "action": mt5.TRADE_ACTION_DEAL,
                            "symbol": actual_symbol, # <--- IMPORTANT: Match Position Symbol
                            "type": close_type,
                            "position": local_ticket,
                            "price": price, 
                            "volume": final_vol, # ✅ Use CALCULATED Partial Volume
                            "comment": f"CPY:{job.signal.get('ticket')}" 
                        })
                        print(f"[DEBUG-WORKER] Prepared CLOSE Request: {request.get('position')} Vol={request.get('volume')}")

                    # FIRE 🔥
                    # 🛡️ SAFETY RESTORED: Verify Login is Correct (Prevent Master-Copy Loopback)
                    # This adds ~1ms latency but saves us from "Master Duplicate" disasters.
                    current_login = mt5.account_info().login
                    if current_login != int(login_id):
                        print(f"       -> [CRITICAL] 🛑 Account Mismatch! Active: {current_login}, Target: {login_id}")
                        print(f"       -> [CRITICAL] 🔄 Attempting Emergency Switch to {login_id}...")
                        
                        # Emergency Switch
                        switched = mt5.login(login=int(login_id), password=cur_creds['password'], server=cur_creds['server'])
                        if not switched:
                             print(f"       -> [FATAL] ❌ Switch Failed. Aborting Trade.")
                             error_msg = f"Safety Abort: Wrong Account ({current_login} != {login_id})"
                             self._add_result(TradeResult(login_id, False, 0, message=error_msg))
                             continue
                    
                    # Trusted Critical Section (Verified).
                    res = mt5.order_send(request)
                    end_time = time.time()
                    duration = end_time - start_time
                    
                    if res.retcode == mt5.TRADE_RETCODE_DONE:
                        # SUCCESS
                        deal_id = res.deal # ✅ Use DEAL ticket, not ORDER
                        if deal_id == 0: deal_id = res.order # Fallback

                        # 📊 FETCH FULL POSITION HISTORY (Open & Close Data)
                        deal_info = {}
                        
                        # 🔄 RETRY LOOP: MT5 History is Async
                        for attempt in range(3):
                            try:
                                if action == 'CLOSE':
                                    history = mt5.history_deals_get(position=local_ticket)
                                    if history:
                                        # Find Classification
                                        deal_in = None
                                        deal_out = None
                                        for d in history:
                                            if d.entry == mt5.DEAL_ENTRY_IN: deal_in = d
                                            elif d.entry == mt5.DEAL_ENTRY_OUT: deal_out = d

                                        # ✅ Populate Open Data
                                        if deal_in:
                                            deal_info["openPrice"] = deal_in.price
                                            deal_info["openTime"] = int(deal_in.time)
                                        
                                        # ✅ Populate Close Data
                                        target_out = deal_out if deal_out else history[-1]
                                        deal_info.update({
                                            "profit": target_out.profit,
                                            "swap": target_out.swap,
                                            "commission": target_out.commission,
                                            "fee": target_out.fee if hasattr(target_out, 'fee') else 0.0,
                                            "volume": target_out.volume,
                                            "closePrice": target_out.price,
                                            "closeTime": int(target_out.time),
                                            "comment": target_out.comment
                                        })
                                        break # Success
                                else:
                                    # OPEN or MODIFY
                                    history = mt5.history_deals_get(ticket=deal_id)
                                    if history:
                                        d = history[0]
                                        deal_info = {
                                            "openPrice": d.price,
                                            "openTime": int(d.time),
                                            "volume": d.volume,
                                            "commission": d.commission,
                                            "fee": d.fee if hasattr(d, 'fee') else 0.0,
                                            "comment": d.comment
                                        }
                                        break # Success
                            except Exception as e:
                                print(f"[WARN] Fetch History Attempt {attempt+1} Failed: {e}")
                            
                            # Wait logic
                            time.sleep(0.05)
                        
                        # 🩹 FALLBACK: If History Fetch Failed, use Order Result
                        # 🩹 FALLBACK: If History Fetch Failed, use Order Result or Request Price
                        if not deal_info.get('openPrice') and not deal_info.get('closePrice'):
                             print(f"       -> Slave {login_id}: ⚠️ History Empty. Using Order Result Fallback.")
                             fallback_price = 0.0
                             if hasattr(res, 'price') and res.price > 0:
                                 fallback_price = res.price
                             else:
                                 # Last Resort: Use the Tick Price we submitted
                                 fallback_price = request.get('price', 0.0)
                                 
                             fallback_vol = res.volume if hasattr(res, 'volume') else request.get('volume', 0.0)
                             
                             if action == 'CLOSE':
                                 deal_info['closePrice'] = fallback_price
                                 deal_info['volume'] = fallback_vol
                             else:
                                 deal_info['openPrice'] = fallback_price
                                 deal_info['volume'] = fallback_vol

                        # 🎯 Extract Execution Price/Vol for Result
                        exec_price = 0.0
                        exec_vol = 0.0
                        
                        if action == 'CLOSE':
                            exec_price = deal_info.get('closePrice', 0.0)
                            exec_vol = deal_info.get('volume', 0.0)
                        else:
                            exec_price = deal_info.get('openPrice', 0.0)
                            exec_vol = deal_info.get('volume', 0.0)

                        # 🛡️ UNIFIED TICKET RESOLUTION (Position ID)
                        # We MUST ensure the DB and Map get the POSITION ID, not the Deal ID.
                        report_ticket = deal_id # Default
                        
                        if action == 'OPEN':
                            order_id = res.order
                            if order_id == 0:
                                # 🩹 SCAN FALLBACK
                                print(f"       -> Slave {login_id}: ⚠️ Order Ticket is 0. Scanning for Position...")
                                open_positions = mt5.positions_get()
                                search_tag = f"CPY:{master_ticket}"
                                if open_positions:
                                    for p in open_positions:
                                        if search_tag in p.comment:
                                            order_id = p.ticket
                                            print(f"       -> Slave {login_id}: ✅ Found Position Ticket via Scan: {order_id}")
                                            break
                            
                            if order_id > 0:
                                report_ticket = order_id
                        
                        elif action == 'CLOSE':
                            # For Close, we report the DEAL that closed it, but maybe we want the Position ID?
                            # DB usually tracks "Ticket" as the Position.
                            # But Close is terminal.
                            pass

                        res_obj = TradeResult(
                            login_id, 
                            True, 
                            duration, 
                            deal_id=report_ticket, # ✅ Send POS ID to DB
                            profit=deal_info.get('profit', 0.0), 
                            price=exec_price, 
                            volume=exec_vol,
                            type=action, 
                            deal_data=deal_info
                        )
                        self._add_result(res_obj)
                        print(f"       -> Slave {login_id}: ✅ {action} Done (Deal: {deal_id}, Price: {exec_price}, PnL: {deal_info.get('profit', 0)})")
                        
                        # 🗺️ SAVE TICKET MAP (Critical for Modify/Close)
                        # 🗺️ SAVE TICKET MAP (Critical for Modify/Close)
                        # 🛡️ FIX: Use ORDER Ticket for Mapping (Position ID), not DEAL Ticket.
                        # 🗺️ SAVE TICKET MAP (Critical for Modify/Close)
                        # 🛡️ FIX: Use ORDER Ticket for Mapping (Position ID), not DEAL Ticket.
                        if action == 'OPEN' and master_ticket:
                            order_id = res.order
                            
                            # 🩹 FALLBACK: If Order ID is 0 (Broker Issue), SCAN for it.
                            if order_id == 0:
                                print(f"       -> Slave {login_id}: ⚠️ Order Ticket is 0. Scanning for Position...")
                                # Scan by Comment Match
                                open_positions = mt5.positions_get()
                                search_tag = f"CPY:{master_ticket}"
                                if open_positions:
                                    for p in open_positions:
                                        if search_tag in p.comment:
                                            order_id = p.ticket
                                            print(f"       -> Slave {login_id}: ✅ Found Position Ticket via Scan: {order_id}")
                                            break
                            
                            # Last Resort
                            if order_id == 0: order_id = deal_id
                            
                            f_uuid = job.slave_config.get('follower_id')
                            if f_uuid:
                                self._save_ticket_map(master_ticket, order_id, f_uuid)
                                print(f"       -> [MAP] Saved {master_ticket} -> {order_id} (Order/Pos ID)")
                            else:
                                print(f"       -> Slave {login_id}: ⚠️ Helper: Missing follower_id for Map Save!")
                        
                        # 🛡️ SAFETY NET: Did we accidentally OPEN a trade?
                        # If we sent a Close (Entry OUT) but got Entry IN, we must Close it immediately.
                        # This handles the "CPY_CLOSE" duplicate order bug 100%.
                        if action == 'CLOSE':
                            # Check Deal Info
                            d_info = mt5.history_deals_get(ticket=deal_id)
                            if d_info and len(d_info) > 0:
                                d = d_info[0]
                                if d.entry == mt5.DEAL_ENTRY_IN:
                                    print(f"       -> Slave {login_id}: 🚨 CRITICAL: Accidental OPEN detected during CLOSE! (Deal {deal_id}). Closing now...")
                                    # Emergency Close
                                    emer_req = {
                                        "action": mt5.TRADE_ACTION_DEAL,
                                        "symbol": actual_symbol,
                                        "position": deal_id, # If Deal became Position (Netting) or Order
                                        "volume": d_info[0].volume, # Fix Access
                                        "type": mt5.ORDER_TYPE_SELL if d.type == mt5.ORDER_TYPE_BUY else mt5.ORDER_TYPE_BUY,
                                        "comment": "ERR_FIX"
                                    }
                                    mt5.order_send(emer_req)
                        
                        # 🔄 PARTIAL CLOSE ROTATION FIX (Robust Enchanced)
                        # The Broker might take 50-500ms to rotate the ticket (Close Old -> Open New).
                        # If we check too fast, we might see the Old Ticket (Stale) or Nothing.
                        
                        if action == 'CLOSE' and final_vol < p_obj.volume:
                            print(f"       -> Slave {login_id}: 📉 Partial Close {final_vol} / {p_obj.volume}. Checking for Rotation...")
                            
                            # 1. Wait for Broker Latency (Critical for Rotation)
                            time.sleep(0.5) # 500ms should be enough for most brokers
                            
                            # 2. We expect a position to exist with the REMAINING volume
                            expected_rem = float(round(p_obj.volume - final_vol, 2))
                            
                            # 3. Scan ALL positions for this Symbol/Magic
                            candidates = mt5.positions_get(symbol=actual_symbol)
                            found_rem_ticket = 0
                            
                            if candidates:
                                for c in candidates:
                                    if c.magic == p_obj.magic:
                                        # Match Volume? (Allow small float drift)
                                        if abs(c.volume - expected_rem) < 0.01:
                                            found_rem_ticket = c.ticket
                                            break
                            
                            # 4. Analyze Result
                            if found_rem_ticket > 0:
                                if found_rem_ticket != local_ticket:
                                    # ✅ ROTATION CONFIRMED (Ticket Changed)
                                    print(f"       -> Slave {login_id}: 🔄 ROTATION DETECTED: {local_ticket} -> {found_rem_ticket} (Vol: {expected_rem})")
                                    
                                    if f_uuid:
                                        self._save_ticket_map(master_ticket, found_rem_ticket, f_uuid)
                                    else:
                                        print(f"       -> Slave {login_id}: ⚠️ Helper: Missing follower_id for Map Update!")
                                else:
                                    # ✅ NETTING CONFIRMED (Same Ticket, Volume Dropped)
                                    print(f"       -> Slave {login_id}: 📉 Netting Confirmed (Ticket {local_ticket} kept). Vol -> {expected_rem}")
                                    
                                    # 🛡️ HEALING: Force Update Map anyway
                                    # If the original Open Map was lost/missing, this restores it so Ghost Buster doesn't panic.
                                    f_uuid = job.slave_config.get('follower_id')
                                    if f_uuid:
                                        self._save_ticket_map(master_ticket, local_ticket, f_uuid)
                                    else:
                                        print(f"       -> Slave {login_id}: ⚠️ Helper: Missing follower_id for Healing Map!")
                            else:
                                # ⚠️ LOST?
                                print(f"       -> Slave {login_id}: ⚠️ Post-Close Scan: Could not find ANY pos with Vol {expected_rem}. Latency?")
                                # Fallback: If Old Ticket is GONE, and we assumed rotation but couldn't find new one...
                                # We might have a problem. But typically we find it.
                        
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
                # 🔓 RELEASE REDIS LOCK
                if 'redis_lock_key' in locals() and redis_lock_key and r_client_hft:
                     try: r_client_hft.delete(redis_lock_key)
                     except: pass

                # 🛑 CRITICAL: Ensure task_done is called ONCE per job
                self.queue.task_done()

    def _save_ticket_map(self, master_ticket, follower_ticket, follower_id):
        """
        Maps Master Ticket -> Follower Ticket (HFT Redis Access).
        Must match executor.py's key format: map:ticket:{master}:{follower_id}
        """
        if not r_client_hft: return
        # 🛡️ TYPE SAFETY: Ensure Master Ticket is String (Redis Key Compatibility)
        key = f"map:ticket:{str(master_ticket)}:{follower_id}"
        # Expire in 30 days
        try:
            r_client_hft.set(key, str(follower_ticket), ex=2592000)
            print(f"       [DEBUG] Saved Ticket Map: {key} -> {follower_ticket}")
        except: pass

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
    
    # print(f"🚀 Dispatching {len(slaves)} Jobs to Swarm...")
    _HFT_POOL.submit_jobs(slaves, signal)

    # Wait for completion (Blocking)
    _HFT_POOL.wait_completion()
    
    return _HFT_POOL.get_results()

def get_global_lock():
    """
    Exposes the HFT Pool Lock for synchronization with Main Thread (Ghost Buster).
    Prevents race conditions where Main Thread switches login while Worker Thread executes.
    """
    global _HFT_POOL
    if _HFT_POOL:
        return _HFT_POOL.lock
    return None

# Alias for compatibility with executor.py
def process_batch(slaves: List[Dict], signal: Dict) -> List[Dict]:
    return dispatch_jobs(slaves, signal)

# ==========================================
# 🧪 TEST HARNESS
# ==========================================
if __name__ == "__main__":
    pass
