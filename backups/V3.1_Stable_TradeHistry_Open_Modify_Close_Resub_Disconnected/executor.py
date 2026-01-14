
import MetaTrader5 as mt5
import time
import requests
import json
import os
from dotenv import load_dotenv
load_dotenv() # 📥 Load .env file
from datetime import datetime, timedelta, time as d_time

import argparse
import psycopg2
import hashlib
import threading
import traceback
import sys
from hft_executor import process_batch, MT5_GLOBAL_LOCK

# ⚙️ CONFIGURATION 

PORT = "3000"  
# HOSTS = ["192.168.2.33.nip.io", "localhost", "127.0.0.1"] 
HOSTS = ["192.168.252.237.nip.io", "localhost", "127.0.0.1"] 
# HOSTS = ["192.168.2.35.nip.io", "localhost", "127.0.0.1"] 
# HOSTS = ["192.168.2.33.nip.io", "localhost", "127.0.0.1", "172.20.10.3.nip.io"] 
DATABASE_URL = os.getenv("DATABASE_URL")

# ⚙️ REDIS CONFIGURATION (Global)
import redis
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
try:
    r_client = redis.from_url(REDIS_URL, decode_responses=True)
    r_client.ping()
    # print(f"[OK] Connected to Redis Cache: {'Cloud' if 'upstash' in REDIS_URL else 'Local'}")
except Exception as e:
    print(f"[WARN] Redis Connection Failed: {e}")
    r_client = None 

# 🔧 ARGUMENT PARSING (Disruptive Cloud Model)
parser = argparse.ArgumentParser(description='Hydra Executor Worker')
parser.add_argument('--mode', type=str, default='SINGLE', choices=['SINGLE', 'BATCH', 'TURBO'], help='Execution Mode: SINGLE (Legacy), BATCH (Free Cloud), TURBO (Paid Cloud)')
parser.add_argument('--user-id', type=str, help='Target User ID (Optional - Auto-Detect if missing)')
parser.add_argument('--batch-id', type=int, default=0, help='Shard ID for Batch processing (e.g. 0-9)')
parser.add_argument('--secret', type=str, help='Bridge API Secret', default=os.getenv("API_SECRET", "AlphaBravoCharlieDeltaEchoFoxtro"))
parser.add_argument('--mt5-path', type=str, help='Specific MT5 Terminal Path', default=os.getenv("MT5_PATH", ""))
parser.add_argument('--dry-run', action='store_true', help='Disable trade execution')

args = parser.parse_args()

BRIDGE_SECRET = args.secret
MT5_PATH_ARG = args.mt5_path
EXECUTION_MODE = args.mode
MY_FOLLOWER_ID = args.user_id 
TARGET_LOGIN_ID = None 
POLL_INTERVAL = 1.0 
DRY_RUN = args.dry_run

# 🧠 AUTO-DETECT USER ID (If not provided)
# If running in SINGLE mode and no ID is given, we defer to the Terminal's Login.
# We CANNOT determine it yet because MT5 is not initialized.
# We will set a flag to resolve it post-init.
RESOLVE_USER_ID = (MY_FOLLOWER_ID is None or MY_FOLLOWER_ID == "AUTO")
# Removed "and EXECUTION_MODE == 'SINGLE'" restriction. 
# We want Auto-ID even in Turbo Mode if MT5 is present (Hybrid logic).


# 🚀 HFT SWARM CONFIGURATION (Critical for Turbo Mode)
# Must be configured BEFORE any pool logic is triggered.
if EXECUTION_MODE in ['BATCH', 'TURBO']:
    try:
        import hft_executor
        if MT5_PATH_ARG:
            hft_executor.configure_swarm(MT5_PATH_ARG)
        print(f"[INIT] HFT Swarm Configured. Terminal: {MT5_PATH_ARG or 'Auto'}")
    except ImportError:
        print("[WARN] hft_executor module not found. HFT features disabled.")

print(f"🚀 Hydra Engine Starting in {EXECUTION_MODE} Mode...")
if EXECUTION_MODE == 'BATCH':
    print(f"   🚌 Standard Cloud: Processing High-Density Batch #{args.batch_id}")
elif EXECUTION_MODE == 'TURBO':
    print(f"   🏎️ Turbo Cloud: Low-Latency Worker Swarm Active")
    if EXECUTION_MODE == 'TURBO':
         hft_executor.init_persistent_engine()


def get_api_url(host):
    return f"http://{host}:{PORT}/api/engine/poll"

# 🔒 UNIFIED TERMINAL LOCK (Redis)
# Must match Broadcaster logic (Path-Based Hash)
if MT5_PATH_ARG:
     lock_seed = os.path.normpath(str(MT5_PATH_ARG)).lower().strip()
     path_hash = hashlib.md5(lock_seed.encode()).hexdigest()
     LOCK_KEY_GLOBAL = f"lock:terminal:{path_hash}"
else:
     LOCK_KEY_GLOBAL = "lock:terminal:global"

print(f"[INIT] Terminal Lock Key: {LOCK_KEY_GLOBAL}")

# 🛡️ GLOBAL STATE: DUPLICATE PREVENTION (Session Scope)
# In TURBO/BATCH mode, we can't see Follower positions, so we rely on this
# to ensure we don't spam "Catch-Up" signals# Guard to prevent duplicate Catch-Up processing per session
PROCESSED_CATCHUP_TICKETS = set()
PROCESSED_GHOST_TICKETS = set() # Guard to prevent re-busting same ghosts loop after loop

def acquire_terminal_lock(timeout=0.1, ttl=30): 
    # Blocking Lock with Timeout (Critical for Shared Terminal)
    if not r_client: return True
    
    start_time = time.time()
    first_attempt = True
    
    while True:
        try:
            # NX=True (Only set if not exists), EX=ttl (Expire in ttl seconds)
            if r_client.set(LOCK_KEY_GLOBAL, "LOCKED_EXECUTOR", nx=True, ex=ttl):
                return True
        except:
            return True # Fail open if Redis dies?

        # If timeout is 0 or negative, return result of first attempt immediately
        if timeout <= 0:
            return False
            
        # Check timeout
        if (time.time() - start_time) > timeout:
            return False
            
        # Wait a bit before retrying (Busy Wait Prevention)
        time.sleep(0.1)

def release_terminal_lock():
    if r_client:
        try:
             # Only delete if WE hold it? 
             # Lua script is safer but for now assume we are good citizens.
             # Actually, if verify.py holds it, we shouldn't delete it.
             # Check value?
             val = r_client.get(LOCK_KEY_GLOBAL)
             if val == "LOCKED_EXECUTOR":
                 r_client.delete(LOCK_KEY_GLOBAL)
        except:
            pass

# 🧠 SMART SYMBOL MAP (Normalization)
# Auto-maps generic names to broker-specific symbols
# 🧠 SMART SYMBOL GROUPS (Bidirectional)
# Groups of equivalent symbols. If one is missing, try others in the group.
SYNONYM_GROUPS = [
    ["GOLD", "XAUUSD", "GC", "MGC", "QO", "XAUUSD.s", "GOLD.s", "GOLD.fs"],
    ["BTCUSD", "Bitcoin", "BTC", "MBT", "XBT", "BTCUSD.p"],
    ["ETHUSD", "Ethereum", "ETH", "MET", "XET"],
    ["US30", "DJ30", "WS30", "YM", "MYM", "WallStreet"],
    ["US100", "NAS100", "NDX100", "NQ", "MNQ", "USTECH"],
    ["US500", "SP500", "SPX500", "ES", "MES"],
    ["GER30", "DAX30", "DE30", "FDAX"],
    ["JAP225", "JP225", "NKY", "NI225"],
    ["UK100", "FTSE100", "Z"],
    ["XTIUSD", "USOIL", "WTI", "CL", "QM", "MCL"],
    ["XBRUSD", "UKOIL", "BRENT", "CO"]
]

def normalize_symbol(input_symbol):
    """
    Robustly finds the correct tradable symbol on the current terminal.
    1. Direct Check (Fastest).
    2. Suffix Check on Input.
    3. Synonym Check (Iterate through all aliases types).
    """
    # 0. Clean Input
    clean_input = input_symbol.upper().strip()
    
    # 1. Direct Check
    if mt5.symbol_select(clean_input, True):
        return clean_input
        
    # Helpers
    suffixes = ["", "m", "c", "b", "z", ".m", ".c", ".s", ".std", ".pro", ".r", "_i", ".p", ".ecn", "#", "ft", "ft.r", ".t"]
    
    def try_suffixes(base):
        for s in suffixes:
            trial = f"{base}{s}"
            if mt5.symbol_select(trial, True):
                return trial
        return None

    # 🔧 DYNAMIC FUTURES DISCOVERY (2025-2030)
    # Covers CME (GCZ5) and TFEX (S50Z25) patterns
    def resolve_dynamic_future(base_root):
        # Month Codes: F=Jan, G=Feb, H=Mar, J=Apr, K=May, M=Jun, N=Jul, Q=Aug, U=Sep, V=Oct, X=Nov, Z=Dec
        months = "FGHJKMNQUVXZ"
        years = ["25", "26", "27", "28", "29", "30", "5", "6", "7", "8", "9", "0"]
        
        # Priority: Check current year/next year first? 
        # Actually just iterate efficiently.
        # Try finding ANY valid contract.
        # But we want the "Front Month" usually.
        # This is a 'best effort' to find ANY tradeable symbol if exact match fails.
        
        for y in years:
            for m in months:
                # Type 1: CME Style (GCZ5) - 1 digit year
                if len(y) == 1:
                    candidate = f"{base_root}{m}{y}"
                    # Check suffixes too!
                    found = try_suffixes(candidate)
                    if found: return found
                
                # Type 2: TFEX Style (S50Z25) - 2 digit year
                if len(y) == 2:
                    candidate = f"{base_root}{m}{y}"
                    found = try_suffixes(candidate)
                    if found: return found
        return None

    # 🔗 FUTURES ROOTS MAP
    # If Input is Spot (XAUUSD), try these Futures Roots
    FUTURES_ROOTS = {
        "XAUUSD": ["GC", "MGC", "QO", "GOLD"],
        "GOLD": ["GC", "MGC", "QO"],
        "US500": ["ES", "MES"],
        "US100": ["NQ", "MNQ"],
        "US30": ["YM", "MYM"],
        "XTIUSD": ["CL", "QM", "MCL"],
        "USOIL": ["CL", "QM", "MCL"],
        # Add TFEX/Others
        "SET50": ["S50"] 
    }

    # 2. Try Suffixes on Input (e.g. Input "GOLD" -> Found "GOLD.std")
    found = try_suffixes(clean_input)
    if found: return found
    
    # 3. Synonym Group Search
    target_group = None
    for group in SYNONYM_GROUPS:
        if clean_input in group:
            target_group = group
            break
        for member in group:
            if clean_input.startswith(member):
                 target_group = group
                 break
        if target_group: break
    
    if target_group:
        for synonym in target_group:
            # Standard Suffix Check
            found = try_suffixes(synonym)
            if found: return found
            
            # 🚀 DYNAMIC FUTURE CHECK
            # If synonym is a known root (like GC), try expanding it
            # Or blindly try expanding every synonym as a root? Safe enough.
            future_found = resolve_dynamic_future(synonym)
            if future_found: return future_found

    # 4. Fallback: Prefix/Suffix Strip
    prefixes = ["m", "M", "i", "pro.", ".", "#", "b"]
    base_candidates = [clean_input]
    
    for s in suffixes:
        if s and clean_input.endswith(s):
             # Safe Strip: Only remove from END
             base_candidates.append(clean_input[:-len(s)])
    
    for p in prefixes:
        if clean_input.startswith(p):
             base_candidates.append(clean_input[len(p):])
             
    for base in base_candidates:
        if base == clean_input: continue
        if mt5.symbol_select(base, True): return base
        found = try_suffixes(base)
        if found: return found
        
        # Check Futures on stripped base
        future_found = resolve_dynamic_future(base)
        if future_found: return future_found

    # 5. Last Resort: Check generic Futures map
    # If input is XAUUSD, check GC...
    roots = FUTURES_ROOTS.get(clean_input, [])
    for r in roots:
        future_found = resolve_dynamic_future(r)
        if future_found: return future_found

    return None # Not found

def normalize_trade_params(symbol, volume, price=0.0, sl=0.0, tp=0.0):
    """
    Auto-calculates correct Volume and Rounds Price/SL/TP to broker precision.
    Returns: (vol, price, sl, tp)
    """
    info = mt5.symbol_info(symbol)
    if not info: return volume, price, sl, tp
    
    # 1. Volume Normalization
    min_vol = info.volume_min
    max_vol = info.volume_max
    step_vol = info.volume_step
    
    # Clamp to Min
    if volume < min_vol:
        print(f"   [AUTO-RISK] ⚠️ Volume {volume} < Min {min_vol}. Adjusting to {min_vol}.")
        volume = min_vol
        
    # Clamp to Max
    if volume > max_vol:
        volume = max_vol
        
    # Round to Step (e.g. 0.01)
    if step_vol > 0:
        volume = round(volume / step_vol) * step_vol
        volume = round(volume, 2) # Safety round
        
    # 2. Price/SL/TP Precision
    digits = info.digits
    if price > 0: price = round(price, digits)
    if sl > 0: sl = round(sl, digits)
    if tp > 0: tp = round(tp, digits)
    
    return volume, price, sl, tp

def get_broker_url(host):
    return f"http://{host}:{PORT}/api/user/broker"

def calculate_safe_lot(master_lot_size, equity, leverage, risk_factor_percent, symbol="EURUSD"):
    """
    🧮 PRO-RATA + RISK GUARD CALCULATION
    Uses MT5 Native Margin Calculation for precision.
    """
    # 1. Basic Pro-Rata Logic
    multiplier = risk_factor_percent / 100.0
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
            print(f"   [RISK] ⚠️ Insufficient Margin for {final_lot} lots. (Need: {needed_margin:.2f}, Free: {free_margin:.2f})")
            
            # 🛑 FORCE MIN LOT?
            min_margin = 0.0
            try:
                min_margin = mt5.order_calc_margin(mt5.ORDER_TYPE_BUY, symbol, min_lot, price)
            except: 
                min_margin = (min_lot * (100 if "XAU" in symbol else 100000) * price) / 500

            if min_margin and free_margin > min_margin:
                print(f"   [RISK] 📉 Downgrading to MIN LOT ({min_lot}) to survive.")
                return min_lot
            else:
                 print(f"   [RISK] ❌ CRITICAL: Cannot afford Min Lot ({min_margin:.2f}). Skipping.")
                 return 0.0 # Skip
                 
    return round(final_lot, 2)


def get_db_connection():
    try:
        return psycopg2.connect(DATABASE_URL)
    except Exception as e:
        print(f"[ERROR] DB Connect Failed: {e}")
        return None

def fetch_subscriptions(follower_id=None):
    """
    Fetch active CopySessions.
    If follower_id is provided, fetch specific.
    If EXECUTION_MODE == 'BATCH', fetch ALL valid sessions for this Batch ID.
    """
    conn = get_db_connection()
    # 🛡️ Guard: If no DB, return empty. But wait, if follower_id is None, we return empty dict/list default?
    # If explicit none passed, we might be fetching ALL (Batch/Turbo).
    conn = get_db_connection()
    # 🛡️ Guard: If no DB, return empty.
    # CRITICAL FIX: If EXECUTION_MODE is BATCH or TURBO, we MUST return a dict {}, not a list [].
    # Otherwise logic downstream (active_subscriptions.keys()) will crash.
    # Otherwise logic downstream (active_subscriptions.keys()) will crash.
    if not conn:
        print("[WARN] DB Connection unavailable. Preserving existing subscriptions.")
        return None
    
    # 🛡️ Guard: Prevent fetching for invalid follower_id
    if EXECUTION_MODE == 'SINGLE' and not follower_id:
        return {}
    
    try:
        cur = conn.cursor()
        
        if EXECUTION_MODE == 'BATCH':
            # 🚌 BATCH MODE (Standard Lane)
            print(f"[DEBUG] Fetching BATCH subscriptions (Shard {args.batch_id})...")
            
            query = """
                SELECT "followerId", "masterId", "timeConfig", "expiry", "executionLane", "allocation", cs."id", cs."riskFactor", cs."invertCopy", cs."createdAt"
                FROM "CopySession" cs
                JOIN "User" u ON cs."followerId" = u."id"
                WHERE cs."isActive" = true 
                  AND cs."executionLane" = 'STANDARD'
                  AND u."role" != 'MASTER'
            """
            cur.execute(query)
            rows = cur.fetchall()
            
            batch_subs = {} 
            for row in rows:
                fid, mid, cfg, exp, lane, alloc, session_id, risk_val, invert, created_at = row
                
                # SHARDING FILTER
                try:
                    # Simple Hash Sharding
                    shard_val = int(hashlib.sha256(str(fid).encode('utf-8')).hexdigest(), 16) % 10
                    if shard_val != args.batch_id:
                        continue
                except:
                    continue
                    
                mid_str = str(mid)
                if mid_str not in batch_subs:
                    batch_subs[mid_str] = []
                
                batch_subs[mid_str].append({
                    'follower_id': fid,
                    'config': cfg,
                    'expiry': exp,
                    'lane': lane,
                    'allocation': float(alloc or 0),
                    'session_id': session_id,
                    'risk_factor': float(risk_val or 1.0),
                    'invert_copy': bool(invert),
                    'params': {'created_at': created_at} # Store extra params
                })
            
            # print(f"[DEBUG] Batch Standard Loaded: {len(batch_subs)} Masters monitored.")
            return batch_subs

        elif EXECUTION_MODE == 'TURBO':
            # 🏎️ TURBO MODE: UNIVERSAL DYNAMIC ENGINE
            # Fetches BOTH Paid and Free users, but prioritizes Paid via HFT Queue.
        # print(f"[DEBUG] Fetching ALL subscriptions for Dynamic HFT Swarm...")
            
            query = """
                SELECT "followerId", "masterId", "timeConfig", "expiry", "executionLane", "allocation", cs."id", cs."riskFactor", cs."invertCopy", cs."createdAt"
                FROM "CopySession" cs
                JOIN "User" u ON cs."followerId" = u."id"
                WHERE cs."isActive" = true
                  AND u."role" != 'MASTER' -- 🛑 RULE: Master cannot follow
            """
            cur.execute(query)
            rows = cur.fetchall()
            
            batch_subs = {} 
            for row in rows:
                fid, mid, cfg, exp, lane, alloc, session_id, risk_val, invert, created_at = row
                mid_str = str(mid)
                if mid_str not in batch_subs:
                    batch_subs[mid_str] = []
                
                batch_subs[mid_str].append({
                    'follower_id': fid,
                    'config': cfg,
                    'expiry': exp,
                    'lane': lane,
                    'allocation': float(alloc or 0),
                    'session_id': session_id,
                    'risk_factor': float(risk_val or 1.0),
                    'invert_copy': bool(invert),
                    'params': {'created_at': created_at}
                })
                # print(f"[DEBUG-FETCH] Loaded {fid} -> {mid}: Invert={bool(invert)} (Raw={invert})", flush=True)
                
            # print(f"[DEBUG] TURBO Swarm Loaded: {len(batch_subs)} Masters monitored.")
            return batch_subs

        else:
            # SINGLE USER MODE
            # print(f"[DEBUG] Fetching subscriptions for Follower: '{follower_id}'")
            query = """
                SELECT "masterId", "timeConfig", "expiry", "riskFactor", "invertCopy", "createdAt" FROM "CopySession"
                WHERE "followerId" = %s 
                  AND "isActive" = true
                  AND ("expiry" IS NULL OR "expiry" > NOW() - INTERVAL '1 DAY') 
            """
            cur.execute(query, (follower_id,))
            rows = cur.fetchall()
            # print(f"[DEBUG] DB Query Result for {follower_id}: {rows}")
            # row: 0=mid, 1=cfg, 2=expiry, 3=riskFactor, 4=invertCopy, 5=createdAt
            return {
                str(row[0]): {
                    'config': row[1], 
                    'expiry': row[2], 
                    'risk_factor': float(row[3] or 1.0), 
                    'invert_copy': bool(row[4]),
                    'params': {'created_at': row[5]}
                } for row in rows
            }

    except Exception as e:
        print(f"[ERROR] Fetch Subscriptions Failed: {e}")
        return None # Return None to signal 'Preserve State' instead of 'Clear All'
    finally:
        if conn:
            cur.close()
            conn.close()

