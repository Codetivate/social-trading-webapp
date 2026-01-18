
import MetaTrader5 as mt5
import time
import requests
import json
import os
from dotenv import load_dotenv
load_dotenv() # 📥 Load .env file
from datetime import datetime, timedelta
# ⚙️ GLOBAL REDIS
import redis

# 🔒 STRICT POOLING
pool = redis.ConnectionPool.from_url(os.getenv("REDIS_URL", "redis://localhost:6379"), max_connections=5, decode_responses=True)
r_client = redis.Redis(connection_pool=pool)

import atexit
def cleanup():
    try: r_client.close()
    except: pass
atexit.register(cleanup)

import argparse
# 🔧 ARGUMENT PARSING
parser = argparse.ArgumentParser(description='Hydra Broadcaster')
parser.add_argument('--user-id', type=str, required=True, help='Master User ID')
parser.add_argument('--mt5-path', type=str, default=os.getenv("MT5_PATH"), help='Path to MT5 Terminal')
parser.add_argument('--secret', type=str, default=os.getenv("API_SECRET"), help='Bridge Secret')

parser.add_argument('--sync-history', type=int, default=0, help='Days of history to sync on startup (0 to disable)')
parser.add_argument('--exit-after-sync', action='store_true', help='Exit process after history sync complete')

args = parser.parse_args()

# ... (Previous Code) ...

def sync_history_to_db(days_back=30):
    print(f"[HISTORY] Syncing last {days_back} days...")
    from_date = datetime.now() - timedelta(days=days_back)
    to_date = datetime.now()
    
    # 1. Fetch Deals
    deals = mt5.history_deals_get(from_date, to_date)
    
    if deals:
        print(f"[HISTORY] Found {len(deals)} deals. Uploading...")
        payloads = []
        for deal in deals:
            # Detect Transaction Type
            # MT5 Deal Types: 0=Buy, 1=Sell, 2=Balance (Dep/With), 3=Credit, 4=Charge, 5=Correction, 6=Bonus
            
            t_type = "UNKNOWN"
            entry_type = "ENTRY" if deal.entry == mt5.DEAL_ENTRY_IN else "EXIT"

            if deal.type == 2: # BALANCE
                t_type = "DEPOSIT" if deal.profit >= 0 else "WITHDRAWAL"
                entry_type = "BALANCE"
            elif deal.type == 0:
                t_type = "BUY"
            elif deal.type == 1:
                t_type = "SELL"
            else:
                t_type = f"TYPE_{deal.type}"

            payloads.append({
                "ticket": str(deal.order), 
                "deal": str(deal.ticket), 
                "symbol": deal.symbol if deal.symbol else "BALANCE", # Balance ops have no symbol usually
                "type": t_type,
                "volume": deal.volume,
                "price": deal.price,
                "profit": deal.profit,
                "commission": deal.commission,
                "swap": deal.swap,
                "time": int(deal.time),
                "magic": deal.magic,
                "entryType": entry_type,
                "comment": deal.comment
            })
            
            # Batch Send (50 at a time)
            if len(payloads) >= 50:
                 try:
                     requests.post(f"{BASE_URL}/api/webhook/history-batch", json={
                         "history": payloads,
                         "masterId": MASTER_ID
                     }, headers={"x-bridge-secret": API_SECRET, "x-user-id": USER_ID}, timeout=5)
                     print(f"[HISTORY] Uploaded batch of {len(payloads)}")
                     payloads = []
                 except Exception as e:
                     print(f"[ERROR] History Batch Upload Failed: {e}")

        # Send remaining
        if payloads:
             try:
                 requests.post(f"{BASE_URL}/api/webhook/history-batch", json={
                     "history": payloads,
                     "masterId": MASTER_ID
                 }, headers={"x-bridge-secret": API_SECRET, "x-user-id": USER_ID}, timeout=5)
                 print(f"[HISTORY] Uploaded final batch of {len(payloads)}")
             except Exception as e:
                 print(f"[ERROR] History Batch Upload Failed: {e}")

    print("[HISTORY] Sync Complete (Logic Ready).")

# ... (Inside Main Loop) ...



# ... (Sync Balance Function) ...

def sync_balance(account_info, positions=[]):
    pass # Moved to Monitor Service

# ... (Main Entry) ...


def acquire_lock(user_id):
    """
    Tries to acquire the Global Terminal Lock for this User (Master).
    Returns True if successful, False if held by someone else.
    """
    if not r_client: return True # Fail Open
    
    # Derivation logic must match Broadcaster's lock key generator
    mt5_path = args.mt5_path if args.mt5_path else os.getenv("MT5_PATH", "")
    lock_seed = mt5_path if mt5_path else "default"
    lock_seed = os.path.normpath(str(lock_seed)).lower().strip()
    import hashlib
    path_hash = hashlib.md5(lock_seed.encode()).hexdigest()
    lock_key = f"lock:terminal:{path_hash}"

    # Try to set lock
    # Logic: Set if Not Exists OR if current owner is me
    current = r_client.get(lock_key)
    
    if current and current != str(user_id):
        # Held by someone else
        return False
        
    # Take it (TTL 60s)
    r_client.set(lock_key, str(user_id), ex=60)
    return True

def release_lock(user_id):
    """
    Releases the Global Terminal Lock if held by this user.
    """
    if not r_client: return

    mt5_path = args.mt5_path if args.mt5_path else os.getenv("MT5_PATH", "")
    lock_seed = mt5_path if mt5_path else "default"
    lock_seed = os.path.normpath(str(lock_seed)).lower().strip()
    import hashlib
    path_hash = hashlib.md5(lock_seed.encode()).hexdigest()
    lock_key = f"lock:terminal:{path_hash}"

    # Only delete if I own it
    current = r_client.get(lock_key)
    if current and current == str(user_id):
        r_client.delete(lock_key)

def acquire_broadcast_lock(user_id):
    # Reuse global client
    try:
        key = f"lock:broadcaster:{user_id}"
        if r_client.set(key, os.getpid(), nx=True, ex=5):
            return True, r_client
        else:
            return False, r_client
    except:
        return True, None


# ⚙️ CONFIGURATION
# ⚙️ SERVER DISCOVERY
HOSTS = [
    "http://localhost:3000",
    "http://192.168.2.35.nip.io:3000",
    "http://host.docker.internal:3000",
    os.getenv("AUTH_URL", "http://localhost:3000") # Fallback
]

