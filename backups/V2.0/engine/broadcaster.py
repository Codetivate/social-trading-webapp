
import MetaTrader5 as mt5
import time
import requests
import json
import os
from dotenv import load_dotenv
load_dotenv() # 📥 Load .env file
from datetime import datetime, timedelta

import argparse

# 🔧 ARGUMENT PARSING
parser = argparse.ArgumentParser(description='Hydra Broadcaster')
parser.add_argument('--user-id', type=str, required=True, help='Master User ID')
parser.add_argument('--mt5-path', type=str, default=os.getenv("MT5_PATH"), help='Path to MT5 Terminal')
parser.add_argument('--secret', type=str, default=os.getenv("API_SECRET"), help='Bridge Secret')

args = parser.parse_args()

# 🛡️ ZOMBIE PROTECTION: Singleton Logic
def acquire_broadcast_lock(user_id):
    # Reuse valid Redis connection if possible, or new one
    try:
        r = redis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379"), decode_responses=True)
        key = f"lock:broadcaster:{user_id}"
        # Set lock with 10s expiry (Heartbeat needed)
        # But for simplicity, we just check existence and set long expiry, assuming process death clears it?
        # No, process death doesn't clear Redis. We need a heartbeat or short TTL.
        # Let's use a 5s TTL and refresh it in the loop.
        if r.set(key, os.getpid(), nx=True, ex=5):
            return True, r
        else:
            # Check if alive (optional)
            return False, r
    except:
        return True, None # Fail open if Redis dead? No, we need Redis.


# ⚙️ CONFIGURATION
BASE_URL = os.getenv("AUTH_URL", "http://localhost:3000") # Default to localhost if not set
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
        print("[WARN] Using fallback/local credentials...")
        target_login = 206872145
        password = "Nes#633689"
        server = "Exness-MT5Trial7"

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
            if owner and owner.decode() != USER_ID:
                print(f"[WAIT] Terminal in use by {owner.decode()}. Pausing Init...")
                time.sleep(1.0)
            else:
                break

    # 3. ATTACH MODE: Try to initialize WITHOUT credentials first
    # This allows connecting to an already open terminal (Manual Login / OTP)
    if not mt5.initialize(**init_args):
        print("[ERROR] initialize() failed, error code =", mt5.last_error())
        quit()

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
    else:
        print(f"[ERROR] Auto-Login Failed: {mt5.last_error()}")
        print(f"👉 TIP: If your broker requires OTP, please Login MANUALLY in the MT5 Terminal and check 'Save Password'.")
        # specific for OTP/2FA
        print(f"   The script will then attach to your manual session on next run.")
        quit()