# 🧠 CREDENTIAL CACHE (TTL)
CRED_CACHE = {} # { user_id: { "data": {}, "expiry": datetime } }
CRED_CACHE_TTL = 60 # Seconds

def fetch_credentials(target_user_id=None):
    use_id = target_user_id if target_user_id else MY_FOLLOWER_ID
    
    # 🛑 GUARD: Don't fetch for None (Manager Mode)
    if not use_id or str(use_id) == 'None':
        # print("[DEBUG] Skipping Credential Fetch for None (Manager Mode)")
        return None

    # ⚡ CACHE CHECK
    current_time = datetime.utcnow()
    cached = CRED_CACHE.get(str(use_id))
    
    if cached and current_time < cached['expiry']:
        # print(f"[CACHE] Using cached creds for {use_id}")
        return cached['data']

    print(f"[INFO] Fetching credentials from Cloud for {use_id}...")
    for host in HOSTS:
        url = get_broker_url(host)
        try:
            res = requests.get(url, headers={"x-bridge-secret": BRIDGE_SECRET, "x-user-id": use_id}, timeout=3)
            if res.status_code == 200:
                print(f"   [OK] Found credentials at {host}")
                data = res.json()
                
                # 💾 UPDATE CACHE
                CRED_CACHE[str(use_id)] = {
                    "data": data,
                    "expiry": current_time + timedelta(seconds=CRED_CACHE_TTL)
                }
                return data
            elif res.status_code == 404:
                print(f"   [FATAL] 404 Account Not Found at {host} for {use_id}")
                # Cache 404s too? Maybe for short time to prevent spam on bad IDs
                CRED_CACHE[str(use_id)] = {
                    "data": "FATAL_404",
                    "expiry": current_time + timedelta(seconds=15) # Short cache for failures
                }
                return "FATAL_404"
            else:
                print(f"   [WARN] {host} returned {res.status_code}: {res.text}")
        except Exception as e:
            print(f"   [WARN] {host} unreachable: {e}")
            pass
    
    print("[ERROR] Failed to fetch credentials from any host.")
    return None

import redis
import json

# Redis for Sentinel Sync
redis_client = redis.Redis(host='localhost', port=6379, decode_responses=True)

class SentinelManager:
    def sync_sentinel(self, subs):
        """Sentinel Logic Disabled by User Request"""
        pass

def login_mt5(creds):
    if not creds: return False
    global TARGET_LOGIN_ID
    
    # Check if already logged in
    info = mt5.account_info()
    if info and str(info.login) == str(creds['login']):
        print(f"[OK] Already logged in as {creds['login']}")
        TARGET_LOGIN_ID = int(creds['login'])
        return True

    print(f"[INFO] Logging in as {creds['login']}...")
    print(f"      Server: {creds['server']}")
    print(f"      Password: {'*' * len(creds['password'])} (Length: {len(creds['password'])})")

    # 1. Try Explicit Login (Best for Switching)
    authorized = mt5.login(
        login=int(creds['login']), 
        password=creds['password'], 
        server=creds['server']
    )
    
    if authorized:
        print(f"[OK] Login Successful: {creds['login']}")
        TARGET_LOGIN_ID = int(creds['login'])
        return True
    
    print(f"[WARN] Explicit Login Failed: {mt5.last_error()}")
    
    # 2. Fallback: Try Login with SAVED Password (if manual login was done before)
    print(f"[INFO] Retrying with Saved Password (OTP Mode)...")
    authorized = mt5.login(
        login=int(creds['login']),
        server=creds['server']
    )
    
    if authorized:
        print(f"[OK] Login Successful (Saved Password): {creds['login']}")
        return True
        
    print(f"[ERROR] All Login Attempts Failed: {mt5.last_error()}")
    print(f"👉 TIP: Login MANUALLY in MT5, check 'Save Password', and ensure Server Name matches exactly.")
    return False


    
# 🔒 LOCKING PRIMITIVES

def acquire_lock(lock_id, timeout=10):
    """
    Acquires a distributed lock for the given ID (e.g. Follower ID).
    Prevents multiple executor processes from managing the same user.
    """
    if not r_client:
        return True # Fail open if no Redis (Single Mode)
    
    key = f"lock:executor:{lock_id}"
    # Set lock with expiry
    if r_client.set(key, "LOCKED", nx=True, ex=timeout):
        return True
    return False

def release_lock(lock_id):
    if not r_client: return
    key = f"lock:executor:{lock_id}"
    r_client.delete(key)

def refresh_lock(lock_id, timeout=10):
    if not r_client: return
    key = f"lock:executor:{lock_id}"
    # Only update if exists
    r_client.expire(key, timeout)



# 🕰️ TIME UTILS


def get_master_closed_positions(sub_master_id, lookback_days=2, from_ts=0):
    """
    Switch to Master and return a SET of all closed POSITION IDs (not Deal IDs).
    from_ts: Optional Unix Timestamp to start check from (overrides lookback_days).
    Target: To identify trades that were closed while we were disconnected.
    """
    closed_position_ids = set()
    
    # 1. Acquire Lock
    # NOTE: acquire_terminal_lock takes NO args (uses MT5_PATH_ARG global)
    if not acquire_terminal_lock():
        print(f"   [WARN] Could not acquire lock for History Check on {sub_master_id}")
        return closed_position_ids

    # 2. Get Credentials
    creds = fetch_credentials(sub_master_id)
    if not creds:
        release_terminal_lock()
        return closed_position_ids

    try:
        # 3. Switch to Master
        # print(f"   [🕵️‍♂️ BATCH CHECK] Switching to Master {creds['login']} to scan closed trades...")
        if not login_mt5(creds):
             release_terminal_lock()
             return closed_position_ids
             
        # 4. Check History
        to_date = datetime.utcnow() + timedelta(days=1) # Future proof
        
        if from_ts > 0:
            from_date = datetime.fromtimestamp(from_ts)
            # print(f"   [HIST] Scanning history from Trade Open Time: {from_date}")
        else:
            from_date = datetime.utcnow() - timedelta(days=lookback_days)
        
        deals = mt5.history_deals_get(from_date, to_date)
        
        if deals:
            count = 0
            for d in deals:
                # We want DEALS that are 'OUT' (Closing)
                # And we store the POSITION ID they closed.
                if d.entry == mt5.DEAL_ENTRY_OUT: 
                    closed_position_ids.add(str(d.position_id))
                    count += 1
            
            # if count > 0:
            #    print(f"   [✅] BATCH HISTORY: Found {count} closed positions.")
        else:
             pass
             # print(f"   [ℹ️] No history deals found for Master.")
             
    except Exception as e:
        print(f"   [ERROR] Batch History Check failed: {e}")
        traceback.print_exc()
        
    finally:
        # 5. Release Lock (Caller must switch back to Follower!)
        release_terminal_lock()

    return closed_position_ids


def verify_master_history_closure(sub_master_id, master_ticket_str, from_ts=0):
    """
    Wrapper to safely check Master History and GUARANTEE return to Follower.
    Uses Direct Position Lookup (O(1)) for maximum efficiency and unlimited history.
    """
    # ⚡ FAST CHECK: Redis History (Populated by Broadcaster)
    if r_client:
        redis_key = f"history:master:{sub_master_id}:closed"
        if r_client.sismember(redis_key, master_ticket_str):
            # print(f"   [GHOST] ⚡ Redis confirmed Master {master_ticket_str} is CLOSED.")
            return True

    is_closed = False
    original_login = mt5.account_info().login # Capture CURRENT (Follower) login
    
    # 1. Acquire Lock (Must lock purely to prevent others from using terminal while we switch)
    if not acquire_terminal_lock():
        return False

    try:
        # 2. Get Credentials & Switch
        creds = fetch_credentials(sub_master_id)
        if creds and login_mt5(creds):
            
            # 3. DIRECT HISTORY CHECK (Optimized)
            # Instead of scanning date ranges, we ask MT5 for deals related to this specific Position ID.
            # This is efficient and allows checking "Unlimited" history without performance cost.
            try:
                ticket_int = int(master_ticket_str)
                deals = mt5.history_deals_get(position=ticket_int)
                
                if deals:
                    for d in deals:
                        if d.entry == mt5.DEAL_ENTRY_OUT:
                            is_closed = True
                            print(f"   [GHOST] Found CLOSING DEAL in Master History: {d.ticket} (Profit: {d.profit})")
                            break
            except Exception as e:
                print(f"   [ERROR] History Deal Lookup Failed: {e}")

        else:
             print(f"   [WARN] Could not login to Master {sub_master_id} for verification.")

    except Exception as e:
        print(f"   [ERROR] Verify History failed: {e}")
        
    finally:
        # 4. 🛡️ CRITICAL: ALWAYS SWITCH BACK TO FOLLOWER
        try:
            current_login = mt5.account_info().login
            if current_login != original_login:
                 print(f"   [🛡️ SAFETY] Switching back to Follower {original_login}...")
                 mt5.login(original_login)
        except Exception as e:
            print(f"   [CRITICAL] Failed to restore Follower account {original_login}: {e}")
            
        release_terminal_lock()
        
    return is_closed

def is_within_trading_hours(time_config):
    """
    Validates if current UTC time is within the allowed window.
    Supports: "24/7", "CUSTOM", "LONDON", "NY", "ASIA".
    """
    if not time_config: return True # Default to Allow if no config
    
    mode = time_config.get('mode', '24/7')
    if mode == '24/7': return True
    
    now = datetime.utcnow().time()
    
    # Parse Start/End
    try:
        s_str = time_config.get('start', '00:00')
        e_str = time_config.get('end', '23:59')
        
        sh, sm = map(int, s_str.split(':'))
        eh, em = map(int, e_str.split(':'))
        
        start_time = d_time(sh, sm)
        end_time = d_time(eh, em)
        
        # Handle Midnight Crossing (e.g. 23:00 to 02:00)
        if start_time <= end_time:
            return start_time <= now <= end_time
        else:
            # Crosses midnight: Active if > Start OR < End
            return now >= start_time or now <= end_time
            
    except Exception as e:
        print(f"[WARN] Time Parse Error: {e}")
        return False # Fail CLOSED (Safety First)

RESET_HOUR = 4 # 04:00 AM UTC (NY Close)


def close_session_trades(master_id, reason="Session Expired"):
    """
    🛑 FORCE CLOSE logic for Expired Sessions.
    Closes all open positions associated with the given Master ID.
    """
    print(f"[🛑] Force Closing trades for Master {master_id} (Reason: {reason})...")
    
    # 1. Get Master's Known Tickets from Redis to identify matching trades
    if not r_client: return
    key = f"state:master:{master_id}:tickets"
    data = r_client.get(key)
    if not data:
         print(f"   [WARN] No state found for Master {master_id}. Cannot identify specific trades to close.")
         return

    try:
        state = json.loads(data)
        # Handle both list and dict formats
        master_tickets = set()
        if isinstance(state.get("tickets"), list):
             master_tickets = set(map(str, state['tickets']))
        elif isinstance(state.get("positions"), dict):
             master_tickets = set(state['positions'].keys())
        
        if not master_tickets:
             print(f"   [ℹ️] No active signals known for Master {master_id}.")
             return

        # 2. Scan Local Positions
        local_positions = mt5.positions_get()
        if not local_positions: return

        closed_count = 0
        for pos in local_positions:
            if pos.magic == 234000 and "CPY:" in pos.comment:
                try:
                    # Extract Ticket
                    t_id = pos.comment.split(':')[1]
                    if t_id in master_tickets:
                        # MATCH! Close it.
                        print(f"   [CLOSING] Expired Trade: {pos.symbol} (Ticket: {t_id})")
                        
                        req = {
                            "action": mt5.TRADE_ACTION_DEAL,
                            "symbol": pos.symbol,
                            "volume": pos.volume,
                            "type": mt5.ORDER_TYPE_SELL if pos.type == mt5.ORDER_TYPE_BUY else mt5.ORDER_TYPE_BUY,
                            "position": pos.ticket,
                            "price": mt5.symbol_info_tick(pos.symbol).bid if pos.type == mt5.ORDER_TYPE_BUY else mt5.symbol_info_tick(pos.symbol).ask,
                            "magic": 234000,
                            "comment": f"EXP:{reason}",
                        }
                        res = mt5.order_send(req)
                        if res.retcode == mt5.TRADE_RETCODE_DONE:
                            closed_count += 1
                except:
                    pass
        
        print(f"   [✅] Closed {closed_count} positions for Master {master_id}.")

    except Exception as e:
        print(f"   [ERR] Close Session Failed: {e}")

def check_daily_resets(follower_id):
    """
    🔄 SMART AUTO-RENEWAL & EXPIRY ENFORCEMENT
    Checks for expired 'Standard' (4h) and 'Welcome' (7-Day) tickets.
    Supports SINGLE (user specific) and BATCH/TURBO (Shard specific) modes.
    """
    conn = get_db_connection()
    if not conn: return

    try:
        cur = conn.cursor()

        # ---------------------------------------------------------
        # 1. 🛑 HARD EXPIRY (Welcome / Trial / Non-Renewable)
        # ---------------------------------------------------------
        # Fetch expired sessions that must die immediately
        
        stop_rows = []
        if EXECUTION_MODE == 'SINGLE' and follower_id:
             fetch_stop_q = """
                SELECT "id", "masterId", "type", "followerId"
                FROM "CopySession"
                WHERE "followerId" = %s
                  AND "isActive" = true
                  AND "expiry" < NOW()
                  AND (
                      "type" IN ('TRIAL_7DAY') 
                      OR "autoRenew" = false
                  )
             """
             cur.execute(fetch_stop_q, (follower_id,))
             stop_rows = cur.fetchall()
        else:
             # BATCH / TURBO MODE: Fetch ALL relevant expired
             fetch_stop_q = """
                SELECT "id", "masterId", "type", "followerId"
                FROM "CopySession"
                WHERE "isActive" = true
                  AND "expiry" < NOW()
                  AND (
                      "type" IN ('TRIAL_7DAY') 
                      OR "autoRenew" = false
                  )
             """
             cur.execute(fetch_stop_q)
             stop_rows = cur.fetchall()

        for row in stop_rows:
            sid, mid, stype, fid = row
            
            # 🛡️ SHARD FILTER (For Batch/Turbo)
            if EXECUTION_MODE in ['BATCH', 'TURBO']:
                try:
                    shard_val = int(hashlib.sha256(str(fid).encode('utf-8')).hexdigest(), 16) % 10
                    if shard_val != args.batch_id:
                        continue
                except: continue

            print(f"[🛑] EXPIRED: Session {sid} ({stype}). Soft Stop (Deactivating Session, KEEPING TRADES OPEN).")
            
            try:
                # B. Deactivate in DB (Soft Stop)
                cur.execute('UPDATE "CopySession" SET "isActive" = false WHERE "id" = %s', (sid,))
                conn.commit()
                
                # 📡 REAL-TIME UI NOTIFICATION
                if r_client:
                    # Notify Frontend Hook (useRealTimeData)
                    payload = json.dumps({
                        "type": "SESSION_EXPIRED",
                        "sessionId": sid,
                        "masterId": mid,
                        "reason": "EXPIRY_SOFT_STOP"
                    })
                    # Publish to User's private channel
                    r_client.publish(f"events:user:{fid}", payload)
                    print(f"   [📡] Published SESSION_EXPIRED event to events:user:{fid}")

            except Exception as e:
                print(f"   [ERR] Failed to deactivate {sid}: {e}")
            
        # ---------------------------------------------------------
        # 2. 🔄 DAILY RENEWAL (Standard + AutoRenew=True)
        # ---------------------------------------------------------
        # Fetch only STANDARD/DAILY sessions that are renewable
        renew_rows = []
        if EXECUTION_MODE == 'SINGLE' and follower_id:
            query = """
                SELECT "id", "timeConfig", "expiry", "isActive", "type", "followerId"
                FROM "CopySession"
                WHERE "followerId" = %s
                  AND "autoRenew" = true
                  AND "type" NOT IN ('TRIAL_7DAY', 'PAID') -- Exclude non-daily types
            """
            cur.execute(query, (follower_id,))
            renew_rows = cur.fetchall()
        else:
             query = """
                SELECT "id", "timeConfig", "expiry", "isActive", "type", "followerId"
                FROM "CopySession"
                WHERE "autoRenew" = true
                  AND "type" NOT IN ('TRIAL_7DAY', 'PAID') -- Exclude non-daily types
            """
             cur.execute(query)
             renew_rows = cur.fetchall()
        
        now = datetime.utcnow()
        
        for row in renew_rows:
            sid, config, expiry, is_active, session_type, fid = row
            
            # 🛡️ SHARD FILTER
            if EXECUTION_MODE in ['BATCH', 'TURBO']:
                try:
                    shard_val = int(hashlib.sha256(str(fid).encode('utf-8')).hexdigest(), 16) % 10
                    if shard_val != args.batch_id:
                        continue
                except: continue
            
            # Scenario A: Session is Active but Expired
            if is_active and expiry and expiry < now:
                # 1. Intra-Day Continuity Check 🔄
                if is_within_trading_hours(config):
                     new_expiry = now + timedelta(hours=4)
                     update_q = 'UPDATE "CopySession" SET "expiry" = %s WHERE "id" = %s'
                     cur.execute(update_q, (new_expiry, sid))
                     conn.commit()
                     print(f"[🔄] Mid-Session Renewal for {sid} -> New Expiry: {new_expiry}")
                     continue 
                else:
                    # 2. Window Closed -> sleep 💤
                    update_q = 'UPDATE "CopySession" SET "isActive" = false WHERE "id" = %s'
                    cur.execute(update_q, (sid,))
                    conn.commit()
                    print(f"[] Window Closed. Putting Session {sid} to Sleep (Inactive). Waiting for Daily Reset.")
                    continue

            # Scenario B: Session is Sleeping (Inactive)
            if not is_active:
                # 3. Daily Reset Logic (Wake Up) ⏰
                
                # Parse Window Start
                mode = config.get('mode', '24/7') if config else '24/7'
                start_str = config.get('start', '00:00') if config else '00:00'
                
                now_hour_val = now.hour
                
                if mode == '24/7':
                     # If it's before 04:00, wait.
                     if now_hour_val < RESET_HOUR:
                         continue
                     
                     new_expiry = now + timedelta(hours=4)
                     update_q = 'UPDATE "CopySession" SET "expiry" = %s, "isActive" = true WHERE "id" = %s'
                     cur.execute(update_q, (new_expiry, sid))
                     conn.commit()
                     print(f"[☀️] 24/7 Daily Wake Up for Session {sid} -> New Expiry: {new_expiry}")
                     continue

                try:
                    sh, sm = map(int, start_str.split(':'))
                except:
                    sh, sm = 0, 0
                    
                target_start = now.replace(hour=sh, minute=sm, second=0, microsecond=0)
                
                if target_start + timedelta(hours=4) < now:
                    target_start += timedelta(days=1)
                
                if now < target_start:
                    continue
                
                # WAKE UP! ☀️
                new_expiry = target_start + timedelta(hours=4)
                
                update_q = 'UPDATE "CopySession" SET "expiry" = %s, "isActive" = true WHERE "id" = %s'
                cur.execute(update_q, (new_expiry, sid))
                conn.commit()
                print(f"[☀️] Strict Wake Up for Session {sid} -> Active! Expiry: {new_expiry}")

        cur.close()
        conn.close()
    except Exception as e:
        print(f"[ERROR] Auto-Renew Failed: {e}")