def find_server():
    """Dynamically finds the active signal server"""
    print("[INFO] Searching for Signal Server...")
    for host in HOSTS:
        try:
            url = f"{host}/api/engine/poll"
            # print(f"   Trying {url}...")
            r = requests.get(url, timeout=1) 
            if r.status_code == 200:
                print(f"   -> Found Active Server: {host}")
                return host
        except:
             continue
    return HOSTS[0] # Default

# Initialize Dynamic URL
BASE_URL = find_server()
WEBHOOK_URL = f"{BASE_URL}/api/webhook/signal" 
BROKER_API_URL = f"{BASE_URL}/api/user/broker"
POLL_INTERVAL = 0.05 

# USER IDENTITY
USER_ID = args.user_id
MASTER_ID = USER_ID 
API_SECRET = args.secret or "AlphaBravoCharlieDeltaEchoFoxtro"

def fetch_credentials():
    print(f"[INFO] Fetching credentials from {BROKER_API_URL}...")
    try:
        r = requests.get(BROKER_API_URL, headers={
            "x-bridge-secret": API_SECRET,
            "x-user-id": USER_ID
        }, timeout=5)
        
        if r.status_code == 200:
            data = r.json()
            print("[OK] Credentials received from Cloud!")
            return int(data["login"]), data["password"], data["server"]
        else:
            print(f"[ERROR] Failed to fetch credentials: {r.status_code} {r.text}")
            return None
    except Exception as e:
        print(f"[ERROR] Network Error fetching creds: {e}")
        return None

def initialize_mt5():
    # 1. Fetch Target Credentials (to know who we SHOULD be)
    creds = fetch_credentials()
    target_login = None
    if creds:
        target_login, password, server = creds
    else:
        print("[STOP] No CONNECTED Broker Account found via API. Exiting Broadcaster.")
        # We exit here because the user has explicitly disconnected (or never connected).
        # Should not retry indefinitely or use random fallbacks.
        quit()

    # 2. Path Configuration
    # PRIORITY: CLI Arg > Env Var > Default
    mt5_path = args.mt5_path if args.mt5_path else os.getenv("MT5_PATH", "")
    init_args = {}
    if mt5_path and os.path.exists(mt5_path):
        init_args["path"] = mt5_path
        print(f"[INFO] Target Terminal: {mt5_path}")
    
    # 2b. 🔒 CHECK FOR HFT LOCK (Prevent Startup Conflict)
    if r_client:
        lock_seed = mt5_path if mt5_path else "default"
        # NORMALIZE (Critical)
        lock_seed = os.path.normpath(str(lock_seed)).lower().strip()
        import hashlib
        path_hash = hashlib.md5(lock_seed.encode()).hexdigest()
        lock_key = f"lock:terminal:{path_hash}"
        
        # print(f"[DEBUG] Broadcaster Init Key: {lock_key}")
        
        # Wait if locked
        for _ in range(5): # Wait up to 5s at startup
            owner = r_client.get(lock_key)
            if owner and owner != USER_ID:
                print(f"[WAIT] Terminal in use by {owner}. Pausing Init...")
                time.sleep(1.0)
            else:
                break

    print(f"[DEBUG] Attempting mt5.initialize()...")

    # 3. ATTACH MODE: Try to initialize WITHOUT credentials first
    # This allows connecting to an already open terminal (Manual Login / OTP)
    if not mt5.initialize(**init_args):
        print("[ERROR] initialize() failed, error code =", mt5.last_error())
        quit()
    
    print(f"[DEBUG] mt5.initialize() Success!")

    # 3b. STRICT PATH VERIFICATION
    # Ensure we actually connected to the requested terminal (Anti-Hijack)
    if mt5_path:
        connected_path = mt5.terminal_info().path
        # Normalize both for comparison
        req_norm = os.path.normpath(mt5_path).lower()
        got_norm = os.path.normpath(connected_path).lower()
        
        # Check if Got is "inside" Req or match (handle exe vs folder)
        if req_norm not in got_norm and got_norm not in req_norm:
             print(f"[CRITICAL] Terminal Hijack Detected! Requested: {mt5_path}, Connected: {connected_path}")
             print(f"[STOP] Aborting to prevent cross-talk.")
             mt5.shutdown()
             quit()


    # 4. Check Current Login
    current_account = mt5.account_info()
    if current_account:
        print(f"[INFO] Attached to Terminal. Current Login: {current_account.login}")
        if target_login and str(current_account.login) == str(target_login):
            print(f"[OK] Account Match! Proceeding with existing session (OTP Friendly).")
            return
        else:
            print(f"[WARN] Account Mismatch! Active: {current_account.login}, Target: {target_login}")
    
    # 5. AUTO-LOGIN (Fallback if not connected or wrong account)
    print(f"[INFO] Attempting Auto-Login to {target_login}...")
    authorized = mt5.login(
        login=int(target_login),
        password=password,
        server=server
    )
    
    if authorized:
        print(f"[OK] Login Successful: {target_login}")
        return True
    else:
        print(f"[WARN] Auto-Login Failed: {mt5.last_error()} - Will retry...")
        return False


