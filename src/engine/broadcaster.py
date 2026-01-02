
import MetaTrader5 as mt5
import time
import requests
import json
import os
from dotenv import load_dotenv
load_dotenv() # 📥 Load .env file
from datetime import datetime

# ⚙️ CONFIGURATION (Moved to .env in Prod)
# ⚙️ CONFIGURATION
BASE_URL = os.getenv("AUTH_URL", "http://192.168.2.33.nip.io:3000") # User specified URL
WEBHOOK_URL = f"{BASE_URL}/api/webhook/signal" 
BROKER_API_URL = f"{BASE_URL}/api/user/broker"

# USER IDENTITY (Ideally passed as arg or env)
# For the demo, we assume this script runs for a specific User ID (UUID)
# You can find your User ID in the Database or Browser Console (Network tab -> session)
USER_ID = os.getenv("USER_ID", "0c13bf41-fad5-4884-8be5-c6bb2532cca5") # Correct User ID from DB
MASTER_ID = USER_ID # 🔄 SELF-MASTER: You are broadcasting your own trades as Master
API_SECRET = os.getenv("API_SECRET", "AlphaBravoCharlieDeltaEchoFoxtro") # Matches .env BROKER_SECRET

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
    mt5_path = os.getenv("MT5_PATH", "")
    init_args = {}
    if mt5_path and os.path.exists(mt5_path):
        init_args["path"] = mt5_path
        print(f"[INFO] Target Terminal: {mt5_path}")

    # 3. ATTACH MODE: Try to initialize WITHOUT credentials first
    # This allows connecting to an already open terminal (Manual Login / OTP)
    if not mt5.initialize(**init_args):
        print("[ERROR] initialize() failed, error code =", mt5.last_error())
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
    
    # Store position snapshots: { ticket: { sl, tp, volume, price } }
    known_positions = {}
    
    # Initial sync
    initial_positions = mt5.positions_get()
    if initial_positions:
        for p in initial_positions:
            known_positions[p.ticket] = {
                "sl": p.sl,
                "tp": p.tp,
                "price": p.price_open,
                "tp": p.tp,
                "price": p.price_open,
                "volume": p.volume,
                "symbol": p.symbol # Store symbol for Close events
            }

    while True:
        try:
            # 1. Get Current Open Positions
            current_positions_tuple = mt5.positions_get()
            
            if current_positions_tuple is None:
                # Could be connection loss or actual no positions
                # We need to distinguish, but for simplicity we assume empty list if None but check error
                if mt5.last_error()[0] != 1: # 1 = Success
                     print("[WARN] MT5 Error:", mt5.last_error())
                current_positions_tuple = []

            # Convert struct tuple to list for easier handling
            current_positions = list(current_positions_tuple)
            current_tickets = {p.ticket for p in current_positions}
            
            # --- A. CHECK FOR NEW POSITIONS ---
            for pos in current_positions:
                # 🛡️ SAFETY: Ignore trades opened by the Executor (Magic 234000) to avoid Infinite Loop
                if pos.magic == 234000:
                    continue

                if pos.ticket not in known_positions:
                    print(f"[SIGNAL] OPEN: {pos.symbol} {pos.ticket} (Magic: {pos.magic})")
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
                    known_positions[pos.ticket] = {
                        "sl": pos.sl, 
                        "tp": pos.tp, 
                        "price": pos.price_open, 
                        "volume": pos.volume,
                        "symbol": pos.symbol
                    }
                else:
                    # --- B. CHECK FOR MODIFICATIONS (SL/TP) ---
                    prev_data = known_positions[pos.ticket]
                    if prev_data["sl"] != pos.sl or prev_data["tp"] != pos.tp:
                        print(f"[SIGNAL] MODIFY: {pos.ticket} SL: {pos.sl} TP: {pos.tp}")
                        payload = {
                            "masterId": MASTER_ID,
                            "ticket": str(pos.ticket), # ✅ String Ticket
                            "symbol": pos.symbol,
                            "action": "MODIFY",
                            "sl": pos.sl,
                            "tp": pos.tp
                        }
                        send_signal(payload)
                        known_positions[pos.ticket]["sl"] = pos.sl
                        known_positions[pos.ticket]["tp"] = pos.tp

            # --- C. CHECK FOR CLOSED POSITIONS ---
            # Any ticket in known_positions that is NOT in current_tickets is considered closed
            closed_tickets = [t for t in known_positions if t not in current_tickets]
            
            for ticket in closed_tickets:
                print(f"[SIGNAL] CLOSE: {ticket}")
                # Ideally, get close price from history_deals
                # For latency, we just signal CLOSE immediately
                payload = {
                    "masterId": MASTER_ID,
                    "ticket": str(ticket), # ✅ String Ticket
                    "action": "CLOSE",
                    "symbol": known_positions[ticket].get("symbol", "Unknown")
                }
                send_signal(payload)
                del known_positions[ticket]

            # --- D. PERIODIC BALANCE SYNC (Every 1s) ---
            if int(time.time() * 10) % 10 == 0: # Every ~1 second
                account_info = mt5.account_info()
                if account_info:
                    sync_balance(account_info)

            time.sleep(0.05) # 50ms polling
            
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
r_client = redis.from_url(REDIS_URL)

def send_signal(payload):
    try:
        # 1. 🚀 FIRE-AND-FORGET: Push to Realtime Subscribers (WebSockets)
        # Latency: < 1ms
        json_payload = json.dumps(payload)
        r_client.publish('channel:all_followers', json_payload)
        
        # 2. 📝 AUDIT LOG: Push to Redis Stream for persistence/replay
        r_client.xadd('stream:signals', { 'payload': json_payload, 'timestamp': str(time.time()) })
        
        # 3. 🕸️ LEGACY SYNC: Keep HTTP for DB sync (Optional, can be removed to be purely Event-Driven)
        # Ideally, a separate Worker should read 'stream:signals' and write to DB async.
        # For this hybrid phase, we keep it to ensure DB stays updated without running a new worker.
        try:
            requests.post(WEBHOOK_URL, json=payload, headers={"x-bridge-secret": API_SECRET}, timeout=1)
        except Exception:
             print("   [WARN] Legacy HTTP sync failed (Redis delivery still active)")

        print(f"   [🚀] Signal Pushed to Redis (Ticket: {payload['ticket']})")

    except Exception as e:
        print(f"   [ERROR] Redis/Network Error: {e}")
        # Fallback to HTTP only if Redis fails
        try:
             requests.post(WEBHOOK_URL, json=payload, headers={"x-bridge-secret": API_SECRET}, timeout=2)
             print(f"   [fallback] Sent via HTTP")
        except:
             pass

if __name__ == "__main__":
    print("Hydra Master Bridge v2.1 (OTP Support)")
    initialize_mt5()
    follow_signals()