def initialize_mt5():
    # ⚠️ CRITICAL: In TURBO/BATCH mode, the Manager Process MUST NOT attach to the default terminal.
    # It will block the Broadcaster (Master Monitor).
    # The Manager works purely as a Dispatcher (Redis -> Worker Pool).
    if EXECUTION_MODE in ['BATCH', 'TURBO']:
        if MT5_PATH_ARG:
            # 🧹 Single Machine Hybrid Mode: We act as Manager AND Scanner
            print("[INFO] HFT Hybrid: Initializing Main Terminal for Self-Heal Scans.")
            clean_path = MT5_PATH_ARG.strip('"').strip("'")
            
            import hft_executor
            hft_executor.configure_swarm(clean_path)
            # ⬇️ FALL THROUGH to initialize() execution below
        else:
            print("[INFO] HFT Manager: Skipping Main Terminal Initialization (Swarm Mode).")
            return

    # Optional: Path to specific terminal (Crucial for running multiple instances)
    mt5_path = MT5_PATH_ARG 

    init_params = {}
    if mt5_path and os.path.exists(mt5_path):
        init_params['path'] = mt5_path
        print(f"[INFO] Target Terminal: {mt5_path}")

    max_retries = 999999
    retry_count = 0
    
    while retry_count < max_retries:
        # 🤝 COOPERATIVE LOCKING: Yield to Verify Script
        if r_client:
            lock_owner = r_client.get(LOCK_KEY_GLOBAL)
            if lock_owner == "LOCKED_VERIFY":
                print(f"[WAIT] Yielding to Verify Script... (Pausing {retry_count})")
                mt5.shutdown()
                time.sleep(1)
                continue
                
        # Try to Acquire (Short Lock)
        # We don't block here, we just claim it to tell Verify we are busy
        if r_client:
            r_client.set(LOCK_KEY_GLOBAL, "LOCKED_EXECUTOR", ex=5)

        if mt5.initialize(**init_params):
            print("[OK] MT5 Initialized Successfully.")
            break
        else:
            err = mt5.last_error()
            print(f"[ERROR] initialize() failed, error code = {err}")
            
            if DRY_RUN:
                print("[WARN] Proceeding in DRY_RUN mode despite init failure.")
                break
                
            retry_count += 1
            print(f"[RETRY] Retrying Init in 5 seconds... ({retry_count}/{max_retries})")
            time.sleep(5)
    else:
        # Attempt Auto-Login (SINGLE MODE ONLY)
        # In TURBO/BATCH mode, the Manager Process        # Standby Loop for Reconnection
        while True:
            creds = fetch_credentials()
            if creds == "FATAL_404":
                print(f"[{datetime.now().strftime('%H:%M:%S')}] ⏳ Waiting for Broker Connection... (Standby)")
                mt5.shutdown() # 🟢 Release Terminal for Verification Script
                time.sleep(5)
                continue
            
            # 🟢 WAKE UP: Re-Initialize MT5 with New Credentials
            if isinstance(creds, dict):
                # Ensure we have the latest path (global)
                if not mt5.initialize(path=mt5_path, login=int(creds['login']), password=creds['password'], server=creds['server']):
                    print(f"❌ Re-Initialization Failed: {mt5.last_error()}, retrying...")
                    mt5.shutdown()
                    time.sleep(5)
                    continue
                else:
                    print(f"✅ Broker Reconnected: {creds['login']}")
                    break # Proceed to next steps (Verification)
        
        if mt5_path:
             actual_path = mt5.terminal_info().path
             expected_dir = os.path.dirname(mt5_path) if mt5_path.endswith('exe') else mt5_path
             
             # Normalized lower case comparison for Windows
             if os.path.normpath(actual_path).lower() != os.path.normpath(expected_dir).lower():
                 print(f"[ERROR] TERMINAL MISMATCH! Expected Dir: {expected_dir}, Got: {actual_path}")
                 if not DRY_RUN:
                     print("[STOP] Aborting due to potential cross-trading risk.")
                     mt5.shutdown()
                     quit()
                     
        # Verify
        info = mt5.account_info()
        print(f"[OK] Exec-Engine Online. Account: {info.login if info else 'Unknown'}")

def is_within_trading_hours(config):
    """
    🕒 Checks if current UTC time is within allowed trading hours.
    Config schema: { mode: "24/7" | "CUSTOM", start: "HH:MM", end: "HH:MM" }
    """
    if not config: return True # Default 24/7
    
    # Handle Text Modes passed as string (e.g. from older or simple inputs)
    if isinstance(config, str):
         if config == "24/7": return True
         return True # Default open if format unknown
         
    mode = config.get("mode", "24/7")
    if mode == "24/7": return True
    
    start_str = config.get("start", "00:00")
    end_str = config.get("end", "23:59")
    
    # Current Time (UTC is safer for server-side)
    # But User expects "London Session", "NY Session".
    # The UI presets set specific UTC times for these.
    # So comparing UTC here is correct if UI sends UTC.
    now = datetime.utcnow().time() 
    
    try:
        s_h, s_m = map(int, start_str.split(':'))
        e_h, e_m = map(int, end_str.split(':'))
        start_time = d_time(s_h, s_m)
        end_time = d_time(e_h, e_m)
        
        if start_time < end_time:
            return start_time <= now <= end_time
        else: # Cross-midnight (e.g. 22:00 to 06:00)
            return now >= start_time or now <= end_time
    except Exception as e:
        print(f"[WARN] Invalid Time Config: {config} ({e})")
        return True # Fail Open


def acknowledge_signal(signal_id, status="EXECUTED", ticket=None, comment=None):
    # Find server again or reuse known URL? simpler to find again or pass around.
    # Let's reuse the logic or simple assumption logic for now. 
    # For MVP, we'll re-scan or just use the first working one.
    # Ideally `run_executor` should pass the `api_url`.
    pass 

def find_trade_by_ticket(target_ticket):
    """
    Robust Deep Scanning Strategy (O(N))
    """
    target_ticket_str = str(target_ticket)
    stub_exact = f"CPY:{target_ticket_str}"
    
    # 🛡️ CONNECTION RETRY for Positions
    # If terminal disconnects, positions_get returns None. We must retry.
    all_positions = None
    for attempt in range(2):
        if mt5.terminal_info() is None:
             print(f"   [WARN] Terminal info is None. Reconnecting...")
             initialize_mt5()
             time.sleep(0.5)

        all_positions = mt5.positions_get()
        if all_positions is not None:
             break
        print(f"   [WARN] positions_get() returned None. Retrying connection...")
        initialize_mt5()
        time.sleep(0.5)

    if all_positions is None: return None
    
    # Pass 1: Magic Number + Exact Comment Match (Fastest)
    for pos in all_positions:
        if pos.magic == 234000 and stub_exact in pos.comment:
            print(f"   [MATCH] Found Exact Match: {pos.ticket} (Comment: {pos.comment})")
            return pos
            
    # Pass 2: Loose Magic + Ticket in Comment (Handling manual mods)
    for pos in all_positions:
        if target_ticket_str in pos.comment:
            print(f"   [MATCH] Found Fuzzy Match: {pos.ticket} (Comment: {pos.comment})")
            return pos

    # Pass 3: DEEP AI HISTORY CHECK 🧠
    # Maybe we already closed it? If so, we should return a "Ghost" object or None but log it.
    # This precludes the "Error: Trade Not Found" panic.
    from datetime import datetime, timedelta
    history = mt5.history_deals_get(datetime.now() - timedelta(hours=24), datetime.now())
    if history:
        for deal in history:
            if deal.entry == mt5.DEAL_ENTRY_OUT and target_ticket_str in deal.comment:
                 print(f"   [INFO] Signal {target_ticket} was ALREADY CLOSED at {datetime.fromtimestamp(deal.time)}")
                 return None # Clean exit, no error needed

    # DEBUG: Help diagnose why we missed it
    print(f"   [DEBUG] Search for {target_ticket_str} failed. Dumping {len(all_positions)} open positions:")
    for p in all_positions:
        print(f"      -> Ticket: {p.ticket}, Magic: {p.magic}, Comment: '{p.comment}'")

    return None

def report_trade_result(deal, master_id, api_url):
    """
    Sends closed trade data to Analytics API
    """
    endpoint = api_url.replace("/api/engine/poll", "/api/webhook/trade-result")
    
    # 🕵️‍♂️ RECONSTRUCT TRADE LIFECYCLE
    # Check history to find the OPENING deal for this position
    open_time = 0
    open_price = 0
    
    try:
        # Fetch all deals for this Position ID
        position_deals = mt5.history_deals_get(position=deal.position_id)
        if position_deals:
            for d in position_deals:
                if d.entry == mt5.DEAL_ENTRY_IN:
                    open_time = d.time
                    open_price = d.price
                    break
    except Exception as e:
        print(f"   [WARN] Failed to fetch lifecycle for {deal.position_id}: {e}")

    payload = {
        "followerId": MY_FOLLOWER_ID,
        "masterId": str(master_id), # Master Ticket or ID
        "ticket": deal.ticket,
        "symbol": deal.symbol,
        "type": "BUY" if deal.type == 0 else "SELL", # 0=Buy, 1=Sell in Deal too? Actually Deal Entry Out type matters.
        # But we can infer from deal type. deal.type: 0=Buy, 1=Sell.
        "volume": deal.volume,
        "openPrice": open_price, 
        "closePrice": deal.price, 
        "openTime": int(open_time), 
        "closeTime": deal.time,
        "profit": deal.profit,
        "commission": deal.commission,
        "swap": deal.swap
    }
    
    try:
        requests.post(endpoint, json=payload, headers={"x-bridge-secret": BRIDGE_SECRET}, timeout=2)
        print(f"   [📊 ANALYTICS] Reported PnL: {deal.profit}")
    except Exception as e:
        print(f"   [WARN] Failed to report analytics: {e}")