def follow_signals():
    print(f"[START] Broadcaster Started. Watching Trades for Master {MASTER_ID}...")
    
    # 🧹 ZOMBIE CLEANUP: Clear any stale state from previous (crashed) sessions
    # This prevents Followers from seeing "Ghost" trades if we restart with 0 positions.
    if r_client:
        r_client.delete(f"state:master:{MASTER_ID}:tickets")
        r_client.delete(f"state:master:{MASTER_ID}:ready") # 🧹 START FRESH: Prevent Stale Ready Flag
        print(f"   [CLEANUP] Flushed Redis State for {MASTER_ID}")

    # 🔑 AUTHENTICATION: Fetch Master Credentials Once
    master_creds = fetch_credentials() # Returns (login, password, server)
    if not master_creds:
        print("[ERROR] Could not fetch Master Credentials! Broadcaster cannot enforce account integrity.")
        # We could retry or exit. Let's retry in loop? No, simplified: retry logic is needed.
        # But for now, let's just proceed and try to fetch inside loop if needed? 
        # Safer to just wait for valid creds.
        pass 

    # Store position snapshots: { ticket: { sl, tp, volume, price } }
    known_positions = {}
    is_first_run = True

    poll_interval = POLL_INTERVAL # Local var from Global Config
    last_equity_report = 0
    last_yield_time = time.time()
    should_yield = False # ⚡ Optimize Latency: Yield immediately if we sent a signal
    
    # Extract Target Login for Yield Re-Login
    target_login = int(master_creds[0]) if master_creds and len(master_creds) > 0 else 0
    loop_counter = 0

    # ⚡ HELPER: Flush State to Redis
    def flush_state(equity=0.0, positions_with_profit=None):
        if r_client:
            try:
                state_key_pos = f"state:master:{MASTER_ID}:tickets"
                
                # Calculate Unrealized PnL from position profits
                unrealized_pnl = 0.0
                if positions_with_profit:
                    for p in positions_with_profit:
                        unrealized_pnl += float(getattr(p, 'profit', 0.0))
                        unrealized_pnl += float(getattr(p, 'swap', 0.0))
                
                state_payload = {
                     "tickets": list(known_positions.keys()),
                     "positions": known_positions,
                     "equity": float(equity), # 🆕 PERSIST EQUITY for Catch-Up
                     "unrealizedPnL": round(unrealized_pnl, 2), # 🆕 MASTER PnL for Followers
                     "timestamp": time.time(),
                     "count": len(known_positions)
                }
                r_client.set(state_key_pos, json.dumps(state_payload, default=str))
                # print(f"   [SYNC] 💾 Flushed State ({len(known_positions)} positions, PnL: {unrealized_pnl:.2f})")
            except Exception as e:
                print(f"   [WARN] Failed to flush state: {e}")


    while True:
        try:
            # 🛡️ TERMINAL MUTEX CHECK
            # Before accessing MT5 or checking login, ensure we are not interrupting an Executor
            mt5_path = args.mt5_path if args.mt5_path else os.getenv("MT5_PATH", "")
            
            # 🔒 ROBUST LOCKING: Even if path is invalid/empty, we share the "default" terminal.
            # We must sync on a common key.
            lock_seed = mt5_path if mt5_path else "default"
            # NORMALIZE PATH (Must match Executor logic!)
            lock_seed = os.path.normpath(str(lock_seed)).lower().strip()
            
            if r_client:
                # 1. 🤝 CHECK GLOBAL VERIFY LOCK (Priority)
                global_lock = r_client.get("lock:terminal:global")
                if global_lock == "LOCKED_VERIFY":
                     # print(f"[WAIT] Yielding to Verify Script... (Broadcaster Paused)")
                     mt5.shutdown()
                     time.sleep(1.0)
                     continue

                # 2. CHECK HFT LOCK (Path Specific)
                import hashlib
                path_hash = hashlib.md5(lock_seed.encode()).hexdigest()
                lock_key = f"lock:terminal:{path_hash}"
                # print(f"[DEBUG] Broadcaster Lock Key: {lock_key}")
                lock_owner = r_client.get(lock_key)
                
                # If Locked by SOMEONE ELSE (e.g., Executor), we MUST PAUSE.
                if lock_owner and lock_owner != USER_ID:
                    # print(f"[WAIT] Terminal locked by Executor {lock_owner}. Pausing Broadcaster...") # Verbose
                    time.sleep(0.5)
                    continue


            # 🛡️ CONNECTION GUARD: Prevent "False Closes" if terminal disconnects
            # If terminal is disconnected, positions_get() might return empty or stale data.
            # We must NOT signal closes if we are not connected.
            term_info = mt5.terminal_info()
            if not term_info or not term_info.connected:
                print("[WARN] Terminal Disconnected! Pausing signal broadcast...")
                # Try to reconnect
                initialize_mt5()
                time.sleep(1)
                continue

            # 🛡️ ACCOUNT INTEGRITY CHECK (Critical for Shared Terminal)
            # Ensure we are logged in as the MASTER, not the Follower
            start_info = mt5.account_info()
            
            # Initialize target_login safely
            target_login = None
            if master_creds:
                 target_login = master_creds[0]
                 if not start_info or str(start_info.login) != str(target_login):
                     # 🛑 STOP! Check if Executor is active before fighting it.
                     
                     # 1. Check Redis Lock explicitly
                     if r_client:
                         import hashlib 
                         # 🛡️ KEY MATCH FIX: Must normalize exactly like HFT Executor
                         norm_seed = os.path.normpath(str(lock_seed)).lower().strip()
                         path_hash = hashlib.md5(norm_seed.encode()).hexdigest()
                         lock_key = f"lock:terminal:{path_hash}"
                         current_lock = r_client.get(lock_key)
                         
                         # DEBUG: Print Key to Verify Match
                         # print(f"[DEBUG-LOCK] Broadcaster Checking Key: {lock_key} (Lock: {current_lock})")
                         
                         if current_lock and str(current_lock) != str(USER_ID):
                               print(f"   [WAIT] Terminal Locked by {current_lock}. Yielding...")
                               time.sleep(2.0)
                               continue 

                     # 2. ⚡ PASSIVITY GUARD: Don't assume Hijack immediately. 
                     # The Executor might be in the middle of a switch.
                     # Wait and double-check to avoid "Fighting".
                     mismatch_count = 0
                     confirmed_mismatch = False
                     
                     for _ in range(5): # Wait up to 2.5s
                         time.sleep(0.5)
                         chk = mt5.account_info()
                         if chk and str(chk.login) == str(target_login):
                             # Resolved itself!
                             confirmed_mismatch = False
                             break
                         confirmed_mismatch = True
                         
                     if not confirmed_mismatch:
                         continue

                     # If we get here, the Mismatch is persistent (2.5s) AND no Lock is held.
                     # We must reclaim the terminal.
                     print(f"[WARN] Account Drift! Active: {start_info.login if start_info else 'None'}, Target: {target_login}. Re-asserting Login...")
                     mt5.login(login=target_login, password=master_creds[1], server=master_creds[2])
                     
                     # ⚡ OPTIMIZED: Smart Poll instead of Sleep
                     for _ in range(20): # Max 2.0s
                         if mt5.account_info() and mt5.account_info().login == target_login: break
                         time.sleep(0.1)
                     # No continue here. Proceed to Scan. 
                     
            # 🔄 REFRESH ACCOUNT INFO (Post-Login-Check)
            # Critical: 'start_info' might be stale (Slave Info) if we just switched accounts above.
            # We must refresh it to ensure 'master_equity' payload is correct (Master Info).
            start_info = mt5.account_info()
            if start_info and target_login and str(start_info.login) != str(target_login):
                print(f"[WARN] Account Info Stale/Mismatch despite login attempt. Skipping tick...")
                continue

            # 1. Get Current Open Positions
            current_positions_tuple = mt5.positions_get()

            # 🛑 CRITICAL STABILITY: Anti-False Close Protection
            # If we know we have positions, but scan returns 0, it might be Switch Lag.
            # Wait up to 5s to confirm it's actually empty.
            if len(known_positions) > 0 and (current_positions_tuple is not None and len(current_positions_tuple) == 0):
                 # print(f"[SYNC] Suspicious Empty Scan (Known: {len(known_positions)}). Stabilizing...")
                 for _ in range(25): # 5.0s
                      current_positions_tuple = mt5.positions_get()
                      if current_positions_tuple and len(current_positions_tuple) > 0:
                           break
                      time.sleep(0.2)
                 
                 # 🔄 FALLBACK: Force Refresh
                 if current_positions_tuple is not None and len(current_positions_tuple) == 0:
                      # print(f"[SYNC] Force Refreshing Login for Broadcaster...")
                      mt5.login(login=target_login, password=master_creds[1], server=master_creds[2])
                      time.sleep(1.0)
                      current_positions_tuple = mt5.positions_get()

            
            # 🛡️ POST-READ INTEGRITY CHECK
            end_info = mt5.account_info()
            if not end_info or end_info.login != target_login:
                print(f"[WARN] Race Condition Detected! Account switched during scan. Discarding dirty data.")
                continue # Discard current_positions_tuple as it implies it might be from Follower

            
            if current_positions_tuple is None:
                if mt5.last_error()[0] != 1: # 1 = Success
                     print(f"[WARN] MT5 Position Scan Failed (Error: {mt5.last_error()}). Retrying...")
                     time.sleep(0.5)
                     continue # 🛡️ SAFETY: Do not assume empty list. Abort iteration.
                current_positions_tuple = []

            # Convert struct tuple to list for easier handling
            current_positions = list(current_positions_tuple)
            current_tickets = {p.ticket for p in current_positions}
            
            # --- 0. INITIAL SYNC (Guarded) ---
            if is_first_run:
                print(f"[INFO] Initial Sync (Guarded). Found {len(current_positions)} positions.")
                for p in current_positions:
                     # 🛡️ SAFETY: Ignore trades opened by the Executor (Magic 234000)
                    if p.magic == 234000: continue
                    known_positions[p.ticket] = {
                        "sl": p.sl,
                        "tp": p.tp,
                        "price": p.price_open,
                        "volume": p.volume,
                        "symbol": p.symbol,
                        "type": "BUY" if p.type == 0 else "SELL"
                    }
                is_first_run = False
                
                # ⚡ FAST START: Push Initial State to Redis IMMEDIATELY
                # This ensures the Executor (Ghost Buster) sees existing trades on startup/restart
                # and can trigger "Catch-Up" for Resubscribing users.
                if r_client:
                    try:
                        state_payload = json.dumps({
                            "tickets": list(known_positions.keys()),
                            "positions": known_positions,
                            "equity": float(start_info.equity if start_info else 0.0), # 🆕 PERSIST EQUITY for Match
                            "timestamp": time.time(),
                            "count": len(known_positions)
                        }, default=str)
                        r_client.set(f"state:master:{MASTER_ID}:tickets", state_payload, ex=60)
                        print(f"[INFO] Initial State Pushed to Redis ({len(known_positions)} positions).")
                        
                        # 🧟 GHOST BUSTER SUPPORT: Rehydrate "Closed History" for Offline Closes
                        # If we were offline when a trade closed, we missed the event.
                        # We must populate 'history:master:{id}:closed' so Executor sees it.
                        # 1. FLUSH STALE HISTORY (Critical for Account/Server Switches)
                        r_client.delete(f"history:master:{MASTER_ID}:closed")
                        
                        print(f"[INIT] Hydrating Closed History (Last 24h)...")
                        from_date = datetime.now() - timedelta(hours=24)
                        to_date = datetime.now()
                        deals = mt5.history_deals_get(from_date, to_date)
                        
                        hydrated_count = 0
                        if deals:
                            for d in deals:
                                # ENTRY_OUT=1, ENTRY_INOUT=2, ENTRY_OUT_BY=3
                                if d.entry in [1, 2, 3]: 
                                    r_client.sadd(f"history:master:{MASTER_ID}:closed", str(d.position_id))
                                    hydrated_count += 1
                            
                            r_client.expire(f"history:master:{MASTER_ID}:closed", 172800) # 48h TTL
                            print(f"[INIT] Hydrated {hydrated_count} Closed Trades from History.")
                            
                            # 🏁 READY FLAG: Signal Executor that it's safe to scan
                            r_client.set(f"state:master:{MASTER_ID}:ready", "1", ex=300)
                            print(f"[INIT] 🏁 Signal Server Ready. (Flag Set)")
                            
                    except Exception as e:
                        print(f"[WARN] Failed to Push Initial State/History: {e}")

                # Skip signal generation for this tick
                time.sleep(poll_interval)
                continue

            # --- A. CHECK FOR NEW POSITIONS ---
            for pos in current_positions:
                # 🛡️ SAFETY: Ignore trades opened by the Executor (Magic 234000) to avoid Infinite Loop
                if pos.magic == 234000:
                    continue

                if pos.ticket not in known_positions:
                    print(f"[SIGNAL] OPEN: {pos.symbol} {pos.ticket} (Magic: {pos.magic})")
                    
                    # 1. ⚡ STATE FIRST: Persist to Memory Immediately
                    # This ensures that even if 'send_signal' blocks/fails, the State Sync (at end of loop)
                    # will include this trade, allowing Executor to Catch-Up.
                    known_positions[pos.ticket] = {
                        "sl": pos.sl, 
                        "tp": pos.tp, 
                        "price": pos.price_open, 
                        "volume": pos.volume,
                        "symbol": pos.symbol,
                        "type": "BUY" if pos.type == 0 else "SELL",
                        "open_time": pos.time
                    }

                    # 🕒 CALCULATE TRADE AGE (Timezone Neutral)
                    # We use the Broker's Current Time for this symbol to avoid local clock skew.
                    tick = mt5.symbol_info_tick(pos.symbol)
                    if tick:
                        server_time = tick.time 
                        age_seconds = server_time - pos.time
                        known_positions[pos.ticket]["age_seconds"] = age_seconds
                    else:
                        known_positions[pos.ticket]["age_seconds"] = 0 # Fallback

                    payload = {
                        "masterId": MASTER_ID,
                        "master_login": int(target_login) if target_login else 0, # ✅ Anti-Loopback
                        "ticket": str(pos.ticket), # ✅ String Ticket
                        "symbol": pos.symbol,
                        "type": "BUY" if pos.type == 0 else "SELL", 
                        "volume": pos.volume,
                        "price": pos.price_open,
                        "sl": pos.sl,
                        "tp": pos.tp,
                        "action": "OPEN",
                        "openTime": int(pos.time), # 🆕 OPEN TIME
                        "master_equity": start_info.equity if start_info else 0.0 # 🆕 EQUITY RATIO SUPPORT
                    }
                    send_signal(payload)
                    should_yield = True # ⚡ Yield Lock ASAP
                    
                    # 🛑 CRITICAL SYNCHRONIZATION FIX:
                    # We MUST update the Redis State (Positions) IMMEDIATELY before yielding.
                    # Otherwise, Executor wakes up, sees no positions in Redis, and ignores the trade.
                    flush_state(start_info.equity if start_info else 0.0)
                else:
                    prev_data = known_positions[pos.ticket]
                    
                    # --- B1. CHECK FOR PARTIAL CLOSE (Volume Decrease) ---
                    if pos.volume < prev_data["volume"]:
                        diff = prev_data["volume"] - pos.volume
                        diff = float(round(diff, 2)) # Float safe
                        
                        # 📉 CALC PERCENTAGE (Crucial for Ratio-Based Closing)
                        # If Master goes 1.0 -> 0.5 (50% closed), Follower should do X -> 0.5*X
                        prev_vol = float(prev_data["volume"])
                        pct = 0.0
                        if prev_vol > 0:
                            pct = diff / prev_vol
                        
                        print(f"[SIGNAL] PARTIAL CLOSE: {pos.ticket} Vol: {prev_vol} -> {pos.volume} (Diff: {diff}, Pct: {pct:.2%})")
                        
                        # ⚡ STATE FIRST
                        known_positions[pos.ticket]["volume"] = pos.volume
                        
                        payload = {
                            "masterId": MASTER_ID,
                            "ticket": str(pos.ticket),
                            "symbol": pos.symbol,
                            "action": "CLOSE", # Treat as Close
                            "volume": diff,    # Only close the difference
                            "pct": pct,         # ✅ Send Percent
                            "price": pos.price_open, # Not really close price, but needed for schema
                            "type": prev_data["type"],
                            "master_login": int(target_login) if target_login else 0, # ✅ Anti-Loopback
                            "closeTime": int(time.time()),
                            "master_equity": start_info.equity if start_info else 0.0 # 🆕 EQUITY RATIO SUPPORT
                        }
                        send_signal(payload)
                        flush_state(start_info.equity if start_info else 0.0) # ⚡ UPDATE STATE
                        should_yield = True # ⚡ Yield Lock ASAP

                    # --- B2. CHECK FOR MODIFICATIONS (SL/TP) ---
                    if prev_data["sl"] != pos.sl or prev_data["tp"] != pos.tp:
                        print(f"[SIGNAL] MODIFY: {pos.ticket} SL: {pos.sl} TP: {pos.tp}")
                        
                        # ⚡ STATE FIRST
                        known_positions[pos.ticket]["sl"] = pos.sl
                        known_positions[pos.ticket]["tp"] = pos.tp
                        
                        payload = {
                            "masterId": MASTER_ID,
                            "master_login": int(target_login) if target_login else 0, # ✅ Anti-Loopback
                            "ticket": str(pos.ticket), # ✅ String Ticket
                            "symbol": pos.symbol,
                            "action": "MODIFY",
                            "sl": pos.sl,
                            "tp": pos.tp,
                            "master_entry": pos.price_open, # ✅ Critical for Invert Logic
                            "master_equity": start_info.equity if start_info else 0.0 # 🆕 EQUITY RATIO SUPPORT
                        }
                        send_signal(payload)
                        flush_state(start_info.equity if start_info else 0.0) # ⚡ UPDATE STATE
                        should_yield = True # ⚡ Yield Lock ASAP
                        should_yield = True # ⚡ Yield Lock ASAP

            # --- C. CHECK FOR CLOSED POSITIONS ---
            # Any ticket in known_positions that is NOT in current_tickets is considered closed
            closed_tickets = [t for t in known_positions if t not in current_tickets]
            
            if closed_tickets:
                # ⚡ BULK OPTIMIZATION: Fetch History ONCE for all closes
                # Look back 5 minutes (sufficient for immediate detection)
                history = mt5.history_deals_get(datetime.now() - timedelta(minutes=5), datetime.now())
                
                for ticket in closed_tickets:
                    print(f"[SIGNAL] CLOSE DETECTED: {ticket}. Fetching PnL...")
                    
                    # ⚡ STATE FIRST: Remove immediately so Ghost Buster knows it's gone
                    c_type = known_positions[ticket].get("type", "UNKNOWN")
                    c_symbol = known_positions[ticket].get("symbol", "Unknown")
                    c_price = known_positions[ticket].get("price", 0.0)
                    c_initial_vol = float(known_positions[ticket].get("volume", 0.0)) # ✅ Capture Volume Before Delete
                    c_open_time = known_positions[ticket].get("open_time", int(time.time()))
                    del known_positions[ticket]

                    # ⚡ FAST SYNC: Log deletion to Redis (for Ghost Buster)
                    if r_client:
                         try:
                             r_client.sadd(f"history:master:{MASTER_ID}:closed", str(ticket))
                             r_client.expire(f"history:master:{MASTER_ID}:closed", 172800)
                             
                             # 🛑 CRITICAL SYNCHRONIZATION FIX:
                             # We MUST update the Redis State (Positions) IMMEDIATELY before yielding.
                             # Otherwise, Executor wakes up, sees OLD (Open) positions in Redis, and ignores the CLOSE.
                             state_payload = {
                                 "updated": time.time(),
                                 "positions": known_positions
                             }
                             r_client.set(f"state:master:{MASTER_ID}:positions", json.dumps(state_payload))
                             
                         except: pass

                    # 🔍 FIND DEAL INFO
                    deal_info = None
                    
                    # 1. Try Bulk History First (Fastest)
                    if history:
                        for deal in history:
                            if deal.position_id == ticket and deal.entry in [mt5.DEAL_ENTRY_OUT, mt5.DEAL_ENTRY_OUT_BY, mt5.DEAL_ENTRY_INOUT]:
                                deal_info = deal
                                break
                    
                    # 2. Retry Loop (Specific Position Check) - Handle Async Latency
                    if not deal_info:
                        for attempt in range(3):
                            time.sleep(0.5) # Wait for MT5 to index
                            specific_history = mt5.history_deals_get(position=ticket)
                            if specific_history:
                                for deal in specific_history:
                                    if deal.entry in [mt5.DEAL_ENTRY_OUT, mt5.DEAL_ENTRY_OUT_BY, mt5.DEAL_ENTRY_INOUT]:
                                        deal_info = deal
                                        print(f"      [RETRY] Found Deal on Attempt {attempt+1}")
                                        break
                            if deal_info: break
                    
                    payload = {
                        "masterId": MASTER_ID,
                        "master_login": int(target_login) if target_login else 0, # ✅ Anti-Loopback
                        "ticket": str(ticket),
                        "action": "CLOSE",
                        "type": c_type,
                        "symbol": c_symbol,
                        "openPrice": c_price,
                        "openTime": c_open_time
                    }

                    if deal_info:
                        # 📉 CALC PERCENTAGE for Deal Close
                        d_vol = float(deal_info.volume)
                        pct = 0.0
                        if c_initial_vol > 0:
                            pct = d_vol / c_initial_vol
                            
                        print(f"   ✅ Deal Found! Profit: {deal_info.profit} (Vol: {d_vol}/{c_initial_vol} = {pct:.2%})")
                        
                        payload.update({
                            "price": deal_info.price, # Close Price
                            "profit": deal_info.profit,
                            "swap": deal_info.swap,
                            "commission": deal_info.commission,
                            "volume": deal_info.volume,
                            "pct": pct, # ✅ Send Percent
                            "closeTime": int(deal_info.time)
                        })
                    else:
                        print(f"   ⚠️ Deal History not found for {ticket}. Sending FULL CLOSE fallback.")
                        
                        # 🏷️ PRICE FIX: Check Current Market Price for Estimation
                        estimated_close_price = c_price # Default to Open Price (0 PnL)
                        try:
                             tick = mt5.symbol_info_tick(c_symbol)
                             if tick:
                                 # Close BUY -> Sell at BID. Close SELL -> Buy at ASK.
                                 current_p = tick.bid if c_type == 'BUY' else tick.ask
                                 if current_p > 0:
                                     estimated_close_price = current_p
                        except: pass

                        # Fallback: Full Close -> 100%
                        payload["volume"] = c_initial_vol
                        payload["pct"] = 1.0 # 100% Close
                        payload["closeTime"] = int(time.time())
                        payload["price"] = estimated_close_price # ✅ FIX NULL PRICE IN DB
                    
                    # 🚀 SEND SIGNAL
                    print(f"   [DEBUG-SIGNAL] Sending CLOSE Payload: Price={payload.get('price')} Vol={payload.get('volume')} Pct={payload.get('pct')}")
                    send_signal(payload)
                    
                    # 📜 SAVE HISTORY (Immediate)
                    # We send a single-item batch to the history endpoint to persist it.
                    try:
                        history_item = {
                            "ticket": str(ticket),
                            "deal": str(deal_info.ticket) if deal_info else str(ticket),  # API expects 'deal', not 'order'
                            "time": int(deal_info.time) if deal_info else int(time.time()),
                            "type": "BUY" if (deal_info.type if deal_info else (0 if c_type == 'BUY' else 1)) == 0 else "SELL",
                            "entry": 1, # Entry Out
                            "symbol": c_symbol,
                            "volume": float(deal_info.volume) if deal_info else c_initial_vol,
                            # ✅ Use Estimated Close Price instead of Open Price for fallback
                            "price": float(deal_info.price) if deal_info else estimated_close_price, 
                            "profit": float(deal_info.profit) if deal_info else 0.0,
                            "swap": float(deal_info.swap) if deal_info else 0.0,
                            "commission": float(deal_info.commission) if deal_info else 0.0,
                            "comment": deal_info.comment if deal_info else "Auto Close"
                        }
                        
                        requests.post(f"{BASE_URL}/api/webhook/history-batch", json={
                            "history": [history_item],
                            "masterId": MASTER_ID
                        }, headers={"x-bridge-secret": API_SECRET, "x-user-id": USER_ID}, timeout=2)
                        print(f"   [HISTORY] Saved Master Close: {ticket}")
                    except Exception as e:
                        print(f"   [WARN] Failed to Save Master History: {e}")
                
                # ⚡ UPDATE STATE (After removing ALL closed tickets)
                flush_state(start_info.equity if start_info else 0.0)
                should_yield = True

            # --- D. PERIODIC BALANCE SYNC (Every 1s) ---
            # sync_balance moved to Monitor Service

            # 4. 🧠 STATE SYNC (Anti-Ghosting) & HISTORY VERIFICATION
            # ⚡ THROTTLED: Only update Redis every 5s to reduce I/O (production scale)
            if 'last_pnl_sync_time' not in dir(): last_pnl_sync_time = 0
            if 'last_pnl_log_time' not in dir(): last_pnl_log_time = 0
            current_sync_time = time.time()
            
            if current_sync_time - last_pnl_sync_time < 5.0:
                # Skip this sync cycle (throttled)
                pass
            else:
                try:
                    # A. Active Snapshot
                    # 🔄 UPDATE AGES: Recalculate 'age_seconds' for all positions before snapshot
                    # This ensures the Executor sees the current age, not just the age at 'open'.
                    for t_id, t_data in known_positions.items():
                        try:
                            tick = mt5.symbol_info_tick(t_data['symbol'])
                            if tick:
                                t_data['age_seconds'] = tick.time - t_data['open_time']
                        except: pass

                    active_tickets = list(known_positions.keys())
                    
                    # 🆕 Calculate Unrealized PnL from CURRENT positions (not known_positions dict)
                    # We need to fetch fresh profit values from MT5
                    current_pos = mt5.positions_get()
                    unrealized_pnl = 0.0
                    if current_pos:
                        for p in current_pos:
                            unrealized_pnl += float(getattr(p, 'profit', 0.0))
                            unrealized_pnl += float(getattr(p, 'swap', 0.0))
                    
                    state_payload = json.dumps({
                        "tickets": list(known_positions.keys()), # Legacy support
                        "positions": known_positions,            # Full State for Catch-Up
                        "equity": start_info.equity if start_info else 0.0,
                        "unrealizedPnL": round(unrealized_pnl, 2), # MASTER PnL for Followers
                        "timestamp": time.time(),
                        "count": len(known_positions)
                    }, default=str) # Handle BigInts
                    
                    # ⚡ OPTIMIZED: Only log every 60s to reduce console spam
                    if current_sync_time - last_pnl_log_time > 60.0:
                        print(f"   [📊 PNL] ${unrealized_pnl:.2f} ({len(known_positions)} pos) synced to Redis")
                        last_pnl_log_time = current_sync_time
                    
                    r_client.set(f"state:master:{MASTER_ID}:tickets", state_payload, ex=60)
                    last_pnl_sync_time = current_sync_time

                except Exception as e:
                    print(f"   [WARN] State Sync Failed: {e}")

            # B. History Sync (Confirm Closes) - Outside throttle, runs every loop
            try:
                # Sync last 24h of history to allow followers to verify "Did Master actually close this?"
                from_date = datetime.now() - timedelta(days=1)
                history_deals = mt5.history_deals_get(from_date, datetime.now())
                
                if history_deals:
                    # Extract Position IDs (Ticket) from deals where entry=OUT (Close)
                    closed_tickets = set()
                    for deal in history_deals:
                        if deal.entry == mt5.DEAL_ENTRY_OUT:
                            closed_tickets.add(str(deal.position_id))
                    
                    if closed_tickets:
                        # Store as Redis Set for O(1) checking
                        r_client.sadd(f"history:master:{MASTER_ID}:closed", *closed_tickets)
                        # Set expiry to 48h to keep DB size managed but allow weekend catchup
                        r_client.expire(f"history:master:{MASTER_ID}:closed", 172800)
            
            except Exception as e:
                print(f"   [WARN] History Sync Failed: {e}")

            # 📊 ANALYTICS: Report Equity Snapshot (Every 60s)
            if time.time() - last_equity_report > 60:
                acct = mt5.account_info()
                if acct:
                    # Send Snapshot
                    snap_url = WEBHOOK_URL.replace("/signal", "/equity-snap")
                    snap_payload = {
                        "userId": USER_ID,
                        "balance": acct.balance,
                        "equity": acct.equity
                    }
                    try:
                        requests.post(snap_url, json=snap_payload, headers={"x-bridge-secret": API_SECRET}, timeout=2)
                        print(f"   [📊 SNAPSHOT] Equity: {acct.equity} Balance: {acct.balance}")
                        last_equity_report = time.time()
                    except Exception as e:
                        print(f"   [WARN] Failed to report snapshot: {e}")

            # 5. Sleep
            # 5. Sleep & HEARTBEAT
            if r_client:
                 r_client.expire(f"lock:broadcaster:{USER_ID}", 5)
            
            # 🛡️ COOPERATIVE YIELD (Tick-Tock)
            # If we are sharing the terminal (Single Machine), we must yield to the Executor occasionally.
            # Executor needs ~1-2s to switch account, trade, and release.
            if loop_counter % 50 == 0: # Every ~5s (assuming 0.1s poll) - actually poll is 3.0s, so this is too slow.
                 # Poll is controlled by 'poll_interval' which defaults to 1.0 or 3.0.
                 pass

            # Better Logic: Time based yield OR Triggered Yield (Signal Sent)
            if (time.time() - last_yield_time > 4.0) or should_yield: 
                 reason = "SIGNAL" if should_yield else "TIMEOUT"
                 # print(f"[YIELD] 🤝 Yielding Terminal Lock to Executor ({reason})...")
                 
                 release_lock(MASTER_ID) # Release Terminal Lock
                 
                 # ⚡ Optimize: Sleep less. Executor should be fast.
                 # If we yielded due to SIGNAL, Executor is awake waiting for lock.
                 # 0.5s might be enough for it to grab it.
                 time.sleep(0.5) 
                 
                 # Re-Acquire
                 # print(f"[RESUME] 🔄 Re-Acquiring Lock...")
                 if not acquire_lock(MASTER_ID):
                      print(f"[WAIT] Waiting for Executor to finish...")
                      while not acquire_lock(MASTER_ID):
                          time.sleep(0.5) # Fast poll while waiting
                 
                 # Re-Login (Just in case Executor switched it)
                 info = mt5.account_info()
                 if info and info.login != target_login:
                      print(f"[RESUME] Switching back to Master {target_login}...")
                      mt5.login(target_login)
                      # time.sleep(0.2) # Fast switch
                 
                 last_yield_time = time.time()
                 should_yield = False # Reset Flag
            else:
                 time.sleep(poll_interval)
            
        except KeyboardInterrupt:
            print("[STOP] Stopping Broadcaster...")
            mt5.shutdown()
            break
        except Exception as e:
            print(f"[ERROR] Broadcaster Loop Error: {e}")
            time.sleep(1)