def follow_signals():
    print(f"[START] Broadcaster Started. Watching Trades for Master {MASTER_ID}...")
    
    # 🧹 ZOMBIE CLEANUP: Clear any stale state from previous (crashed) sessions
    # This prevents Followers from seeing "Ghost" trades if we restart with 0 positions.
    if r_client:
        r_client.delete(f"state:master:{MASTER_ID}:tickets")
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
                # import hashlib # Ensuring import for safety (top level preferred)
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
            # We use a "Sandwich" check to detect if Executor switched account MID-READ.
            start_info = mt5.account_info()
            
            # Initialize target_login safely
            target_login = None
            if master_creds:
                 target_login = master_creds[0]
                 if not start_info or str(start_info.login) != str(target_login):
                     # 🛑 STOP! Check if Executor is active before fighting it.
                     # Re-Check Lock (Race Condition prevention)
                     if r_client:
                         import hashlib # Moved here or ensure top level
                         path_hash = hashlib.md5(lock_seed.encode()).hexdigest()
                         lock_key = f"lock:terminal:{path_hash}"
                         current_lock = r_client.get(lock_key)
                         if current_lock and current_lock != USER_ID:
                              # print(f"[INFO] Account switched by HFT ({current_lock}). Yielding...")
                              time.sleep(1) # Increased HFT timeout
                              continue # Yield to HFT
                     
                     print(f"[WARN] Account Drift (Pre-Check)! Active: {start_info.login if start_info else 'None'}, Target: {target_login}. Re-asserting Login...")
                     mt5.login(login=target_login, password=master_creds[1], server=master_creds[2])
                     time.sleep(0.5)
                     continue 

            # 1. Get Current Open Positions
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
                        "ticket": str(pos.ticket), # ✅ String Ticket
                        "symbol": pos.symbol,
                        "type": "BUY" if pos.type == 0 else "SELL", 
                        "volume": pos.volume,
                        "price": pos.price_open,
                        "sl": pos.sl,
                        "tp": pos.tp,
                        "action": "OPEN"
                    }
                    send_signal(payload)
                    
                else:
                    # --- B. CHECK FOR MODIFICATIONS (SL/TP) ---
                    prev_data = known_positions[pos.ticket]
                    if prev_data["sl"] != pos.sl or prev_data["tp"] != pos.tp:
                        print(f"[SIGNAL] MODIFY: {pos.ticket} SL: {pos.sl} TP: {pos.tp}")
                        
                        # ⚡ STATE FIRST
                        known_positions[pos.ticket]["sl"] = pos.sl
                        known_positions[pos.ticket]["tp"] = pos.tp
                        
                        payload = {
                            "masterId": MASTER_ID,
                            "ticket": str(pos.ticket), # ✅ String Ticket
                            "symbol": pos.symbol,
                            "action": "MODIFY",
                            "sl": pos.sl,
                            "tp": pos.tp
                        }
                        send_signal(payload)

            # --- C. CHECK FOR CLOSED POSITIONS ---
            # Any ticket in known_positions that is NOT in current_tickets is considered closed
            closed_tickets = [t for t in known_positions if t not in current_tickets]
            
            for ticket in closed_tickets:
                print(f"[SIGNAL] CLOSE DETECTED: {ticket}. Fetching PnL...")
                
                # ⚡ STATE FIRST: Remove immediately so Ghost Buster knows it's gone
                # Capture data for payload before deleting
                c_type = known_positions[ticket].get("type", "UNKNOWN")
                c_symbol = known_positions[ticket].get("symbol", "Unknown")
                c_price = known_positions[ticket].get("price", 0.0)
                del known_positions[ticket]

                # ⚡ FAST SYNC: Immediately log closure to Redis History
                # This enables the "Ghost Buster" to verify the close effortlessly (Fast Path).
                if r_client:
                    try:
                        r_client.sadd(f"history:master:{MASTER_ID}:closed", str(ticket))
                        r_client.expire(f"history:master:{MASTER_ID}:closed", 172800) # 48h Rolling Window
                    except Exception as e:
                        print(f"   [WARN] Failed to write Redis History: {e}")

                # 🔍 FETCH DEAL INFO (PnL, Price, Swap)
                # Look back 5 minutes to find the closing deal
                history = mt5.history_deals_get(datetime.now() - timedelta(minutes=5), datetime.now())
                deal_info = None
                
                if history:
                    for deal in history:
                        # Find the OUT entry for this Position ID
                        if deal.position_id == ticket and deal.entry == mt5.DEAL_ENTRY_OUT:
                            deal_info = deal
                            break
                
                payload = {
                    "masterId": MASTER_ID,
                    "ticket": str(ticket),
                    "action": "CLOSE",
                    "type": c_type,
                    "symbol": c_symbol,
                    "openPrice": c_price
                }

                if deal_info:
                    print(f"   ✅ Deal Found! Profit: {deal_info.profit}")
                    payload.update({
                        "price": deal_info.price, # Close Price
                        "profit": deal_info.profit,
                        "swap": deal_info.swap,
                        "commission": deal_info.commission,
                        "volume": deal_info.volume,
                        "closeTime": int(deal_info.time)
                    })
                else:
                    print(f"   ⚠️ Deal History not found for {ticket}. Sending CLOSE without PnL.")

                # ⚡ FAST SYNC: Immediately log closure to Redis History
                # This enables the "Ghost Buster" to verify the close effortlessly (Fast Path).
                # MOVED TO TOP OF BLOCK to prevent race conditions during PnL fetch.


                send_signal(payload)
                
            # --- D. PERIODIC BALANCE SYNC (Every 1s) ---
            if int(time.time() * 10) % 10 == 0: # Every ~1 second
                account_info = mt5.account_info()
                if account_info:
                    sync_balance(account_info)

            # 4. 🧠 STATE SYNC (Anti-Ghosting) & HISTORY VERIFICATION
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
                state_payload = json.dumps({
                    "tickets": list(known_positions.keys()), # Legacy support
                    "positions": known_positions,            # Full State for Catch-Up
                    "timestamp": time.time(),
                    "count": len(known_positions)
                }, default=str) # Handle BigInts
                r_client.set(f"state:master:{MASTER_ID}:tickets", state_payload, ex=60)

                # B. History Sync (Confirm Closes)
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
                print(f"   [WARN] State/History Sync Failed: {e}")

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
            
            time.sleep(poll_interval)
            
        except KeyboardInterrupt:
            print("[STOP] Stopping Broadcaster...")
            mt5.shutdown()
            break
        except Exception as e:
            print(f"[ERROR] Broadcaster Loop Error: {e}")
            time.sleep(1)

def sync_balance(account_info):
    try:
        payload = {
            "balance": account_info.balance,
            "equity": account_info.equity,
            "margin": account_info.margin,
            "freeMargin": account_info.margin_free,
            "margin": account_info.margin,
            "freeMargin": account_info.margin_free,
            "leverage": account_info.leverage,
            "login": account_info.login
        }
        # We reuse the broker API endpoint but with a PATCH/PUT method if possible, 
        # or a specific /sync endpoint. Let's use a new endpoint for clarity or append to broker update.
        # For now, let's assume we post to /api/user/broker/sync or similar.
        # Actually, let's use the existing BROKER_API_URL but sending updates?
        # The GET is for fetching creds. POST is for connecting. 
        # Let's use PUT on BROKER_API_URL to update stats.
        
        r = requests.put(BROKER_API_URL, json=payload, headers={
            "x-bridge-secret": API_SECRET, 
            "x-user-id": USER_ID
        }, timeout=1)
    except Exception:
        pass # Silent fail for stats sync to avoid spamming console

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

def send_signal(payload):
    try:
        # 1. 🚀 FIRE-AND-FORGET: Push to Realtime Subscribers (WebSockets)
        # Latency: < 1ms
        json_payload = json.dumps(payload)
        r_client.publish(f"signals:master:{MASTER_ID}", json_payload) # 🎯 Precise routing
        
        # 2. 📝 AUDIT LOG: Push to Redis Stream for persistence/replay
        r_client.xadd('stream:signals', { 'payload': json_payload, 'timestamp': str(time.time()) })
        
        # 3. 🕸️ SYNC TO DATABASE (Critical for History/UI)
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

if __name__ == "__main__":
    print("Hydra Master Bridge v1.2 (OTP Support)")
    # Passive attach only to load DLL. Login is handled in main loop (guarded).
    mt5.initialize() 
    # 🛡️ ZOMBIE CHECK
    is_master, r_conn = acquire_broadcast_lock(USER_ID)
    if not is_master:
        print(f"[STOP] Another Broadcaster is already active for {USER_ID}. Exiting.")
        quit()
        
    # Share the redis connection if created
    if r_conn and not r_client:
        r_client = r_conn
        
    mt5.initialize() 
    follow_signals()