def execute_trade(signal, api_url, follower_id=None):
    ticket = int(signal.get('ticket', 0)) # Handle String from BigInt JSON
    action = signal.get('action') # OPEN, CLOSE, MODIFY
    symbol = signal.get('symbol')
    trade_type = signal.get('type') # "BUY" or "SELL" (Optional for Close/Modify)
    signal_id = signal.get('id')
    
    master_lot = float(signal.get('volume', 0.01))
    volume = master_lot # Default

    
    print(f"[EXEC] PROCESSING: {action} {symbol} {trade_type or ''} {volume or ''} (Signal: {signal_id})")

    # ️ SAFETY CHECK: Verify Account ID matches Credentials
    # This prevents trading on Master account if path isolation failed
    # MOVED TO TOP to protect CLOSE/MODIFY actions too!
    # MOVED TO TOP to protect CLOSE/MODIFY actions too!
    current_account = mt5.account_info()
    
    # Use explicitly passed ID or fallback to Global (which we are trying to kill)
    target_id = follower_id if follower_id else MY_FOLLOWER_ID 
    creds = fetch_credentials(target_id) # Re-verify before trade
    
    if current_account and creds and str(current_account.login) != str(creds['login']):
         print(f"[WARN] Account Mismatch! Active: {current_account.login}, Target: {creds['login']}")
         print(f"[INFO] Attempting Auto-Login to {creds['login']}...")
         
         if login_mt5(creds):
              print(f"[OK] Switched Account successfully. Resume Trade...")
              # Small sleep to let terminal sync
              time.sleep(1)
         else:
              print("[STOP] Login switch failed. Blocking trade.")
              send_ack(api_url, signal_id, "FAILED", 0, "Account Switch Failed")
              return

    # 🔄 HANDLE CLOSE SIGNAL
    if action == "CLOSE":
        target_master_ticket = signal.get('ticket', '')
        
        # 🚀 NEW: Use Ticket Mapping for Robust Close
        follower_ticket_to_close = get_follower_ticket(target_master_ticket, follower_id)
        
        target_pos = None
        if follower_ticket_to_close:
            # Find position by its actual follower ticket
            all_positions = mt5.positions_get()
            if all_positions:
                for pos in all_positions:
                    if str(pos.ticket) == str(follower_ticket_to_close):
                        target_pos = pos
                        break
        
        # Fallback to comment search if mapping fails or is not found
        if not target_pos:
            target_pos = find_trade_by_ticket(target_master_ticket)
            
        # 🚀 RECONCILIATION: If position not found, check if it was ALREADY CLOSED (SL/TP/Manual)
        if not target_pos:
             # Search history for this Master Ticket
             stub_search = f"CPY:{target_master_ticket}"
             hist_deals = mt5.history_deals_get(datetime.now() - timedelta(hours=48), datetime.now())
             
             if hist_deals:
                 for d in hist_deals:
                     if d.entry == mt5.DEAL_ENTRY_OUT and (stub_search in d.comment or str(target_master_ticket) in d.comment):
                         print(f"   [INFO] Signal {target_master_ticket} was ALREADY CLOSED. Reporting Result...")
                         # Report the result since we missed the real-time event
                         report_trade_result(d, target_master_ticket, api_url)
                         send_ack(api_url, signal_id, "EXECUTED", d.order, "Already Closed")
                         return

        # Fallback FIFO Scan (only if not found in history)
        if not target_pos:
             # Emergency FIFO Scan for Symbol (Only if symbol is valid in this terminal context)
             pass

        if target_pos:
            # ✅ PRE-CLOSE SYMBOL SELECT FOR SAFETY
            if not mt5.symbol_select(target_pos.symbol, True):
                 print(f"   [WARN] Could not select {target_pos.symbol} for Close. Attempting anyway.")

            current_tick = mt5.symbol_info_tick(target_pos.symbol)
            # Retry Tick
            if not current_tick:
                for _ in range(5):
                    time.sleep(0.1)
                    current_tick = mt5.symbol_info_tick(target_pos.symbol)
                    if current_tick: break
            
            price_close = 0.0
            if current_tick:
                 price_close = current_tick.bid if target_pos.type == mt5.ORDER_TYPE_BUY else current_tick.ask
            else:
                 # Fallback to cached info
                 info = mt5.symbol_info(target_pos.symbol)
                 if info:
                     price_close = info.bid if target_pos.type == mt5.ORDER_TYPE_BUY else info.ask
            
            if price_close == 0.0:
                 print(f"   [ERROR] No Price for {target_pos.symbol}. Cannot Close.")
                 send_ack(api_url, signal_id, "FAILED", 0, "No Price")
                 return

            type_close = mt5.ORDER_TYPE_SELL if target_pos.type == mt5.ORDER_TYPE_BUY else mt5.ORDER_TYPE_BUY
            
            req = {
                "action": mt5.TRADE_ACTION_DEAL,
                "symbol": target_pos.symbol, # Use actual symbol from position
                "volume": target_pos.volume,
                "type": type_close,
                "position": target_pos.ticket,
                "price": price_close,
                "magic": 234000,
                "comment": f"Close {target_master_ticket}",
            }
            res = mt5.order_send(req)
            if res.retcode == mt5.TRADE_RETCODE_DONE:
                print(f"   [OK] Closed {target_pos.symbol} (Ticket: {res.order}) matched to Master {target_master_ticket}")
                send_ack(api_url, signal_id, "EXECUTED", res.order, "Closed")

                # 🛠️ POST-CLOSE ANALYTICS
                # After execution, verify deal in history to get PnL
                # Wait a bit for history to update
                time.sleep(1)
                from datetime import datetime
                # Scan last minute history for this ticket? 
                # Note: Deal Ticket != Order Ticket != Position Ticket. 
                # Position ID is the key.
                
                # We know 'target_ticket' (Master Ticket). But we closed 'target_pos.ticket' (Follower Ticket).
                # We need to find the DEAL associated with 'target_pos.ticket'.
                
                # Correct Logic:
                # 1. Get History for last 1 min.
                # 2. Find Deal where position_id == target_pos.ticket AND entry == DEAL_ENTRY_OUT
                
                history = mt5.history_deals_get(datetime.now() - timedelta(minutes=1), datetime.now())
                if history:
                    for deal in history:
                         if deal.position_id == target_pos.ticket and deal.entry == mt5.DEAL_ENTRY_OUT:
                             # Found it!
                             master_id = signal.get('ticket', 'UNKNOWN') # Use signal's ticket as masterId
                             report_trade_result(deal, master_id, api_url)
                             break
                
                # --- END CLOSE LOGIC ---
                return
            else:
                print(f"   [ERROR] Close Failed: {res.comment}")
        else:
             print(f"   [WARN] No matching copy trade found to close for {symbol}")
             send_ack(api_url, signal_id, "FAILED", 0, "Trade not found")
        return

    # 🛠️ HANDLE MODIFY SIGNAL
    if action == "MODIFY":
        target_master_ticket = signal.get('ticket', '')
        
        # 🚀 NEW: Use Ticket Mapping for Robust Modify
        follower_ticket_to_modify = get_follower_ticket(target_master_ticket, follower_id)
        
        target_pos = None
        if follower_ticket_to_modify:
            all_positions = mt5.positions_get()
            if all_positions:
                for pos in all_positions:
                    if str(pos.ticket) == str(follower_ticket_to_modify):
                        target_pos = pos
                        break
        
        # Fallback to comment search if mapping fails or is not found
        if not target_pos:
            target_pos = find_trade_by_ticket(target_master_ticket)
        
        if target_pos:
            sl = float(signal.get('sl', 0.0))
            tp = float(signal.get('tp', 0.0))
            
            print(f"   [MODIFY] Updating Ticket {target_pos.ticket} -> SL: {sl}, TP: {tp}")
            
            req = {
                "action": mt5.TRADE_ACTION_SLTP,
                "symbol": target_pos.symbol,
                "position": target_pos.ticket,
                "sl": sl,
                "tp": tp,
                "magic": 234000,
            }
            res = mt5.order_send(req)
            if res.retcode == mt5.TRADE_RETCODE_DONE:
                 print(f"   [OK] Modified Ticket {target_pos.ticket}")
                 send_ack(api_url, signal_id, "EXECUTED", target_pos.ticket, "Modified")
            else:
                 print(f"   [ERROR] Notify Failed: {res.comment}")
        else:
            print(f"   [WARN] Could not find trade to modify for Master Ticket {target_master_ticket}")
            send_ack(api_url, signal_id, "FAILED", 0, "Trade Not Found")
        return


    # 🚫 HANDLE OTHERS
    if action != "OPEN":
         send_ack(api_url, signal_id, "EXECUTED", 0, "Skipped")
         return

    if not trade_type or not volume:
         print(f"   ❌ Invalid OPEN signal")
         send_ack(api_url, signal_id, "FAILED", 0, "Invalid Data")
         return

    # 1. ⚖️ PRO-RATA & SAFETY CHECK
    # Fetch risk factor if not passed
    risk_factor = 100.0
    master_id_str = str(signal.get('masterId') or signal.get('ticket'))
    
    # Try fetch from DB (Single Mode fallback)
    try:
         if follower_id:
             conn = get_db_connection()
             if conn:
                 cur = conn.cursor()
                 cur.execute('SELECT "riskFactor" FROM "CopySession" WHERE "followerId"=%s AND "masterId"=%s', (follower_id, master_id_str))
                 row = cur.fetchone()
                 if row:
                     risk_factor = float(row[0])
                 cur.close()
                 conn.close()
    except Exception as e:
         print(f"   [WARN] Could not fetch risk factor: {e}")

    # Calculate Safe Lot
    acct = mt5.account_info()
    if acct:
        safe_vol = calculate_safe_lot(float(volume), acct.equity, acct.leverage, risk_factor, symbol)
        if safe_vol <= 0:
            print(f"   [SKIP] Safe Lot is 0.0 (Margin/Risk). Skipping.")
            send_ack(api_url, signal_id, "FAILED", 0, "Risk Limit")
            return
        
        print(f"   [EXEC] ⚖️ Pro-Rata Applied: {volume} -> {safe_vol} (Risk: {risk_factor}%)")
        volume = safe_vol

    # 2. SMART SYMBOL NORMALIZATION
    # Maps GOLD->XAUUSD, US30->DJ30, etc. before selecting
    normalized = normalize_symbol(symbol)
    if normalized:
        if normalized != symbol:
            print(f"   [INFO] Normalized Symbol {symbol} -> {normalized}")
        symbol = normalized
    else:
        print(f"   [ERROR] Symbol {symbol} not found (Aliases checked).")
        send_ack(api_url, signal_id, "FAILED", 0, "Symbol Not Found")
        return

    # 2. WAIT FOR TICK (Prevent 'No Tick' Error)
    current_tick = mt5.symbol_info_tick(symbol)
    if not current_tick:
        # Retry loop for 2 seconds (sometimes tick arrives late after selection)
        for _ in range(10):
            time.sleep(0.2)
            current_tick = mt5.symbol_info_tick(symbol)
            if current_tick: break
    
    if not current_tick:
        print(f"[ERROR] No tick for {symbol}")
        return

    market_price = current_tick.ask if trade_type == "BUY" else current_tick.bid
    
    # 🛡️ CRITICAL: Verify Account Match BEFORE ACTION
    current_account = mt5.account_info()
    expected_login = TARGET_LOGIN_ID
    
    if not current_account or (expected_login and str(current_account.login) != str(expected_login)):
        print(f"   [CRITICAL] Account Mismatch! Expected {expected_login}, Found {current_account.login if current_account else 'None'}. ABORTING.")
        # Attempt Re-login? No, safety first. Fail the trade.
        # Actually, in run_executor loop, we try to switch. If we are here, switch FAILED or was reverted.
        # Let's try one last emergency switch?
        # NO. Be strict.
        send_ack(api_url, signal_id, "FAILED", 0, "Account Mismatch on Execution")
        return

    # Check difference between Master's Entry Price (signal['price']) and Current Market Price
    master_price = signal.get('price')
    MAX_SLIPPAGE_POINTS = 50 # Configurable: 50 points = 5 pips
    
    # 🛡️ IDEMPOTENCY CHECK (Strict)
    # Check if we ALREADY have a trade for this Master Ticket
    existing_positions = mt5.positions_get(symbol=symbol)
    if existing_positions:
        stub = f"CPY:{signal.get('ticket')}"
        for pos in existing_positions:
            if pos.magic == 234000 and stub in pos.comment:
                print(f"   [WARN] Duplicate Signal Ignored. Trade already exists for Ticket {signal.get('ticket')}")
                processed_signals.add(signal_id) # Mark handled
                send_ack(api_url, signal_id, "EXECUTED", pos.ticket, "Duplicate Ignored")
                return

    if master_price:
        point = mt5.symbol_info(symbol).point
        diff_points = abs(market_price - float(master_price)) / point
        
        # ⚠️ SLIPPAGE WARNING (Non-blocking for now due to data mismatch potentially)
        if diff_points > MAX_SLIPPAGE_POINTS:
            msg = f"Slippage High: {int(diff_points)} pts"
            # print(f"   ⚠️ {msg} (Executing anyway)") 
            # send_ack(api_url, signal_id, "WARNING", 0, msg)
        # else:
            # print(f"   ✅ Price OK")

    # Safety Check moved to top of function
    
    # 🧠 AUTO-RISK: Normalize Volume & Price Precision
    # Enforces 0.01 min lots, steps, and correct digits
    volume, market_price, sl_val, tp_val = normalize_trade_params(
        symbol, float(volume), market_price, float(signal.get('sl', 0.0)), float(signal.get('tp', 0.0))
    )

    # Prepare Order
    order_type = mt5.ORDER_TYPE_BUY if trade_type == "BUY" else mt5.ORDER_TYPE_SELL

    request = {
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": symbol,
        "volume": volume,
        "type": order_type,
        "price": market_price,
        "deviation": 20, # Tolerance within execution
        "magic": 234000,
        "comment": f"CPY:{signal['ticket']}", # Store Master Ticket for precise closing
        "sl": sl_val,
        "tp": tp_val,
        "type_time": mt5.ORDER_TIME_GTC,
        "type_filling": mt5.ORDER_FILLING_IOC,
    }
    
    # Send
    result = mt5.order_send(request)
    
    if result is None:
        error_code, description = mt5.last_error()
        print(f"[ERROR] Order Send Failed (Result is None). Error: {error_code}, {description}")
        send_ack(api_url, signal_id, "FAILED", 0, f"MT5 Error {error_code}: {description}")
        return

    if result.retcode != mt5.TRADE_RETCODE_DONE:
        print("[ERROR] Order Send Failed:", result.comment)
        send_ack(api_url, signal_id, "FAILED", 0, result.comment)
    else:
        print("[OK] Order Executed:", result.order)
        send_ack(api_url, signal_id, "EXECUTED", result.order, "Filled")

        # 🚀 FEEDBACK LOOP: Publish Execution Event for Admin Dashboard
        try:
             exec_payload = json.dumps({
                 "type": "EXECUTION",
                 "followerId": MY_FOLLOWER_ID,
                 "masterTicket": signal.get('ticket'),
                 "followerTicket": str(result.order),
                 "symbol": symbol,
                 "action": action,
                 "status": "FILLED",
                 "timestamp": time.time()
             })
             if r_client:
                 r_client.publish('channel:executions', exec_payload)
                 # print(f"   [📡] Reported Execution to Dashboard")
        except Exception as e:
             print(f"   [WARN] Failed to report execution: {e}")

def send_ack(api_url, signal_id, status, ticket, comment):
    try:
        payload = {
            "signalId": signal_id,
            "status": status,
            "ticket": ticket,
            "comment": comment
        }
        requests.post(api_url, json=payload, headers={"x-bridge-secret": BRIDGE_SECRET}, timeout=2)
        print(f"   [ACK] Acknowledged {status}")
    except Exception as e:
        print(f"   [WARN] Ack Failed: {e}")

def find_server():
    print("[INFO] Searching for Signal Server...")
    for host in HOSTS:
        url = get_api_url(host)
        try:
            print(f"   Trying {url}...", end="")
            requests.get(f"{url}?followerId={MY_FOLLOWER_ID}", 
                         headers={"x-bridge-secret": BRIDGE_SECRET}, timeout=3)
            print(" [OK]")
            return url
        except Exception as e:
            print(f" [ERROR] Failed ({e})")
    print("[ERROR] Could not connect to any server.")
    return None

from datetime import datetime

def disable_all_sessions(follower_id, reason="Risk Stop"):
    """
    🛑 HARD STOP: Updates DB to disable all active sessions for this user.
    Called when Equity Hard Stop or Daily Loss Limit is breached.
    """
    conn = get_db_connection()
    if not conn: return
    try:
        cur = conn.cursor()
        print(f"🛑 [RISK] Disabling ALL Copy Sessions for {follower_id} due to: {reason}")
        
        # Deactivate all active sessions for this follower
        cur.execute('UPDATE "CopySession" SET "isActive" = false WHERE "followerId" = %s AND "isActive" = true', (follower_id,))
        rows_affected = cur.rowcount
        conn.commit()
        cur.close()
        conn.close()
        
        print(f"   [DB] Deactivated {rows_affected} sessions.")

        # Notify UI via Redis
        if r_client:
             payload = json.dumps({
                 "type": "RISK_STOP",
                 "reason": reason,
                 "followerId": follower_id
             })
             # Broadcast to user specific channel
             r_client.publish(f"events:user:{follower_id}", payload)
             
    except Exception as e:
        print(f"[ERR] Failed to disable sessions: {e}")


def check_risk_guards(creds):
    """
    🛡️ ADVANCED RISK CONTROLS
    Checks Daily Loss and Minimum Equity thresholds.
    Triggers Emergency Stop if breached.
    """
    if not creds: return

    # 1. Parse Limits
    max_daily_loss = float(creds.get('maxDailyLoss', 0) or 0)
    min_equity = float(creds.get('minEquity', 0) or 0)

    # If no risk rules active, exit
    if max_daily_loss <= 0 and min_equity <= 0: return

    account = mt5.account_info()
    if not account: return

    # 2. Check Equity Hard Stop
    current_equity = account.equity
    if min_equity > 0 and current_equity < min_equity:
        print(f"🚨 [RISK] HARD STOP! Equity ({current_equity}) < Limit ({min_equity})")
        # 1. Disable Copying FIRST (Prevent new trades)
        disable_all_sessions(MY_FOLLOWER_ID, "Equity Hard Stop")
        # 2. Close Existing
        emergency_close_all("Equity Hard Stop Triggered")
        return

    # 3. Check Daily Loss Limit
    if max_daily_loss > 0:
        # Calculate Daily PnL
        now = datetime.now()
        midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
        
        # Get deals from midnight until now
        deals = mt5.history_deals_get(midnight, now)
        daily_pnl = 0.0
        
        if deals:
             for d in deals:
                 daily_pnl += d.profit + d.swap + d.commission

        # Include Floating PnL (Unrealized) for stricter safety? 
        # Usually Daily Loss = Realized + Unrealized
        # floating_pnl = account.equity - account.balance
        # total_daily_impact = daily_pnl + floating_pnl
        
        # Calculate Drawdown % for monitoring
        if account.balance > 0:
             dd_percent = (daily_pnl / account.balance) * 100
             if dd_percent < -5:
                 print(f"   ⚠️ [ALERT] High Daily Drawdown: {dd_percent:.2f}%")

        print(f"   [🛡️] Daily PnL: {daily_pnl:.2f} / Max Loss: -{max_daily_loss}")

        if daily_pnl < (-1 * max_daily_loss):
             print(f"🚨 [RISK] DAILY LOSS LIMIT! PnL ({daily_pnl}) < Limit (-{max_daily_loss})")
             # 1. Disable Copying FIRST
             disable_all_sessions(MY_FOLLOWER_ID, "Daily Loss Limit")
             # 2. Close Existing
             emergency_close_all("Daily Loss Limit Triggered")

def emergency_close_all(reason="Emergency Stop"):
    """
    Iterates all open positions and closes them immediately.
    """
    positions = mt5.positions_get()
    if not positions:
        print("[ℹ️] No positions to close.")
        return

    print(f"🔥 [EMERGENCY] CLOSING ALL {len(positions)} POSITIONS! Reason: {reason}")
    for pos in positions:
        request = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": pos.symbol,
            "volume": pos.volume,
            "type": mt5.ORDER_TYPE_SELL if pos.type == mt5.ORDER_TYPE_BUY else mt5.ORDER_TYPE_BUY,
            "position": pos.ticket,
            "price": mt5.symbol_info_tick(pos.symbol).bid if pos.type == mt5.ORDER_TYPE_BUY else mt5.symbol_info_tick(pos.symbol).ask,
            "deviation": 50,
            "magic": 234000,
            "comment": f"RISK:{reason}",
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": mt5.ORDER_FILLING_IOC,
        }
        res = mt5.order_send(request)
        if res.retcode != mt5.TRADE_RETCODE_DONE:
            print(f"   ❌ Close Failed: {res.comment}")
        else:
            print(f"   ✅ Closed Ticket {pos.ticket}")

def sync_balance(api_url):
    # 🔒 GLOBAL LOCK: Prevent fighting with HFT Swarm
    ctx_lock = None
    try:
        from hft_executor import get_global_lock
        ctx_lock = get_global_lock()
    except ImportError: pass

    def _run_balance_sync():
        try:
            # ⚠️ DO NOT re-initialize without path! It can switch terminals.
            # Just check if we are still connected.
            if not mt5.terminal_info(): return
            
            # 🔄 Re-fetch credentials to get latest Risk Settings from DB
            # This allows user to update Risk Limit in UI and have it apply immediately
            # creds = fetch_credentials() 
            creds = None # Bypass dynamic update for now to stop spam 
            
            # 🛡️ RUN RISK CHECKS
            check_risk_guards(creds)
            
            account = mt5.account_info()
            if not account: return
    
            # Construct Base URL (strip /api/engine/poll)
            base_url = api_url.replace("/api/engine/poll", "/api/user/broker")
            
            payload = {
                "balance": account.balance,
                "equity": account.equity,
                "leverage": account.leverage,
                "login": account.login,
                "floating": {} 
            }
    
            # 📊 AGGREGATE FLOATING PNL & DETAILED POSITIONS
            positions = mt5.positions_get()
            detailed_positions = []
            
            if positions:
                for pos in positions:
                    # 1. PnL Aggregation (Existing Logic)
                    if pos.magic == 234000 and "CPY:" in pos.comment:
                         try:
                             master_ticket = pos.comment.split(':')[1]
                             current_pnl = payload["floating"].get(master_ticket, 0.0)
                             payload["floating"][master_ticket] = current_pnl + pos.profit
                         except:
                             pass
                    
                    # 2. Detailed Position Capture (New)
                    if pos.magic == 234000:
                        pos_data = {
                            "ticket": str(pos.ticket),
                            "symbol": pos.symbol,
                            "type": "BUY" if pos.type == 0 else "SELL",
                            "volume": pos.volume,
                            "openPrice": pos.price_open,
                            "currentPrice": pos.price_current,
                            "sl": pos.sl,
                            "tp": pos.tp,
                            "swap": pos.swap,
                            # 🛡️ SAFETY: Some brokers don't populate 'commission'. Use getattr.
                            "commission": getattr(pos, 'commission', 0.0),
                            "profit": pos.profit,
                            "openTime": pos.time # Timestamp
                        }
                        detailed_positions.append(pos_data)
    
            payload["positions"] = detailed_positions # Add to Payload
    
            headers = {
                "x-bridge-secret": BRIDGE_SECRET,
                "x-user-id": MY_FOLLOWER_ID
            }
            # Fire and forget (timeout 1s)
            requests.put(base_url, json=payload, headers=headers, timeout=1)
            print(f"   [💰 SYNC] Balance: {account.balance} Equity: {account.equity}")
        except Exception as e:
            print(f"   [WARN] Sync Balance Failed: {e}")

    # EXECUTE WITH LOCK
    if ctx_lock:
         # Non-Blocking Attempt (If HFT busy, skip balance sync)
         if ctx_lock.acquire(blocking=False):
             try:
                 _run_balance_sync()
             finally:
                 ctx_lock.release()
         else:
             # print("[SYNC] Balance Check Skipped (HFT Busy)")
             pass
    else:
        _run_balance_sync()

# Avoid duplicate processing
processed_signals = set()
# ⚙️ REDIS CONFIGURATION (Loaded from .env)
# 9. Initialize Redis
# Use 127.0.0.1 to be safe against IPv6 issues on Windows
REDIS_URL = os.getenv("REDIS_URL", "redis://127.0.0.1:6379")
import redis
try:
    r_client = redis.from_url(REDIS_URL, decode_responses=True)
    r_client.ping()
    print(f"[OK] Connected to Redis Cache: {'Cloud' if 'upstash' in REDIS_URL else 'Local'}")
except Exception as e:
    print(f"[WARN] Redis Connection Failed: {e}")
    r_client = None