# ⚙️ REDIS CONFIGURATION
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
import redis
try:
    r_client = redis.from_url(REDIS_URL, decode_responses=True)
    r_client.ping()
    print(f"[OK] Connected to Redis Cache: {'Cloud' if 'upstash' in REDIS_URL else 'Local'}")
except Exception as e:
    print(f"[WARN] Redis Connection Failed: {e}")
    r_client = None


QUEUE_PRIORITY = "queue:priority"
QUEUE_NORMAL = "queue:normal"

def push_to_queue(payload):
    """
    Pushes Master Signal to Central Dispatcher Queue (Hydra v2.0).
    """
    try:
        if not r_client: return

        # 1. Add Timestamp for Latency Guard
        payload["timestamp"] = time.time()
        
        # 2. Determine Priority
        # CLOSE, CLOSE_ALL, and MASTER_OPEN = Priority
        # Only FOLLOWER_OPEN (Start Copy) might be Normal, but here all Master Signals are Priority.
        target_queue = QUEUE_PRIORITY
        
        # 3. Push to Redis List (Right Push)
        r_client.rpush(target_queue, json.dumps(payload))
        # print(f"    -> Queued to {target_queue}")
        
    except Exception as e:
        print(f"   [ERROR] Failed to Push to Queue: {e}")