def verify_master_history_closure(master_id, master_ticket_str, from_ts=0):
    """
    Checks if a ticket exists in the Master's Closed History (Redis Set).
    Returns True if confirmed closed.
    """
    if not r_client: return False
    key = f"history:master:{master_id}:closed"
    return r_client.sismember(key, str(master_ticket_str))

# 🕵️ RECONCILIATION LOGIC (Anti-Ghosting)
def reconcile_positions(api_url):
    try:
        # 1. Get subscriptions DYNAMICALLY
        subs = fetch_subscriptions(MY_FOLLOWER_ID)
        if not subs: return

        for sub_master_id in subs: # sub_master_id is just the master ID string
            
            # 2. Get Master State
            key = f"state:master:{sub_master_id}:tickets"
            data = r_client.get(key)
            if not data: continue
            
            state = json.loads(data)
            # Support both Legacy List and New Dict format
            if isinstance(state.get("tickets"), list):
                 master_tickets = set(map(str, state['tickets']))
            elif isinstance(state.get("positions"), dict):
                 master_tickets = set(state['positions'].keys())
            else:
                 continue

            last_seen = state['timestamp']
            
            # AGE CHECK: If snapshot is older than 15s, Master might be offline. UNSAFE to reconcile.
            if time.time() - last_seen > 15:
                continue

            # 2. Scan Local Positions
            local_positions = mt5.positions_get()
            if not local_positions: continue
            
            for pos in local_positions:
                if pos.magic != 234000: continue
                
                # extracting master ticket from comment "CPY:"
                if "CPY:" not in pos.comment: continue
                
                try:
                    master_ticket_id = pos.comment.split(':')[1]
                except:
                    continue

                # NB: Double loop removal. 
                # The main Ghost Logic is now unified at the END of reconcile_initial_state.
                pass

    except Exception as e:
        print(f"[WARN] Reconciliation Error: {e}")

# 🔒 SINGLETON LOCK (Prevent Duplicate Execution)
def acquire_lock(account_id):
    if not r_client: return True # No Redis = No Safety (Warned elsewhere)
    key = f"lock:executor:{account_id}"
    
    # Retry logic for Fast Restarts
    # OLD: 3 attempts * 5s = 15s
    # NEW: 60 attempts * 0.25s = 15s max wait (Responsive)
    for attempt in range(1, 61):
        # Try to set lock with 10s expiry (Heartbeat needed every 5s)
        is_locked = r_client.set(key, "LOCKED", ex=10, nx=True)
        if is_locked:
            print(f"[LOCK] 🔒 Acquired Safety Lock for {account_id}")
            return True
        
        # Only warn every 5th attempt to reduce spam
        if attempt % 5 == 0:
            print(f"[WARN] Lock exists for {account_id}. Retrying... ({attempt}/60)")
        time.sleep(0.25)

# 🔐 GLOBAL TERMINAL MUTEX (1:N Concurrency)
# Ensures only ONE Executor operates on the physical terminal at a time.
# Crucial for 1:50 shared terminal setups.
# 🔐 GLOBAL TERMINAL MUTEX (Legacy Definitions Removed)
# See unified definitions at top of file (around line 77)
# This ensures consistency with verify.py and broadcaster.py
pass



def refresh_lock(account_id):
    if r_client:
        r_client.expire(f"lock:executor:{account_id}", 10)

def release_lock(account_id):
    if r_client:
        r_client.delete(f"lock:executor:{account_id}")
        print(f"[LOCK] 🔓 Released Lock for {account_id}")

def reconcile_initial_state(api_url, cached_subs=None):
    """
    startup-check: Fetches Master's active state from Redis and executes any missed trades.
    Only executes if Slippage is within acceptable limits.
    """
    # 🔒 GLOBAL LOCK REMOVED: Granular locking moved to _internal_reconcile_logic to avoid HFT Deadlock
    return _internal_reconcile_logic(api_url, cached_subs)

# Renaming original logic to internal helper to avoid massive indent diff
def _internal_reconcile_logic(api_url, cached_subs=None):
    global MY_FOLLOWER_ID, PROCESSED_CATCHUP_TICKETS
    # 🩹 IMPORT GLOBAL LOCK LOCAL
    ctx_lock = None
    try:
        from hft_executor import get_global_lock
        ctx_lock = get_global_lock()
    except: pass
    
def verify_master_history_closure(master_id, master_ticket, from_ts=None):
    """
    🛡️ ZOMBIE GUARD: Checks if a trade is effectively closed.
    Sources: 1. Redis 'history:master:closed', 2. Local MT5 History
    """
    m_ticket_str = str(master_ticket)
    # 1. Check Redis
    if r_client:
        key = f"history:master:{master_id}:closed"
        if r_client.sismember(key, m_ticket_str): return True
    # 2. Check Local History
    try:
        from datetime import datetime, timedelta
        
        # Optimize: If we know when the position opened, scan from there.
        # Otherwise scan last 48 hours.
        if from_ts and isinstance(from_ts, (int, float)) and from_ts > 0:
             from_date = datetime.fromtimestamp(from_ts) - timedelta(minutes=5) # Buffer
        else:
             from_date = datetime.utcnow() - timedelta(hours=48)
             
        to_date = datetime.utcnow() + timedelta(hours=1)
        to_date = datetime.utcnow() + timedelta(hours=1)
        deals = mt5.history_deals_get(from_date, to_date)
        if deals:
            search_tag = f"CPY:{m_ticket_str}"
            for d in deals:
                if d.entry == mt5.DEAL_ENTRY_OUT and search_tag in d.comment:
                    return True
    except: pass
    return False

def reconcile_initial_state(api_url, cached_subs=None):
    # 🔒 GLOBAL LOCK REMOVED: Granular locking moved to _internal_reconcile_logic
    return _internal_reconcile_logic(api_url, cached_subs)

def _internal_reconcile_logic(api_url, cached_subs=None):
    global MY_FOLLOWER_ID, PROCESSED_CATCHUP_TICKETS
    # 🩹 IMPORT GLOBAL LOCK LOCAL
    ctx_lock = None
    try:
        from hft_executor import get_global_lock
        ctx_lock = get_global_lock()
    except: pass

    print("[RECON] 🧐 Checking for missed trades...")
    reconnected = False
    if not r_client: return False

    # Get subscriptions (Use Cache if available to save DB hits)
    subs = cached_subs if cached_subs else fetch_subscriptions(MY_FOLLOWER_ID)
    if not subs: return

    for sub_master_id in subs: # sub_master_id is just the master ID string
        state_key = f"state:master:{sub_master_id}:tickets"
        # ⏳ WAIT FOR BROADCASTER (Race Condition Fix)
        # If Broadcaster is starting up, Redis key might be empty.
        # We must wait for it to populate, otherwise we skip Ghost Checks.
        state_key = f"state:master:{sub_master_id}:tickets"
        
        # 🏁 READY CHECK: Wait for Broadcaster Hydration (Fixes Race Condition)
        ready_key = f"state:master:{sub_master_id}:ready"
        if not r_client.get(ready_key):
             print(f"   [SYNC] Master {sub_master_id} Not Ready (Hydrating). Waiting...")
             for _ in range(120): # Wait 60s max (Critical for Cold Start)
                  time.sleep(0.5)
                  if r_client.get(ready_key): 
                      print(f"   [SYNC] Master {sub_master_id} is now Ready!")
                      break
        
        # ⚡ NON-BLOCKING CHECK (Fix for Real-Time Lag)
        # We check Redis once. If data is there, we sync.
        # If not (Broadcaster starting/lagging), we SKIP immediately to avoid blocking Pub/Sub.
        data = r_client.get(state_key)
        
        if not data:
             # Just debug at verbose level, don't spam warnings unless persistent
             print(f"   [WARN] Broadcaster State missing for {sub_master_id}. Timed Out. Skipping sync.")
             continue

        try:
            state = json.loads(data)
            master_positions = state.get("positions", {}) # New Full State
            
            # 👻 GHOST BUSTER MOVED TO END (Priority Adjustment)
            pass
            

            

            # ==================================================================================
            # 5. GHOST BUSTER (Deferred to End)
            # ==================================================================================
            # 🔒 ACQUIRE LOCK (Ghost Buster & Verification)
            if ctx_lock: ctx_lock.acquire(timeout=10.0)

            # Check for trades closed while offline.
            closed_set_key = f"history:master:{sub_master_id}:closed"
            closed_since_offline = r_client.smembers(closed_set_key)
            
            if closed_since_offline and EXECUTION_MODE in ['BATCH', 'TURBO']:
                # print(f"[SYNC] 👻 Remote Ghost Buster Active for Master {sub_master_id}. Checking {len(closed_since_offline)} closed tickets...")
                targets = subs.get(sub_master_id, [])
                if isinstance(targets, dict): targets = [targets]
                
                if targets:
                    try:
                        from hft_executor import process_batch
                    except ImportError:
                        pass 
                        
                    total_busted = 0
                    # Optimization: Only check UNPROCESSED ghosts
                    to_check = [t for t in closed_since_offline if str(t) not in PROCESSED_GHOST_TICKETS]
                    
                    if to_check:
                        if len(to_check) > 0:
                            print(f"[SYNC] 👻 Ghost Buster: Processing {len(to_check)} new closed tickets...")
                            
                        # 📦 BULK OPTIMIZATION: Group by Follower
                        # Avoids Account Switching ping-pong (Switch Once -> Close All)
                        follower_tasks = {} # { follower_id: { 'creds': c, 'tickets': [t1, t2] } }

                        # 1. Resolve All Targets
                        limit_check = 0
                        for m_ticket in to_check:
                            limit_check += 1
                            if limit_check > 50: # 🛑 Limit to 50 Ghosts per cycle to avoid blocking
                                break
                                
                            PROCESSED_GHOST_TICKETS.add(str(m_ticket))
                            
                            for t in targets:
                                try:
                                    f_id = t['follower_id']
                                    target_ticket = 0
                                    try:
                                        # Try simple conversion first
                                        resolved_t = get_follower_ticket(m_ticket, f_id)
                                        if resolved_t: target_ticket = int(resolved_t)
                                    except: pass
                                    
                                    if target_ticket > 0:
                                        if f_id not in follower_tasks:
                                            creds = fetch_credentials(f_id)
                                            if creds and 'login' in creds:
                                                follower_tasks[f_id] = { 'creds': creds, 'tickets': [] }
                                        
                                        if f_id in follower_tasks:
                                            follower_tasks[f_id]['tickets'].append(target_ticket)
                                except: pass

                        # 2. Execute Bulk Closes (Per Follower)
                        if follower_tasks:
                            print(f"[SYNC] 👻 Executing Bulk Close for {len(follower_tasks)} Followers...")
                            
                            for f_id, data in follower_tasks.items():
                                t_list = data['tickets']
                                if not t_list: continue
                                
                                # LOGIN ONCE
                                if login_mt5(data['creds']):
                                    # 🔒 REDIS LOCK (Main Thread Visibility)
                                    # Signal Broadcaster that we (Executor Main) are busy
                                    redis_lock_key = None
                                    if r_client and MT5_PATH_ARG:
                                        try:
                                            lock_seed = os.path.normpath(str(MT5_PATH_ARG)).lower().strip()
                                            import hashlib
                                            path_hash = hashlib.md5(lock_seed.encode()).hexdigest()
                                            redis_lock_key = f"lock:terminal:{path_hash}"
                                            r_client.set(redis_lock_key, f"EXECUTOR_MAIN_{data['creds']['login']}", ex=20)
                                        except: pass

                                    print(f"   -> Follower {data['creds']['login']}: Closing {len(t_list)} Ghosts...")
                                    
                                    for t_ticket in t_list:
                                        # Close Logic
                                        positions = mt5.positions_get(ticket=t_ticket)
                                        if positions:
                                            pos = positions[0]
                                            # Determine Close Type
                                            tick = mt5.symbol_info_tick(pos.symbol)
                                            if not tick: continue
                                            
                                            # Opposing Order
                                            type_op = mt5.ORDER_TYPE_SELL if pos.type == mt5.ORDER_TYPE_BUY else mt5.ORDER_TYPE_BUY
                                            price = tick.bid if type_op == mt5.ORDER_TYPE_SELL else tick.ask
                                            
                                            request = {
                                                "action": mt5.TRADE_ACTION_DEAL,
                                                "position": pos.ticket,
                                                "symbol": pos.symbol,
                                                "volume": pos.volume,
                                                "type": type_op,
                                                "price": price,
                                                "magic": pos.magic, 
                                                "comment": "Ghost Buster",
                                                "type_time": mt5.ORDER_TIME_GTC,
                                                "type_filling": mt5.ORDER_FILLING_IOC,
                                            }
                                            
                                            ret = mt5.order_send(request)
                                            if ret and ret.retcode == mt5.TRADE_RETCODE_DONE:
                                                total_busted += 1
                                    
                                    # 🔓 RELEASE LOCK (Main Thread)
                                    if 'redis_lock_key' in locals() and redis_lock_key and r_client:
                                         try: r_client.delete(redis_lock_key)
                                         except: pass
                        
                        if total_busted > 0:
                            print(f"        -> [✅] Ghost Buster: Successfully closed {total_busted} positions.")
            
            # (Lock continues held for Verification...)

            # 🛡️ ACCOUNT INTEGRITY CHECKS (STRICT)
            # Ensure we are logged in as the correct Follower!
            # If we are on the wrong account, we will see 0 positions and fail to Sync/Ghost-Bust.
            if MY_FOLLOWER_ID:
                 current_info = mt5.account_info()
                 
                 # Fetch Expected Credentials
                 # We assume fetch_credentials caches or is fast.
                 creds = fetch_credentials(MY_FOLLOWER_ID)
                 
                 if creds == "FATAL_404":
                     print(f"   [WAIT] 🛑 Account {MY_FOLLOWER_ID} Not Found (Disconnected). Pausing Sync...")
                     mt5.shutdown() # 🟢 Release Terminal for Verification Script
                     while True:
                         time.sleep(5)
                         creds = fetch_credentials(MY_FOLLOWER_ID)
                         
                         if creds != "FATAL_404" and isinstance(creds, dict):
                             # 🟢 WAKE UP: Re-Initialize MT5
                             if mt5.initialize(path=MT5_PATH_ARG, login=int(creds['login']), password=creds['password'], server=creds['server']):
                                 print(f"   [RESUME] ✅ Account Reconnected! Resuming Sync...")
                                 reconnected = True
                                 break # Proceed
                             else:
                                 print(f"   [ERROR] Re-Init Failed: {mt5.last_error()}. Retrying...")
                                 mt5.shutdown()

                 
                 elif not creds:
                     # 🚨 RED ALERT: We failed to get credentials (Network Error?)
                     # If we are on the WRONG account, we MUST NOT CONTINUE.
                     target_login_guess = 0
                     try:
                         target_login_guess = int(MY_FOLLOWER_ID)
                     except:
                         # UUID fallback: If we can't get creds, we can't get Login.
                         # We can't verify account. Abort unless Turbo.
                         target_login_guess = 0 # Signal Unknown
                     
                     # 🧠 DYNAMIC IDENTITY (Turbo Mode)
                     if EXECUTION_MODE == 'TURBO':
                          # Just warn, don't kill. The Worker likely owns the terminal now.
                          if current_info and str(current_info.login) != str(target_login_guess):
                              print(f"   [INFO] Turbo Swarm active: Terminal is on {current_info.login} (Manager: {target_login_guess}). Continuing...")
                              pass 
                     
                     elif current_info and str(current_info.login) != str(target_login_guess):
                         print(f"   [STOP] 🛑 Account Mismatch ({current_info.login} vs {target_login_guess}) AND API Unreachable.")
                         print(f"   [FATAL] Cannot verify identity. Aborting to prevent cross-trading.")
                         import os
                         os._exit(1)
                     
                     print(f"   [STOP] 🛑 API Error: Could not fetch credentials for {MY_FOLLOWER_ID}. Skipping Sync (Safe Mode: Identity OK).")
                     if ctx_lock: # Release before return
                         try: ctx_lock.release() 
                         except: pass
                     return # Abort (Prevent using wrong account's data)

                 else:
                     # ✅ Got Credentials -> Verify/Switch
                     target_login = int(creds['login'])
                     if current_info is None or current_info.login != target_login:
                          if current_info:
                               print(f"   [WARN] Account Mismatch! Expected: {target_login}, Found: {current_info.login}")
                          else:
                               print(f"   [WARN] No Account Info. Attempting Login...")
                          print(f"   -> Attempting to switch...")
                          
                          res = mt5.login(login=target_login, password=creds['password'], server=creds['server'])
                          if res:
                               print(f"   [OK] ✅ Switched to Correct Account: {target_login}")
                               # ⚡ OPTIMIZED: Smart Poll + Trade Cache Sync
                               # Wait for MT5 to confirm the new login in account_info()
                               for _ in range(20): # Max 2.0s
                                   info = mt5.account_info()
                                   if info and info.login == target_login:
                                       break
                                   time.sleep(0.1)
                                   
                               # 🛑 CRITICAL STABILITY: Position Stabilization Loop
                               # Wait for Trade List to populate to prevent "False Catch-Up" loops.
                               # If 0 positions, wait up to 5s. If >0, proceed immediately.
                               waited_pos = 0
                               for _ in range(25): # Max 5.0s
                                   cnt = mt5.positions_total()
                                   if cnt > 0:
                                       break
                                   time.sleep(0.2)
                                   waited_pos += 1
                               
                               # 🔄 FALLBACK: If still 0, try ONE MORE Login Refresh
                               if mt5.positions_total() == 0:
                                  # print(f"   [SYNC] Force Refreshing Login...")
                                  mt5.login(login=target_login, password=creds['password'], server=creds['server'])
                                  time.sleep(1.0) # Grace period
                               
                               # if waited_pos > 0:
                               #    print(f"   [SYNC] Waited {waited_pos*0.2:.1f}s for Post-Switch Position Sync.")

                          else:
                               print(f"   [CRITICAL] ❌ Login Failed: {mt5.last_error()}. Skipping Scan.")
                               import os
                               return False # Retry (Non-Fatal)

            
            # REMOVED: if not master_positions: continue 
            # REASON: If Master has 0 positions, we MUST proceed to Ghost Check to close our dangling trades!
            
            print(f"   [DEBUG-MASTER] Master Pos Keys: {list(master_positions.keys())}")

            # Get Local Positions (Retry Logic)
            local_positions = None
            for i in range(5):
                local_positions = mt5.positions_get()
                if local_positions is not None: break
                time.sleep(0.5)

            # 🛡️ SAFETY: If MT5 returns None (Error), abort Recon to prevent False Catch-up
            # RE-FETCH LOCAL POSITIONS to be sure (after wait)
            if local_positions is None: 
                print("[WARN] positions_get returned None. Retrying...")
                local_positions = mt5.positions_get()

            if local_positions is None: local_positions = []
            
            # 🔓 RELEASE LOCK (Before Catch-up Loop)
            if ctx_lock:
                 try: ctx_lock.release()
                 except: pass
            
            print(f"   [DEBUG-GHOST] Local Positions Scanned: {len(local_positions)}")
            if len(local_positions) > 0:
                 print(f"   [DEBUG-GHOST] Sample Position 0: Ticket={local_positions[0].ticket}, Magic={local_positions[0].magic}, Comment='{local_positions[0].comment}'")

            # Double Check Mode:
            copied_tickets = set()
            copied_tickets = set()
            local_map = {} # MOVED HERE: Scope Fix
            
            print(f"   [DEBUG-RECON] Master {sub_master_id}: {len(master_positions)} Pos in Redis. Local Terminal: {len(local_positions)} Pos.")
            
            # Iterate LOCAL positions.
            # If a position has Magic=234000 and "CPY:" in comment..
            # Check if it exists in 'master_positions'.
            for p in local_positions:
                # Filter for OUR copies only
                # 🛡️ RELAXED MAGIC CHECK: Trust "CPY:" tag even if Magic is 0 (Manual interference/Glitch)
                if "CPY:" in p.comment:
                    try:
                        # Robust Parsing: Handle "CPY:12345", "CPY: 12345", "CPY:12345 [sl]", "CPY:S12:12345"
                        # Extract Master Ticket from Comment "CPY:12345"
                        comment_clean = p.comment.replace("CPY:", "").strip()
                        
                        # Handle "S{id}:{ticket}" format
                        if comment_clean.startswith("S") and ":" in comment_clean:
                             # "S12:99999" -> split(:) -> [S12, 99999]
                             parts = comment_clean.split(':')
                             if len(parts) >= 2:
                                 m_tid = parts[-1].split(' ')[0] # Handle space after ticket
                             else:
                                 m_tid = comment_clean.split(' ')[0]
                        else:
                             m_tid = comment_clean.split(' ')[0]
                        
                        local_map[str(m_tid)] = p
                        copied_tickets.add(str(m_tid))
                    except: pass

            # ==================================================================================
            # 4. UNIFIED SYNC: OPEN (Catch-up) & MODIFY (SL/TP Drift)
            # ==================================================================================
            for m_ticket_str, m_info in master_positions.items():
                m_ticket = int(m_ticket_str)
                local_p = local_map.get(m_ticket_str)

                # DEBUG: Trace Decision
                # print(f"   [DEBUG-RECON] Checking Master {m_ticket}. In LocalMap? {m_ticket_str in local_map}")
                if m_ticket_str in local_map:
                    print(f"   [DEBUG-RECON] ✅ Matched Master {m_ticket} -> Local {local_map[m_ticket_str].ticket}")

                # ------------------------------------------------------------------
                # A. MISSING TRADE -> CATCH-UP (OPEN)
                # ------------------------------------------------------------------
                if not local_p:
                         # Filter: Only Catch-up if within meaningful timeframe/price? 
                         # For now, we trust the Master's Open list.
                         # 🛡️ STALE STATE GUARD: Check if this "Missing" trade was actually just closed.
                         # This prevents "Ghost Catch-up" if Redis State lags behind the Close Signal.
                         was_closed_recently = verify_master_history_closure(sub_master_id, m_ticket_str)
                         print(f"   [DEBUG-GUARD] Ticket {m_ticket} Closed in History? {was_closed_recently}")
                         if was_closed_recently:
                             print(f"   [SKIP] Ignored Catch-up for {m_ticket}. Verified Closed in History.")
                             continue
                        
                         # 🛡️ LATE ENTRY PROTECTION (Stale Trade Guard)
                         # For RECONCILIATION, we want to catch up even if the trade is old, 
                         # provided it is still open on the Master.
                         # We set a sanity limit of 24h (86400s) to prevent ancient zombies.
                         trade_age = m_info.get('age_seconds', 0)
                         if trade_age > 86400:
                             print(f"   [SKIP] Ignored Catch-up for {m_ticket}. Trade is too old ({trade_age:.1f}s). Limit: 24h")
                             continue

                         print(f"   [CATCH-UP] Found Missing Trade {m_ticket} (Age: {trade_age:.1f}s). Syncing...")

                         catchup_signal = {
                             "masterId": sub_master_id,
                             "ticket": str(m_ticket),
                             "symbol": m_info['symbol'],
                             "type": m_info['type'],
                             "action": "OPEN",
                             "volume": m_info['volume'],
                             "price": m_info['price'],
                             "sl": m_info.get('sl', 0.0),
                             "tp": m_info.get('tp', 0.0),
                             "id": f"CATCHUP-{m_ticket}-{int(time.time())}"
                         }

                         # Dispatch to Valid Followers
                         # We must find followers of this master that match the Current Terminal Login 
                         # (or simpler: we try to catch up for ALL followers of this master).
                         # Since we don't know which follower is currently active without checking,
                         # we build the list.
                         
                         targets = []
                         session_ctx = subs.get(sub_master_id)
                         if not session_ctx: continue
                         
                         if isinstance(session_ctx, list): targets = session_ctx
                         else: targets = [session_ctx]
                         
                         # 🛡️ DUPLICATE GUARD (Triggered Once Per Session)
                         if str(m_ticket) in PROCESSED_CATCHUP_TICKETS:
                             print(f"   [SKIP] Already processed Catch-Up for {m_ticket} (In Session Guard)")
                             continue
                         
                         # 🛡️ ZOMBIE GUARD: Double-Check History before Opening
                         # Even if it's in the Active List (e.g. stale Redis), if it's in History as closed, SKIP IT.
                         if verify_master_history_closure(sub_master_id, str(m_ticket)):
                             print(f"   [SKIP] Ignored Catch-up for {m_ticket}. Verified Closed in History (Stale Active List).")
                             PROCESSED_CATCHUP_TICKETS.add(str(m_ticket))
                             continue

                         batch_jobs = []
                         current_acct_info = mt5.account_info()
                         current_login_id = current_acct_info.login if current_acct_info else 0
                         
                         for t in targets:
                             # 🛡️ FRESH START POLICY: Ignore "Missed" trades that opened BEFORE subscription started.
                             # This prevents dumping 100 old trades on a user who just resubscribed.
                             try:
                                 sub_created_at = t.get('params', {}).get('created_at')
                                 trade_open_time = m_info.get('time', 0)
                                 
                                 if sub_created_at:
                                     # Convert to UTC timestamp if needed (Postgres returns datetime)
                                     if isinstance(sub_created_at, datetime):
                                         sub_ts = sub_created_at.timestamp()
                                     else:
                                         sub_ts = float(sub_created_at)
                                     
                                     # Allow 60s buffer for clock skew
                                     # 🛑 DISABLED "Fresh Start" per User Request (Resubscribe Support)
                                     # if trade_open_time < (sub_ts - 60):
                                     if False: 
                                         print(f"   [SKIP] Old Trade {m_ticket} (Open: {trade_open_time}) predates Sub (Start: {sub_ts}). Ignoring.")
                                         continue 
                             except Exception as e:
                                 # print(f"[WARN] Fresh Start Check Error: {e}")
                                 pass

                             creds = fetch_credentials(t.get('follower_id'))
                             if creds:
                                 # Optimization: If sharing terminal, prioritize current login
                                 # But in Batch mode we might switch.
                                 batch_jobs.append({
                                     "follower_id": t.get('follower_id'),
                                     "login": creds['login'],
                                     "password": creds['password'],
                                     "server": creds['server'],
                                     "terminal_path": MT5_PATH_ARG, 
                                     "is_premium": t.get('lane') == 'TURBO',
                                     "target_ticket": 0,
                                     "risk_factor": float(t.get('risk_factor', 100.0)),
                                     "invert_copy": t.get('invert_copy', False) # ✅ Pass Invert Flag
                                 })
                         
                         if batch_jobs:
                             # 🔒 Check Lock
                             locked = False
                             if MT5_PATH_ARG: locked = acquire_terminal_lock(ttl=60)
                             try:
                                 # print(f"   [CATCH-UP] Dispatching {m_ticket} to {len(batch_jobs)} followers...")
                                 results = process_batch(batch_jobs, catchup_signal)
                                 
                                 # ✅ MARK AS PROCESSED (Prevents infinite loop in TURBO mode)
                                 if results:
                                     PROCESSED_CATCHUP_TICKETS.add(str(m_ticket))
                                 else:
                                     print(f"   [RETRY] Catch-Up for {m_ticket} returned no results. Retrying next cycle...")
                                 
                                 # 🩹 IMMEDIATE MAP SAVE (Prevent Duplicates)
                                 if results:
                                     # Let's rebuild login_map locally
                                     l_map = {}
                                     for bj in batch_jobs:
                                         l_map[int(bj['login'])] = bj['follower_id']
                                     
                                     process_execution_report(results, catchup_signal, l_map)

                             finally:
                                 if locked: release_terminal_lock()

                # ------------------------------------------------------------------
                # B. EXISTING TRADE -> CHECK SL/TP DRIFT (MODIFY)
                # ------------------------------------------------------------------
                else:
                        # 1. Resolve Owner & Config FIRST
                        current_acct = mt5.account_info()
                        current_login_id = current_acct.login if current_acct else 0
                        
                        target_conf = None
                        session_ctx = subs.get(sub_master_id)
                        targets_list = session_ctx if isinstance(session_ctx, list) else [session_ctx]
                        
                        for t in targets_list:
                            # We assume simple matching by Login (ignoring potential cross-broker complexity for now)
                            # Ideally we map FollowerID -> Login mapping more robustly.
                            # But here we rely on the fact that we are logged into ONE account at a time.
                            try:
                                # We need to know if 't' (follower config) matches the current terminal login.
                                # Since we don't have creds handy without fetching, we might need a cache?
                                # Actually, process_batch filters credentials.
                                # Let's fetch creds for 't' to match login.
                                c_creds = fetch_credentials(t.get('follower_id'))
                                if c_creds and str(c_creds['login']) == str(current_login_id):
                                    target_conf = t
                                    break
                            except: pass

                        if not target_conf:
                             # Should rarely happen unless account switched mid-loop
                             continue

                        # 2. Calculate Expected SL/TP
                        master_sl = float(m_info.get('sl', 0.0))
                        master_tp = float(m_info.get('tp', 0.0))
                        m_entry = float(m_info.get('price', 0.0))
                        m_type = m_info.get('type') # 0=Buy, 1=Sell
                        
                        expected_sl = master_sl
                        expected_tp = master_tp
                        
                        invert = target_conf.get('invert_copy', False)
                        
                        if invert and m_entry > 0:
                            # 🔄 INVERSION MATH (Range Swapping)
                            # User Rule: Master SL -> Follower TP, Master TP -> Follower SL
                            
                            f_entry = float(local_p.price_open)
                            
                            # 1. Calc Absolute Ranges (Distance from Master Entry)
                            range_sl = abs(m_entry - master_sl) if master_sl > 0 else 0.0
                            range_tp = abs(m_entry - master_tp) if master_tp > 0 else 0.0
                            
                            # 2. Apply to Follower (Direction Aware)
                            if local_p.type == mt5.ORDER_TYPE_BUY:
                                # We are BUYING (Master Sold)
                                # Target: Price UP (+)
                                # SL (Risk) = Master Gain (TP Range) -> Below Entry (-)
                                # TP (Gain) = Master Risk (SL Range) -> Above Entry (+)
                                
                                expected_sl = round(f_entry - range_tp, 5) if range_tp > 0 else 0.0
                                expected_tp = round(f_entry + range_sl, 5) if range_sl > 0 else 0.0
                                
                            else: # SELL
                                # We are SELLING (Master Bought)
                                # Target: Price DOWN (-)
                                # SL (Risk) = Master Gain (TP Range) -> Above Entry (+)
                                # TP (Gain) = Master Risk (SL Range) -> Below Entry (-)
                                
                                expected_sl = round(f_entry + range_tp, 5) if range_tp > 0 else 0.0
                                expected_tp = round(f_entry - range_sl, 5) if range_sl > 0 else 0.0
                                
                        elif not invert:
                            # Standard Copy (Non-Inverted)
                            # SL/TP = Master SL/TP (Approx if cross-broker, but ideally exact levels)
                            # Or if Pro-Rata logic exists? For now assume Exact Levels.
                            pass # expected_sl/tp already set to master_sl/tp above

                        # 3. Drift Check (Common)
                        local_sl = float(local_p.sl)
                        local_tp = float(local_p.tp)
                        
                        diff_sl = abs(local_sl - expected_sl)
                        diff_tp = abs(local_tp - expected_tp)
                        
                        needs_update = False
                        
                        # Use slightly higher tolerance for Inverted due to floating point calc
                        tol = 0.0005 if invert else 0.0001
                        
                        if diff_sl > tol or diff_tp > tol:
                            needs_update = True

                        if needs_update:
                            print(f"   [SYNC] 🔄 SL/TP Drift {'(Invert)' if invert else ''} {m_ticket}. L({local_sl}/{local_tp}) vs Exp({expected_sl}/{expected_tp}). Updating...")
                            
                            mod_signal = {
                                "action": "MODIFY",
                                "ticket": str(local_p.ticket),
                                "symbol": local_p.symbol,
                                "sl": master_sl,
                                "tp": master_tp,
                                "master_entry": m_entry, # ✅ Pass Master Entry for Math
                                "id": f"SYNC-MOD-{local_p.ticket}-{int(time.time())}"
                            }
                            
                            target_job = {
                                "login": current_login_id,
                                "password": c_creds['password'],
                                "server": c_creds['server'],
                                "terminal_path": MT5_PATH_ARG,
                                "is_premium": target_conf.get('lane') == 'TURBO',
                                "target_ticket": local_p.ticket,
                                "invert_copy": invert # ✅ Pass Config
                            }
                            
                            # Use existing process_batch helper (requires list)
                            # Passing 'mod_signal' as global catchup signal argument is efficient.
                            process_batch([target_job], mod_signal)
                        else:
                             # print(f"   [SYNC] ✅ Tick {m_ticket} In Sync (Diff: {diff_sl:.5f} / {diff_tp:.5f})")
                             pass

            # except Exception as e:
            #    print(f"   [ERROR] Reconciliation Loop Failed for item {m_ticket_str}: {e}")
            #    traceback.print_exc()
            

                        # ==================================================================================
                        # 6. ORPHAN SCAN (Implicit Closure Check)
                        # ==================================================================================
                        # Scan LOCAL positions for this follower.
                        # If we find a CPY: tag for THIS Master, but Master doesn't have it open -> CLOSE IT.
                        if local_positions:
                             for p in local_positions:
                                 if "CPY:" in p.comment:
                                     try:
                                         # Extract Master ID from Comment
                                         m_ticket_str = p.comment.replace("CPY:", "").strip().split(' ')[0]
                                         if ':' in m_ticket_str: m_ticket_str = m_ticket_str.split(':')[-1]
                                         
                                         # Check if this trade belongs to the CURRENT Master we are processing in the outer loop
                                         # (sub_master_id is defined in the outer loop)
                                         # We verify ownership by checking if the comment tag matches known mapping/logic context,
                                         # but implicitly relying on CPY tag + Master ID filtering is safer.
                                         
                                         # If local trade maps to THIS master, but THIS master says "I don't have it"
                                         if m_ticket_str not in master_positions:
                                             # We must be careful not to close trades from OTHER masters if we are multi-master.
                                             # In this architecture, sub_master_id loop wraps this.
                                             # But we don't have the Master ID in the CPY tag explicitly?
                                             # Wait, comment is "CPY:{master_ticket}". It doesn't have Master ID.
                                             # However, if we only subscribe to one master, it's fine.
                                             # If multiple masters, we might cross-close?
                                             # Solution: verify_master_history_closure takes sub_master_id.
                                             
                                             print(f"   [GHOST] 👻 Candidate Found: Local {p.ticket} (Master {m_ticket_str})")
                                             
                                             should_close = False
                                             
                                             # A. Explicit History Check
                                             if verify_master_history_closure(sub_master_id, m_ticket_str, from_ts=p.time):
                                                 print(f"   [GHOST] ✅ Verified Closed in Master History! Closing Local {p.ticket}...")
                                                 should_close = True
                                             else:
                                                 # B. Implicit Freshness Check
                                                 master_ts = state.get('timestamp', 0)
                                                 state_age = time.time() - master_ts
                                                 if state_age < 30: 
                                                     print(f"   [GHOST] Implicit Closure Detected (State Age: {state_age:.1f}s). Closing {p.ticket}.")
                                                     should_close = True
                                                 else:
                                                     print(f"   [GHOST] ⚠️ State too old ({state_age:.1f}s). Skipping {p.ticket}.")
                                             
                                             if should_close:
                                                 print(f"   [GHOST] Dispatching FORCE CLOSE for {p.ticket}...")
                                                 close_signal = {
                                                     "action": "CLOSE",
                                                     "ticket": str(p.ticket),
                                                     "symbol": p.symbol,
                                                     "masterId": sub_master_id,
                                                     "masterTicket": m_ticket_str,
                                                     "id": f"ORPHAN-CLOSE-{p.ticket}-{int(time.time())}"
                                                 }
                                                 target_job = {
                                                     "login": current_login_id,
                                                     "password": c_creds['password'],
                                                     "server": c_creds['server'],
                                                     "terminal_path": MT5_PATH_ARG,
                                                     "is_premium": target_conf.get('lane') == 'TURBO' if target_conf else False,
                                                     "target_ticket": p.ticket,
                                                     "invert_copy": False 
                                                 }
                                                 process_batch([target_job], close_signal)

                                     except Exception as orphan_err:
                                         print(f"   [WARN] Orphan Check Failed for {p.ticket}: {orphan_err}")





                





                    

                    

                    




            # ==================================================================================
            # 👻 GHOST BUSTER: Close Local Trades missing from Master
            # ==================================================================================
            # Start fresh scan for ghosts (using already fetched 'local_positions')
            # Only if we successfully got local positions.
            if local_positions:
                for p in local_positions:
                    # 1. Filter our trades (Relaxed Magic Check)
                    # 🛡️ RELAXED MAGIC CHECK: Trust "CPY:" tag even if Magic is 0
                    if "CPY:" in p.comment:
                        try:
                            # 2. Extract Master ID
                            m_ticket_str = p.comment.replace("CPY:", "").strip().split(' ')[0]
                            
                            # 3. Check if missing from Master's "Open" list
                            if m_ticket_str not in master_positions:
                                print(f"   [GHOST] 👻 Candidate Found: Local {p.ticket} (Master {m_ticket_str})")
                                
                                should_close = False
                                
                                # A. Explicit History Check (Redis)
                                if verify_master_history_closure(sub_master_id, m_ticket_str, from_ts=p.time):
                                    should_close = True
                                else:
                                    # B. Implicit State Check (Freshness)
                                    master_ts = state.get('timestamp', 0)
                                    state_age = time.time() - master_ts
                                    
                                    if state_age < 30: # 30s Freshness Window
                                         should_close = True
                                         print(f"   [GHOST] Implicit Closure Detected (State Age: {state_age:.1f}s). Closing {p.ticket}.")
                                    else:
                                         print(f"   [GHOST] ⚠️ Master State Stale ({state_age:.1f}s). Keeping {p.ticket} open safely.")

                                if should_close:
                                    print(f"   [GHOST] ✅ Verified Closed in Master History! Closing Local {p.ticket}...")
                                    
                                    # 5. Construct CLOSE Signal
                                    close_signal = {
                                        "action": "CLOSE",
                                        "symbol": p.symbol,
                                        "ticket": m_ticket_str, # Use MASTER ticket for lookups if needed, or local? 
                                        # execute_trade expects Master Ticket usually to resolve via map, 
                                        # OR we can force it if we know the local ticket.
                                        # Let's verify 'execute_trade' logic. It usually maps master->slave.
                                        # But here we KNOW the slave ticket {p.ticket}.
                                        # Let's bypass execute_trade mapping complexity if possible or ensure it works.
                                        # Actually, execute_trade handles 'CLOSE' by looking up ticket map.
                                        # If we pass 'ticket': m_ticket_str, it will look up slave ticket.
                                        # Should work!
                                        "type": p.type, 
                                        "volume": p.volume,
                                        "price": p.price_current,
                                        "id": f"GHOST-CLOSE-{m_ticket_str}-{int(time.time())}"
                                    }
                                    
                                    # 6. Execute Close
                                    # Note: We reuse the exact same logic as normal signals
                                    
                                    # DISPATCH (Mode Aware)
                                    if EXECUTION_MODE in ['BATCH', 'TURBO']:
                                         # Using HFT Dispatcher
                                         # from hft_executor import process_batch  <-- Removed (Global Import)
                                         
                                         # Target matches 'sub_master_id' context
                                         targets = []
                                         if sub_master_id in subs:
                                             c = subs[sub_master_id]
                                             targets = c if isinstance(c, list) else [c]
                                         
                                         # Get current login ONCE
                                         current_login_id = mt5.account_info().login
                                         
                                         slave_list_close = []
                                         for t in targets:
                                              creds = fetch_credentials(t['follower_id'])
                                              # STRICT MATCH: Only close for the account that owns this position 'p'
                                              if creds and str(creds['login']) == str(current_login_id):
                                                  slave_list_close.append({
                                                      "login": creds['login'],
                                                      "password": creds['password'],
                                                      "server": creds['server'],
                                                      "terminal_path": MT5_PATH_ARG, 
                                                      "is_premium": t.get('lane') == 'TURBO',
                                                      "target_ticket": p.ticket # FORCE TARGET TICKET (We know it!)
                                                  })
                                         
                                         if slave_list_close:
                                             print(f"   [GHOST] Dispatching FORCE CLOSE for {p.ticket}...")
                                             g_results = process_batch(slave_list_close, close_signal)
                                             if g_results:
                                                for r in g_results:
                                                    icon = "✅" if r.get('status') == 'success' else "❌"
                                                    print(f"       -> Slave {r.get('accountId')}: {icon} {r.get('message')} (Deal: {r.get('dealId')})")
                                             
                                    else:
                                         # Single Mode
                                         execute_trade(close_signal, api_url, follower_id=MY_FOLLOWER_ID)

                                else:
                                    print(f"   [GHOST] ⚠️ Could not verify closure in history. Keeping open safely.")

                        except Exception as e:
                            print(f"   [GHOST] Error processing position {p.ticket}: {e}")
                            traceback.print_exc()

        except Exception as e:
            print(f"   [ERROR] Reconstruction Loop Failed for {sub_master_id}: {e}")
            traceback.print_exc()
            continue

                        # Legacy code removed (Cleanup)




    return reconnected