def send_signal(payload):
    try:
        # 0. 🛡️ ENRICH PAYLOAD (Timestamp Critical for Staleness Check)
        if 'timestamp' not in payload:
            payload['timestamp'] = time.time()

        # 1. ⚡ REDIS PUB/SUB (Real-Time for UI/WebSockets)
        json_payload = json.dumps(payload)
        if r_client:
            r_client.publish(f"signals:master:{MASTER_ID}", json_payload)
        
        # 2. 🧱 HYDRA QUEUE (Reliable Execution)
        push_to_queue(payload)
        
        # 3. 📝 AUDIT LOG
        if r_client:
            r_client.xadd('stream:signals', { 'payload': json_payload, 'timestamp': str(time.time()) })
        
        # 4. 🕸️ SYNC TO DATABASE (Critical for History/UI)
        requests.post(WEBHOOK_URL, json=payload, headers={"x-bridge-secret": API_SECRET}, timeout=1)

        print(f"   [🚀] Signal Pushed to System (Ticket: {payload['ticket']})")

    except Exception as e:
        print(f"   [ERROR] Redis/Network Error: {e}")
        # Fallback to HTTP only if Redis fails
        try:
             requests.post(WEBHOOK_URL, json=payload, headers={"x-bridge-secret": API_SECRET}, timeout=2)
             print(f"   [fallback] Sent via HTTP")
        except:
             pass

def sync_history_to_db(days_to_sync):
    """
    Fetches history from MT5 and sends to Backend in batches.
    """
    print(f"[HISTORY] Starting Sync for last {days_to_sync} days...")
    
    from_date = datetime.now() - timedelta(days=days_to_sync)
    to_date = datetime.now() + timedelta(days=1)
    
    # 1. Fetch Deals
    deals = mt5.history_deals_get(from_date, to_date)
    
    if deals is None:
        print(f"[HISTORY] Failed to fetch deals: {mt5.last_error()}")
        return

    print(f"[HISTORY] Found {len(deals)} deals. Processing...")
    
    batch_size = 50
    batch = []
    
    total_sent = 0
    history_url = f"{BASE_URL}/api/webhook/history-batch"

    for d in deals:
        # Filter valid types
        if d.type not in [0, 1, 2]: # Buy, Sell, Balance
            continue
            
        # Parse Master from Comment if possible
        # Logic: If comment contains "CPY:", it's copied. 
        # But here we just send the raw comment, and let Backend parse it?
        # Backend map logic: "CPY:" -> masterId="IMPORTED" -> then how do we know WHICH master?
        # Actually, route.ts just checks "starts with CPY". 
        # To be robust, we should send the raw comment.
        
        # Normalize Symbol for Balance Ops
        sym = d.symbol if d.symbol else "BALANCE"
        if d.type == 2: sym = "BALANCE"

        record = {
            "ticket": d.ticket,
            "order": d.order,
            "time": int(d.time),
            "type": d.type,
            "entry": d.entry,
            "symbol": sym,
            "volume": float(d.volume),
            "price": float(d.price),
            "profit": float(d.profit),
            "swap": float(d.swap),
            "commission": float(d.commission),
            "comment": d.comment if d.comment else ""
        }
        
        batch.append(record)
        
        if len(batch) >= batch_size:
            try:
                # Send Batch
                r = requests.post(history_url, json={"userId": USER_ID, "history": batch}, headers={"x-bridge-secret": API_SECRET}, timeout=5)
                if r.status_code == 200:
                    total_sent += len(batch)
                    print(f"   [SYNC] Sent batch {total_sent}/{len(deals)}")
                else:
                    print(f"   [WARN] Batch failed: {r.status_code} {r.text}")
            except Exception as e:
                 print(f"   [WARN] Batch Network Error: {e}")
            
            batch = [] # Reset
            
    # Final Batch
    if batch:
        try:
             requests.post(history_url, json={"userId": USER_ID, "history": batch}, headers={"x-bridge-secret": API_SECRET}, timeout=5)
             print(f"   [SYNC] Final batch sent. Total: {total_sent + len(batch)}")
        except Exception as e:
             print(f"   [WARN] Final Batch Error: {e}")