# -------------------------------------------------------------------------
# 🔧 TICKET MAPPING HELPERS (Redis)
# -------------------------------------------------------------------------
def save_ticket_map(master_ticket, follower_ticket, follower_id):
    """Maps Master Ticket -> Follower Ticket for a specific User"""
    if not master_ticket or not follower_ticket: return
    key = f"map:ticket:{master_ticket}:{follower_id}"
    # Expire in 30 days (keep DB clean but allow long-term holds)
    if r_client:
        r_client.set(key, str(follower_ticket), ex=2592000)

def get_follower_ticket(master_ticket, follower_id):
    """Resolves Master Ticket -> Follower Ticket"""
    key = f"map:ticket:{master_ticket}:{follower_id}"
    if r_client:
        return r_client.get(key)
    return None

# -------------------------------------------------------------------------
# 🔄 SUBSCRIPTION MANAGER (Background Thread)
# -------------------------------------------------------------------------
class SubscriptionManager:
    """
    Offloads valid subscription fetching + credential resolution to a background thread.
    Unblocks the Main Loop for Redis Signals (Realtime).
    """
    def __init__(self, interval=3.0, follower_id=None):
        self.interval = interval
        self.follower_id = follower_id
        self.running = False
        self.active_subscriptions = {} # Shared State {mid: [followers]}
        self.lock = threading.Lock()
        self.thread = None
        self.first_load = threading.Event() # Wait for first load

    def start(self):
        if self.running: return
        self.running = True
        self.thread = threading.Thread(target=self.loop, daemon=True)
        self.thread.start()
        
    def get_subs(self):
        """Thread-safe getter"""
        with self.lock:
            return self.active_subscriptions

    def loop(self):
        print(f"[BG] Subscription Manager Started (Poll: {self.interval}s)")
        while self.running:
            try:
                # 1. Fetch from DB
                new_subs = fetch_subscriptions(self.follower_id)
                
                if new_subs is not None:
                     # 🛡️ DOUBLE-CHECK GUARD: If subs drop to ZERO from non-zero, verify to prevent flapping.
                     if not new_subs and self.active_subscriptions:
                         print("[BG] ⚠️ Subscriptions dropped to 0. Verifying (Double-Check)...")
                         time.sleep(1.0)
                         retry_subs = fetch_subscriptions(self.follower_id)
                         if retry_subs is not None:
                             new_subs = retry_subs
                             if new_subs:
                                 print(f"[BG] 🩹 Double-Check Saved Us! Flapping prevented. Found {len(new_subs)} subs.")
                             else:
                                 print(f"[BG] ✅ Double-Check Confirmed: Really 0 subs.")
                         else:
                             # If retry failed (None), keep original logic (Preserve) which happens below if we set new_subs=None
                             # But here we just proceed with empty if retry returned empty.
                             pass

                     # 4. Update Shared State
                     with self.lock:
                         # Log diff?
                         old_keys = set(self.active_subscriptions.keys())
                         self.active_subscriptions = new_subs
                         new_keys = set(self.active_subscriptions.keys())
                         
                         added = new_keys - old_keys
                         removed = old_keys - new_keys
                         if added or removed:
                             print(f"[BG] 🔄 Active Subs Updated. +{len(added)} / -{len(removed)}")
                else: 
                     print(f"[WARN] Fetch failed. Preserving {len(self.active_subscriptions)} active subscriptions.")

                self.first_load.set() # Unblock startup
                time.sleep(self.interval)
                
            except Exception as e:
                print(f"[WARN] Subscription Manager Error: {e}")
                time.sleep(5.0) # Backoff

    def sync_sentinel(self, subs):
        """Resolves config and pushes to HFT Engine"""
        try:
             # Only relevant for HFT modes
             # from hft_executor import update_sentinel_list
             # sentinel_targets = []
             
             # Flatten
             # for m_id, followers in subs.items():
             #     for f in followers:
             #         # SLOW OPS: RESOLVE CREDS
             pass
        except Exception as e:
            print(f"[BG] Sentinel Sync Failed: {e}")
             #          creds = fetch_credentials(f['follower_id'])
             #          if creds:
             #              cfg = {
             #                  "login": creds['login'],
             #                  "password": creds['password'],
             #                  "server": creds['server'],
             #                  "is_premium": (f.get('lane') == 'TURBO'),
             #                  # Safety Params (Critical)
             #                  "allocation": f.get('allocation', 0),
             #                  "config": f.get('config'), 
             #                  "min_equity": float(creds.get('minEquity', 0) or 0),
             #                  "max_daily_loss": float(creds.get('maxDailyLoss', 0) or 0)
             #              }
             #              sentinel_targets.append(cfg)
             #  
             #  if sentinel_targets:
             #      update_sentinel_list(sentinel_targets)
                 
        except Exception as e:
             # Don't crash background thread
             print(f"[BG] Sentinel Sync Failed: {e}")

# -------------------------------------------------------------------------
# 🚀 EXECUTION & REPORTING
# -------------------------------------------------------------------------
def process_execution_report(report, signal, login_map):
    """
    Handles the result from the HFT Swarm.
    1. Reports to API (DB).
    2. Saves Ticket Mapping (Redis).
    """
    if not report: return

    # DEBUG: Trace Execution Report
    print(f"   [DEBUG_REPORT] Processing {len(report)} items. LoginMap Keys: {list(login_map.keys())}")

    # We reuse the EXECUTION_WEBHOOK_URL to save to DB
    # Ensure this URL handles 'POST' to update/create TradeHistory
    api_url = os.getenv("AUTH_URL", "http://localhost:3000")
    EXECUTION_WEBHOOK_URL = f"{api_url}/api/webhook/execution"
    
    for res in report:
        # ✅ Look up using INT key
        acc_id = int(res.get('accountId'))
        f_id = login_map.get(acc_id)
        
        if not f_id:
            print(f"[WARN] Could not map Account {res.get('accountId')} back to FollowerID. Skipping Report.")
            continue
            
        success = (res['status'] == 'success')
        local_ticket = res.get('dealId', 0)

        # 🛑 HANDLE RISK STOP FEEDBACK
        if not success and res.get('message') == "RISK_LIMIT":
             print(f"🚨 [RISK] Worker reported Risk Limit Breach for {f_id}. Disabling Sessions.")
             disable_all_sessions(f_id, "Worker Reported Risk Stop")
             continue
        
        # 1. SAVE TICKET MAPPING (Critical for Close/Modify)
        if success and signal.get('action') == 'OPEN' and local_ticket:
            save_ticket_map(signal.get('ticket'), local_ticket, f_id)
            
        # 2. PREPARE PAYLOAD
        payload = {
            "ticket": str(local_ticket), # Follower Ticket (or Deal ID)
            "followerId": f_id,
            "masterId": signal.get('masterId'),
            "masterTicket": signal.get('ticket'), # ✅ CRITICAL: Link to Master Trade
            "symbol": signal.get('symbol'),
            "type": signal.get('type', 'UNKNOWN'),
            "action": signal.get('action', 'OPEN'), # Pass Action (OPEN/CLOSE)
            "volume": res.get('volume', signal.get('volume')),
            "price": res.get('price', 0.0), # Execution Price
            "profit": res.get('profit', 0.0), # Realized PnL (for Close)
            "status": "FILLED" if success else "FAILED",
            "message": res.get('message'),
            # 📊 RICH DATA (from HFT)
            "openPrice": res.get('openPrice', 0.0),
            "openTime": res.get('openTime', 0),
            "closePrice": res.get('closePrice', res.get('price', 0.0)),
            "closeTime": res.get('closeTime', int(time.time())),
            "commission": res.get('commission', 0.0),
            "swap": res.get('swap', 0.0)
        }
        
        # Alias profit to pnl just in case API expects that
        payload["pnl"] = payload["profit"]
        
        try:
             # We use a header secret if needed
             resp = requests.post(EXECUTION_WEBHOOK_URL, json=payload, headers={"x-bridge-secret": "AlphaBravoCharlieDeltaEchoFoxtro"}, timeout=2)
             
             if resp.status_code != 200 and resp.status_code != 201:
                 print(f"   [WARN] DB Report Failed ({resp.status_code}): {resp.text} | Payload: {payload}")
             else:
                 print(f"   [✔] Reported {f_id} -> DB ({resp.status_code})")
                 
        except Exception as e:
             print(f"[ERROR] Failed to report execution for {f_id}: {e}")
             
    print(f"   [HFT] Batch Complete: {len(report)} processed.")
                                