if __name__ == "__main__":
    print("Hydra Master Bridge v1.2 (OTP Support)")
    
    # 🛡️ HISTORY SYNC (On Startup)
    # 🛡️ HISTORY SYNC (On Startup)
    if args.sync_history > 0:
        # Retry Loop for Init
        init_ok = False
        for i in range(10):
            if mt5.initialize():
                init_ok = True
                break
            else:
                print(f"[RETRY] Init failed (IPC Timeout?): {mt5.last_error()}. Retrying {i+1}/10...")
                time.sleep(2)
        
        if not init_ok:
            print(f"[ERROR] Failed to init MT5 for history sync after retries.")
            quit()
        
        # Ensure we have credentials if not already logged in? 
        # But usually we assume terminal is logged in OR we fetch them. 
        # fetch_credentials() is defined but not called in main unless inside follow_signals loop?
        # Actually follow_signals calls fetch_credentials -> login.
        # We need to login if we want to sync history accurately? 
        # mt5.history_deals_get works on CURRENTLY LOGGED IN account in terminal.
        # So we must ensure login.
        
        login_id, pwd, srv = fetch_credentials()
        if login_id:
             mt5.login(login=login_id, password=pwd, server=srv)
        
        sync_history_to_db(args.sync_history)
        
        if args.exit_after_sync:
            print("[EXIT] History Sync Complete. Exiting.")
            mt5.shutdown()
            quit()

    # 🛡️ ZOMBIE CHECK (Mutex for Broadcaster Process)
    is_master, r_conn = acquire_broadcast_lock(USER_ID)
    if not is_master:
        print(f"[STOP] Another Broadcaster is already active for {USER_ID}. Exiting.")
        quit()
        
    # Share the redis connection if created
    if r_conn and not r_client:
        r_client = r_conn
        
    # 🧹 STARTUP CLEANUP (Critical Race Fix)
    # Delete Stale Flags IMMEDIATELY before MT5 Init (which takes seconds).
    # This prevents Executor from seeing "Ready" from previous session.
    if r_client:
        r_client.delete(f"state:master:{USER_ID}:tickets")
        r_client.delete(f"state:master:{USER_ID}:ready")
        print(f"[BOOT] Cleared Stale Redis State/Flags for {USER_ID}")
        
    # 🛡️ ROBUST MT5 INIT (Safe Guarded)
    # Use the defined function which checks Global Lock before connecting!
    initialize_mt5() # Prints info and connects safely
        
    follow_signals()