def run_executor():
    global MY_FOLLOWER_ID
    
    # 🧠 AUTO-RESOLVE USER ID
    if RESOLVE_USER_ID:
        # 🛑 TURBO OVERRIDE: Do NOT auto-detect from Login.
        if EXECUTION_MODE == 'TURBO':
             print("[INFO] TURBO Mode: Identity agnostic (Manager).")
             MY_FOLLOWER_ID = None
        else:
            info = mt5.account_info()
            if info:
                MY_FOLLOWER_ID = str(info.login)
                print(f"[INFO] Auto-Detected User ID: {MY_FOLLOWER_ID}")
           
                # 🔄 DYNAMIC IDENTITY HOPPING (Legacy / Fallback)
                if EXECUTION_MODE == 'TURBO':
                   try:
                       subs = fetch_subscriptions(MY_FOLLOWER_ID)
                       targets = []
                       for k, v in subs.items():
                            if isinstance(v, list): targets.extend(v)
                            else: targets.append(v)
                       
                       valid_followers = [t.get('follower_id') for t in targets if str(t.get('follower_id')) != str(MY_FOLLOWER_ID)]
                       if valid_followers:
                           target_follower = valid_followers[0]
                           print(f"[AUTO] 🚀 Manager Mode Detected. Initial ID {MY_FOLLOWER_ID} -> Switching to Follower {target_follower}")
                           MY_FOLLOWER_ID = str(target_follower)
                   except Exception as e:
                       print(f"[WARN] Auto-Switch Check failed: {e}")

            else:
                 print("[FATAL] Could not detect User ID (Auto Mode). MT5 Login failed?")
                 sys.exit(1)

    # 🛑 LOCK CHECK (Singleton per User ID, not per Login)
    # This keeps it stable even if we are temporarily logged into someone else's account.
    if not acquire_lock(MY_FOLLOWER_ID):
        print(f"[LOCK] Could not acquire lock for {MY_FOLLOWER_ID}. Another instance active?")
        # Do not shutdown MT5, as others might be using it!
        return

    print(f"[START] Executor Started for {MY_FOLLOWER_ID}...")
    print(f"[INFO] Hydra Execution Engine v1.2")
    
    # ⚠️ SHARED TERMINAL MODE:
    # We do NOT force login on startup. We assume "Lazy Switching".
    # Just verify we can reach the terminal path.
    current_mt5_login = mt5.account_info().login if mt5.account_info() else "Unknown"
    
    # [FIX] Enforce Login if ID provided (prevents starting on Master)
    if MY_FOLLOWER_ID:
         print(f"[INIT] Verifying Account for User {MY_FOLLOWER_ID}...")
         # Try to resolve credentials (assuming we have them in DB or similar, 
         # but for now we just check if we are ALREADY on the right account)
         # If not, we try to fetch credentials and login.
         # [FIX] Handle UUID vs Int ID
         try:
             target_login = int(MY_FOLLOWER_ID)
         except:
             # It's a UUID? We must resolve it first.
             print(f"[INIT] ID {MY_FOLLOWER_ID} is non-numeric (UUID). Resolving Login via API...")
             creds = fetch_credentials(MY_FOLLOWER_ID)
             if creds and creds != "FATAL_404":
                  target_login = int(creds['login'])
             else:
                  print(f"[FATAL] Could not resolve Login for UUID {MY_FOLLOWER_ID}. aborting.")
                  sys.exit(1)

         # 🧠 DYNAMIC IDENTITY (Turbo Mode)
         # In Turbo Mode, we act as a Manager. We do NOT enforce that the terminal is on Manager ID.
         if EXECUTION_MODE == 'TURBO' and current_mt5_login != target_login:
              print(f"[INFO] Turbo Manager Active: Terminal is on {current_mt5_login} (Manager: {target_login}). Skipping Switch.")
              # We assume the HFT Swarm is managing the terminal.
              pass 
              
         elif current_mt5_login != target_login:
             print(f"[WARN] Startup Account Mismatch! Expected: {target_login}, Found: {current_mt5_login}")
             print(f"   -> Attempting to fetch credentials and switch...")
             creds = fetch_credentials(MY_FOLLOWER_ID)
             
             if creds == "FATAL_404":
                 print(f"[FATAL] 🛑 Account {MY_FOLLOWER_ID} Not Found. Aborting Executor.")
                 # CLEANUP BEFORE EXIT
                 try:
                     release_lock(MY_FOLLOWER_ID)
                     mt5.shutdown()
                 except: pass
                 sys.exit(1)

             success = False
             if creds:
                 # 1. Try with API Credentials
                 if login_mt5(creds):
                     success = True
                 else:
                     print(f"[WARN] Login with API credentials failed.")
             
             if not success:
                 # 2. Fallback: Try Login using STORED credentials (no password provided)
                 print(f"   -> API Creds missing/failed. Trying Stored MT5 Password for {target_login}...")
                 if mt5.login(target_login):
                     success = True
                     print(f"[SUCCESS] Switched to Follower via Stored Credentials.")
                 else:
                      last_err = mt5.last_error()
                      print(f"[CRITICAL] Auto-Switch Failed. MT5 Error: {last_err}")
                 
                 if success:
                     current_mt5_login = target_login
                     print(f"[SUCCESS] Active Account: {target_login}")
                 else:
                     print(f"[URGENT] PLEASE MANUALLY SWITCH TERMINAL TO ACCOUNT {target_login}!")
                     print(f"[STOP] 🛑 ABORTING EXECUTOR TO PREVENT CROSS-TRADING RISK.")
                     try:
                         release_lock(MY_FOLLOWER_ID)
                         mt5.shutdown()
                     except: pass
                     sys.exit(1)
                     


    print(f"[INFO] Terminal Connected. Current Login: {current_mt5_login}")
    print(f"[INFO] Mode: LIVE TRADING") 
    print(f"[INFO] Transport: REDIS PUB/SUB ⚡ (Non-Blocking)")

    # 3. Find API Server
    # Assumes find_server() is defined (it was used in original code)
    # If not defined, we fallback to logic
    try:
        api_url = find_server() 
        if not api_url:
            print("[WARN] API Server not found. Trading continues via Redis Only.")
    except NameError:
         # Fallback if find_server missing
         print("[WARN] find_server() not defined using default.")
         api_url = get_api_url(HOSTS[0])

    # 4. Connect to Redis (Already done globally but verify)
    if not r_client: 
         print("[ERROR] Redis Essential for Signals! Exiting.")
         release_lock(MY_FOLLOWER_ID) # Changed MY_LOGIN_ID to MY_FOLLOWER_ID
         return
    
    pubsub = r_client.pubsub()
    # PREVENT LEAKAGE: Removed 'channel:all_followers' global sub.
    # We only listen to our specific master(s).
    if EXECUTION_MODE == 'SINGLE':
        pubsub.subscribe(f'channel:follower:{MY_FOLLOWER_ID}') # 🎯 Target for Emergency/Sync
    
    # 🔗 DYNAMIC SUBSCRIPTION
    manager_id_for_yield = None
    last_recon_time = 0
    last_sync_time = 0
    last_subs_refresh_time = 0
    
    RECON_INTERVAL = 15.0 # Check for ghosts/misses every 15 seconds (Balanced)
    SYNC_INTERVAL = 3.0
    RESET_CHECK_INTERVAL = 60.0 # ⚡ Check renew/expiry every minute
    last_reset_check_time = 0
    SUBS_REFRESH_INTERVAL = 3.0 # 🔄 Check for Unsubscribe/Pause every 3s (Was 10s)
    SYNC_INTERVAL = 3.0
    SUBS_REFRESH_INTERVAL = 3.0 # 🔄 Check for Unsubscribe/Pause every 3s (Was 10s)

    # Keep track of what we are listening to
    subscribed_channels = set()
    RESET_CHECK_INTERVAL = 60.0 # ⚡ Check renew/expiry every minute
    last_reset_check_time = 0
    SUBS_REFRESH_INTERVAL = 3.0 # 🔄 Check for Unsubscribe/Pause every 3s (Was 10s)
    SYNC_INTERVAL = 3.0
    SUBS_REFRESH_INTERVAL = 3.0 # 🔄 Check for Unsubscribe/Pause every 3s (Was 10s)

    # Keep track of what we are listening to
    # 🧹 PRE-FLIGHT CHECK: Enforce VIP/Paid Expiry BEFORE Subscribing
    # This ensures we don't accidentally subscribe to "Forbidden" channels on startup.
    if EXECUTION_MODE == 'SINGLE':
        check_daily_resets(MY_FOLLOWER_ID)
    
    # 🔄 START BACKGROUND MANAGER ⚡
    active_subscriptions = {} 
    subs_mgr = SubscriptionManager(interval=3.0, follower_id=MY_FOLLOWER_ID)
    subs_mgr.start()
    
    # Wait for first load (up to 5s)
    print("[INIT] Waiting for Subscriptions...")
    subs_mgr.first_load.wait(timeout=5.0)
    active_subscriptions = subs_mgr.get_subs() # Initial Get
    
    if active_subscriptions:
        for mid in active_subscriptions.keys():
            channel = f"signals:master:{mid}"
            pubsub.subscribe(channel)
            print(f"   -> Subscribed to {channel}")
    else:
        print("[ℹ️] No active subscriptions found (yet).")
    
    print(f"[OK] Subscribed to Channels: follower:{MY_FOLLOWER_ID}")

    # ⚡ CATCH-UP PHASE
    # Now that we are online and subscribed, check what we missed.
    # ⚡ CATCH-UP PHASE
    # Now that we are online and subscribed, check what we missed.
    with open("executor_startup.log", "a") as f:
        f.write(f"Startup Complete. ID: {MY_FOLLOWER_ID}, Subs: {len(active_subscriptions)}\n")
        f.write(f"Active Subs Keys: {list(active_subscriptions.keys())}\n")
    
    try:
        reconcile_initial_state(api_url, active_subscriptions)
    except Exception as e:
        print(f"[WARN] Initial Reconcile Failed: {e}")
        with open("executor_startup.log", "a") as f:
             f.write(f"Reconcile Muted Crash: {e}\n")

    print("[READY] Waiting for High-Speed Signals... 🚄")

    loop_counter = 0
    try:
        while True:
            loop_counter += 1
             # with open("executor_debug.log", "a") as f:
             #    f.write(f"Loop Pulse. ManagerID: {manager_id_for_yield}\n")
            # 🛡️ TICK-TOCK: Work Phase (Switch to Follower)
            # 🛡️ TICK-TOCK: Work Phase (Switch to Follower)
            # CACHE RESOLUTION: Resolve UUID -> Credentials object
            if 'cached_follower_creds' not in locals() or not cached_follower_creds:
                 try:
                     # Always fetch full creds (works for Int and UUID)
                     # Always fetch full creds (works for Int and UUID)
                     if MY_FOLLOWER_ID:
                         cached_follower_creds = fetch_credentials(MY_FOLLOWER_ID)
                     else:
                         cached_follower_creds = None
                 except: 
                     pass
            
            target_f_login = int(cached_follower_creds.get('login', 0)) if cached_follower_creds else 0
            
            if manager_id_for_yield and str(manager_id_for_yield) != str(MY_FOLLOWER_ID) and target_f_login > 0:
                 current_info = mt5.account_info()
                 current_log = current_info.login if current_info else 0
                 
                 if str(current_log) != str(target_f_login):
                      # We are likely on Manager from previous yield
                      # USE FULL CREDENTIALS
                      res = mt5.login(
                          login=target_f_login, 
                          password=cached_follower_creds.get('password', ""), 
                          server=cached_follower_creds.get('server', "")
                      )
                      if not res:
                            print(f"[FATAL] Failed to switch to Follower {target_f_login} (ID: {MY_FOLLOWER_ID}). Error: {mt5.last_error()}. Retrying...")
                            time.sleep(1)
                            continue
                      time.sleep(0.5)

            # 🛡️ ADAPTIVE LOCKING STATE (Burst Mode)
            # We track this LOCALLY to know if we should release the lock or hold it.
            if 'terminal_lock_held' not in locals(): terminal_lock_held = False
            if 'last_activity_time_burst' not in locals(): last_activity_time_burst = 0
            
            # ⚡ ADAPTIVE LOCKING (Burst Mode)
            # We now use a tighter window (4.0s) because the "Stabilization Loop" guarantees safely.
            # ⚡ OPTIMIZED BURST WINDOW
            # Broadcaster yields for 0.5s. Executor should release FAST if queue empty.
            # If we hold for 4s, Broadcaster is blocked from scanning for 4s.
            BURST_WINDOW = 0.1 # Release almost immediately if idle
            
            # Legacy fallback
            # BURST_WINDOW = 5.0

            # 🤝 COOPERATIVE LOCKING: Yield to Verify Script
            # Must check BEFORE any MT5 calls to prevent blocking verify.py
            if r_client:
                lock_owner = r_client.get(LOCK_KEY_GLOBAL)
                # If Verify holds it, WE MUST YIELD.
                # If WE hold it (LOCKED_EXECUTOR), we proceed.
                if lock_owner == "LOCKED_VERIFY":
                    print(f"[WAIT] Yielding to Verify Script... (Pausing Loop)")
                    mt5.shutdown() 
                    # We sleep longer to give Verify time to finish its job (Login = ~1-2s)
                    time.sleep(1.0) 
                    continue
            
            current_time = time.time()
            
            # ❤️ HEARTBEAT: Refresh Lock
            refresh_lock(MY_FOLLOWER_ID)
            
            # 🛡️ ADAPTIVE LOCKING STATE
            # Track lock locally to support Burst Mode
            if 'terminal_lock_held' not in locals(): terminal_lock_held = False
            if 'last_activity_time_burst' not in locals(): last_activity_time_burst = 0
            BURST_WINDOW = 0.1
            
            # 🔄 FAST READ (Thread Safe)
            current_active_subs = subs_mgr.get_subs()
            # If structure changed (keys), update PubSub?
            # The Manager handles Sentinel Sync, but WE handle PubSub.
            # Compare Keys Only (Fast)
            if set(current_active_subs.keys()) != set(active_subscriptions.keys()):
                old_keys = set(active_subscriptions.keys())
                new_keys = set(current_active_subs.keys())
                active_subscriptions = current_active_subs # Update Local Ptr
                
                # Update Redis Channels
                # 🛑 STABILIZATION FIX: Never Unsubscribe.
                # Dynamic Unsubscribe/Subscribe causes race conditions in Redis-py.
                # We KEEP the subscription alive but filter signals in logic.
                
                # We need to track what we have physically subscribed to
                # if 'subscribed_channels' not in locals(): subscribed_channels = set(old_keys) <-- REMOVED

                physical_added = new_keys - subscribed_channels # meaningful connection change
                logical_added = new_keys - old_keys # meaningful user intent change (Recopy)
                
                for m in physical_added: 
                    pubsub.subscribe(f"signals:master:{m}")
                    subscribed_channels.add(m)
                
                # for m in removed: pubsub.unsubscribe(f"signals:master:{m}") # <--- DISABLED
                
                if physical_added:
                     print(f"[LOOP] ⚡ New Physical Connection: +{len(physical_added)}")

                if logical_added: 
                    print(f"[LOOP] ⚡ User Activated Subscription: +{len(logical_added)}")
                    
                    # 🚀 FORCE IMMEDIATE RESCAN (User Request)
                    # If a new master is added, don't wait for the 2s timer. Sync NOW.
                    print(f"[INFO] New Subscription Detected! Forcing Immediate Catch-up...")
                    
                    # 🧹 SESSION FLUSH: Clear 'Processed' cache to force deep check against Local Map
                    # This fixes the "Missed Orders" bug during Unsub -> Resub.
                    # We rely on 'local_map' (Ground Truth) to prevent duplicates, not this cache.
                    try:
                        PROCESSED_CATCHUP_TICKETS.clear()
                        print("[INFO] Session Cache Flushed. Re-evaluating all trades...")
                    except: pass
                        
                    # 🔐 GLOBAL MUTEX SCAN (Added for Stability) - REMOVED TO PREVENT DEADLOCK
                    # The Worker Thread needs this lock. If we hold it here and wait for the worker (process_batch),
                    # we create a Deadlock.
                    try:
                        print("[INFO] Starting Immediate Re-Scan (Deadlock Free)...")
                        reconcile_initial_state(api_url, active_subscriptions)
                    except Exception as e:
                        print(f"[ERROR] Immediate Catch-up Failed: {e}")
                    
                    # Fallback logic was here but reconcile_initial_state handles its own locking or delegated locking.
                    # We just assume success or exception.
                    last_recon_time = current_time # Reset timer
                                 
                    # Reset timer regardless of outcome to prevent tight loop spam on error
                    last_recon_time = current_time
            else:
                 active_subscriptions = current_active_subs # Just refresh content ptr
            
            # 1. ⚔️ BATCH CONSUMPTION (Drain Queue)
            # Instead of one-by-one, we grab everything available (up to 50) to minimize switching.
            # 1. ⚔️ BATCH CONSUMPTION (Drain Queue)
            local_signal_buffer = []
            if pubsub:
                for _ in range(50):
                    m = pubsub.get_message(ignore_subscribe_messages=True)
                    if getattr(m, 'get', None) and m.get('type') == 'message':
                        local_signal_buffer.append(m)
                    elif m is None:
                        break

            # 2. PROCESS BATCH
            for message in local_signal_buffer:
                try:
                    payload = message['data']
                    if not payload: continue
                    signal = json.loads(payload)
                except:
                    print(f"[ERROR] Bad JSON in Signal")
                    continue
                
                # Deduplication / Staleness
                sig_time = float(signal.get('timestamp') or 0)
                age = time.time() - sig_time
                if age > 60: 
                     print(f"[WARN] 🗑️ Dropped Stale Signal {signal.get('ticket')} (Age: {age:.1f}s)")
                     continue

                master_id = str(signal.get('masterId') or signal.get('ticket'))
                targets = []
                
                if master_id in active_subscriptions:
                     if EXECUTION_MODE in ['BATCH', 'TURBO']:
                          targets = active_subscriptions[master_id]
                     else:
                          # Single Mode 1:1
                          targets = [{ 'follower_id': MY_FOLLOWER_ID, 'config': active_subscriptions[master_id]['config'] }]
                
                if not targets:
                     continue

                # 🚀 EXECUTION LOGIC
                if EXECUTION_MODE in ['BATCH', 'TURBO']:
                     # HFT / BATCH LOGIC
                     from hft_executor import process_batch
                     slave_list = []
                     login_map = {}
                     
                     for target in targets:
                          # Expiry Check
                          if target.get('expiry') and target['expiry'] < datetime.utcnow(): continue
                          
                          creds = fetch_credentials(target['follower_id'])
                          if creds and isinstance(creds, dict) and 'login' in creds:
                               slave_config = {
                                    "login": creds['login'],
                                    "password": creds['password'],
                                    "server": creds['server'],
                                    "terminal_path": MT5_PATH_ARG,
                                    "follower_id": target['follower_id'],
                                    "invert_copy": target.get('invert_copy', False)
                               }
                               slave_list.append(slave_config)
                               login_map[int(creds['login'])] = target['follower_id']
                     
                     if slave_list:
                          # 🔒 BURST LOCKING
                          should_run = False
                          if terminal_lock_held: should_run = True
                          # 🛑 LOCK FIX: Wait 5.0s for Broadcaster to yield (Cycle is 4s).
                          # Previously 0.1s caused "Burst Lock Busy" and DROPPED the signal.
                          elif acquire_terminal_lock(timeout=5.0): 
                               terminal_lock_held = True
                               should_run = True
                          
                          if should_run:
                               try:
                                   results = process_batch(slave_list, signal)
                                   last_activity_time_burst = time.time()
                                   
                                   # Report to DB
                                   process_execution_report(results, signal, login_map)
                                   
                                   # Print for Console
                                   for res in results:
                                        print(f"       -> Slave {res.get('accountId')}: {res.get('status')} {res.get('message')}")
                               except Exception as e:
                                   print(f"[ERROR] Batch Exec Failed: {e}")
                          else:
                               print("[HFT] ⏳ Burst Lock Busy. Retrying in next cycle...")

                else:
                     # SINGLE MODE (LEGACY)
                     # Execute directly using global lock logic
                     if acquire_terminal_lock():
                          try:
                              execute_trade(signal, api_url or "http://localhost:3000", follower_id=MY_FOLLOWER_ID)
                              last_activity_time_burst = time.time()
                          finally:
                              release_terminal_lock()
            
            # 2. Safety & Reconciliation (Timestamp based)
            # ⚠️ SINGLE MODE ONLY: The Manager Process (TURBO) does not manage a local terminal state.
            # 2. Safety & Reconciliation (Timestamp based)
            # ⚠️ HYBRID MODE: If TURBO/BATCH but we have a Local Path, we perform reconciliation using the Global Lock.
            # 2. 🛡️ RECONCILIATION / GHOST BUSTING
            # Every 15s, check for missed trades or ghosts
            if current_time - last_recon_time > RECON_INTERVAL:
                 # print("[RECON] 🧐 Checking for missed trades...")
                 executed = False
                 
                 # Only perform if we have the lock (or can get it)
                 # We shouldn't interrupt a burst.
                 if not terminal_lock_held:
                      # 🛑 TIMEOUT FIX: Broadcaster yields every 4s. We must wait at least 4.5s to catch it.
                      if acquire_terminal_lock(timeout=5.0): 
                          try:
                              reconcile_initial_state(api_url, active_subscriptions)
                              executed = True
                          finally:
                              release_terminal_lock()
                      else:
                          print("[WARN] Skip Recon - Could not acquire lock (Broadcaster Busy).")
                 else:
                      # If we hold logic from Burst, we can run recon safely.
                      reconcile_initial_state(api_url, active_subscriptions)
                      executed = True
                 
                 if executed:
                     last_recon_time = current_time # Reset timer
                 else:
                     pass
                     
            last_recon_time = current_time # Update timer even if skipped to avoid spamming lock checks
            
            # 3. Sync Balance (Timestamp based)
            # 🛡️ Guard: Only sync if we have a valid Follower ID (Single Mode or Hybrid with ID)
            # Manager in TURBO mode (ID=None) should NOT sync balance (Workers do it).
            should_sync = (MY_FOLLOWER_ID is not None) and (EXECUTION_MODE == 'SINGLE' or is_hybrid) and (current_time - last_sync_time > SYNC_INTERVAL)
            if should_sync:
                 if api_url:
                     # Use Lock for Balance Sync too
                     lock_ctx = None
                     try:
                        from hft_executor import MT5_GLOBAL_LOCK
                        lock_ctx = MT5_GLOBAL_LOCK
                     except: pass

                     if lock_ctx:
                         if lock_ctx.acquire(blocking=False):
                             try:
                                 sync_balance(api_url)
                             finally:
                                 lock_ctx.release()
                     else:
                         sync_balance(api_url)
                     
                     last_sync_time = current_time
                     
            # 5. Check Daily Resets 🔄
            if current_time - last_reset_check_time > RESET_CHECK_INTERVAL:
                 check_daily_resets(MY_FOLLOWER_ID)
                 last_reset_check_time = current_time

            # 🛡️ BURST MODE LOCK RELEASE
            # If we are holding lock, check if we should release it
            if terminal_lock_held:
                 # ⚡ QUEUE FLUSH GUARD: Do NOT release lock if we have buffered signals!
                 has_work = len(local_signal_buffer) > 0
                 
                 should_release = False
                 if not has_work:
                      if time.time() - last_activity_time_burst > BURST_WINDOW:
                           should_release = True
                 
                 if should_release:
                      if MT5_PATH_ARG: 
                           release_terminal_lock()
                      terminal_lock_held = False
                 else:
                      # We are in Burst Mode OR Flushing Queue. Hold Lock. Skip Yield.
                      # Processing buffer should be fast.
                      time.sleep(0.001) 
                      # We must CONTINUE the loop to check for next buffer item or grab more
                      continue 

            # 🛡️ TICK-TOCK: Yield Phase (Switch to Manager) - LEGACY REMOVED
            # The Broadcaster now yields voluntarily. The Executor should NOT yield or switch logins.
            # We must stay logged in as Follower (or whatever HFT logic decides) and just wait for signals.
            pass
            
            # if not manager_id_for_yield and active_subscriptions:
            #      ...
            # if manager_id_for_yield and str(manager_id_for_yield) != str(MY_FOLLOWER_ID):
            #      ...
            #      time.sleep(10.0) # POLL_INTERVAL INCREASED (Allow Broadcaster to Sync properly)

            time.sleep(0.01) # Low Latency Loop (10ms)

    except KeyboardInterrupt:
        print("[STOP] Stopping Executor...")
    finally:
        release_lock(MY_FOLLOWER_ID)
        mt5.shutdown()

if __name__ == "__main__":
    print("Hydra Executor v1.1 (Ghost Buster & Unified Sync)")
    initialize_mt5()
    run_executor()


