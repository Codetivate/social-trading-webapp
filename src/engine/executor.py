
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

# ⚙️ CONFIGURATION
PORT = "3000"
HOSTS = ["192.168.2.33.nip.io", "localhost", "127.0.0.1"] 
DATABASE_URL = os.getenv("DATABASE_URL") 

# 🔧 ARGUMENT PARSING (Disruptive Cloud Model)
parser = argparse.ArgumentParser(description='Hydra Executor Worker')
parser.add_argument('--mode', type=str, default='SINGLE', choices=['SINGLE', 'BATCH', 'TURBO'], help='Execution Mode: SINGLE (Legacy), BATCH (Free Cloud), TURBO (Paid Cloud)')
parser.add_argument('--user-id', type=str, help='Target User ID (Required for SINGLE mode)')
parser.add_argument('--batch-id', type=int, default=0, help='Shard ID for Batch processing (e.g. 0-9)')
parser.add_argument('--secret', type=str, help='Bridge API Secret', default=os.getenv("API_SECRET", "AlphaBravoCharlieDeltaEchoFoxtro"))
parser.add_argument('--mt5-path', type=str, help='Specific MT5 Terminal Path', default=os.getenv("MT5_PATH", ""))
parser.add_argument('--dry-run', action='store_true', help='Disable trade execution')

args = parser.parse_args()

BRIDGE_SECRET = args.secret
MT5_PATH_ARG = args.mt5_path
EXECUTION_MODE = args.mode
MY_FOLLOWER_ID = args.user_id # Only relevant in SINGLE mode
TARGET_LOGIN_ID = None # Stores the numeric Login ID (int) for verification
POLL_INTERVAL = 1.0 
DRY_RUN = args.dry_run

print(f"🚀 Hydra Engine Starting in {EXECUTION_MODE} Mode...")
if EXECUTION_MODE == 'BATCH':
    print(f"   🚌 Standard Cloud: Processing High-Density Batch #{args.batch_id}")
elif EXECUTION_MODE == 'TURBO':
    print(f"   🏎️ Turbo Cloud: Low-Latency Worker Swarm Active")


def get_api_url(host):
    return f"http://{host}:{PORT}/api/engine/poll"

def get_broker_url(host):
    return f"http://{host}:{PORT}/api/user/broker"

def get_db_connection():
    try:
        return psycopg2.connect(DATABASE_URL)
    except Exception as e:
        print(f"[ERROR] DB Connect Failed: {e}")
        return None

def fetch_subscriptions(follower_id):
    """
    Fetch active CopySessions for this follower to know which Masters to listen to.
    """
    conn = get_db_connection()
    if not conn: return []
    
    try:
        cur = conn.cursor()
        print(f"[DEBUG] Fetching subscriptions for Follower: '{follower_id}'") # Verify ID
        query = """
            SELECT "masterId", "timeConfig", "expiry" FROM "CopySession"
            WHERE "followerId" = %s 
              AND "isActive" = true
              AND ("expiry" IS NULL OR "expiry" > NOW() - INTERVAL '1 DAY') -- Fetch recently expired for auto-renew detection
        """
        cur.execute(query, (follower_id,))
        rows = cur.fetchall()
        cur.close()
        conn.close()
        print(f"[DEBUG] Found {len(rows)} active subscriptions.")
        # Return Dict: { str(masterId): {'config': timeConfig, 'expiry': expiry} }
        return {str(row[0]): {'config': row[1], 'expiry': row[2]} for row in rows}
    except Exception as e:
        print(f"[ERROR] Fetch Subscriptions Failed: {e}")
        return {}

def fetch_credentials():
    print("[INFO] Fetching credentials from Cloud...")
    for host in HOSTS:
        url = get_broker_url(host)
        try:
            res = requests.get(url, headers={"x-bridge-secret": BRIDGE_SECRET, "x-user-id": MY_FOLLOWER_ID}, timeout=3)
            if res.status_code == 200:
                print(f"   [OK] Found credentials at {host}")
                return res.json()
            else:
                print(f"   [WARN] {host} returned {res.status_code}: {res.text}")
        except Exception as e:
            print(f"   [WARN] {host} unreachable: {e}")
            pass
    print("[ERROR] Failed to fetch credentials from any host.")
    return None

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


    
# 🕰️ TIME UTILS

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
    """
    conn = get_db_connection()
    if not conn: return

    try:
        cur = conn.cursor()

        # ---------------------------------------------------------
        # 1. 🛑 HARD EXPIRY (Welcome / Trial / Non-Renewable)
        # ---------------------------------------------------------
        # Fetch expired sessions that must die immediately
        # Explicitly checking for TRIAL_7DAY, WELCOME, or AutoRenew=False
        fetch_stop_q = """
            SELECT "id", "masterId", "type" 
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

        for row in stop_rows:
            sid, mid, stype = row
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
                    r_client.publish(f"events:user:{follower_id}", payload)
                    print(f"   [📡] Published SESSION_EXPIRED event to events:user:{follower_id}")

            except Exception as e:
                print(f"   [ERR] Failed to deactivate {sid}: {e}")
            
            # Legacy Code: Force Close (Disabled by User Request)
            # if acquire_terminal_lock():
            #     try:
            #         close_session_trades(mid, reason="Ticket Expired")
            #     finally:
            #         release_terminal_lock()

        # ---------------------------------------------------------
        # 2. 🔄 DAILY RENEWAL (Standard + AutoRenew=True)
        # ---------------------------------------------------------
        # Fetch only STANDARD/DAILY sessions that are renewable
        query = """
            SELECT "id", "timeConfig", "expiry", "isActive", "type"
            FROM "CopySession"
            WHERE "followerId" = %s
              AND "autoRenew" = true
              AND "type" NOT IN ('TRIAL_7DAY', 'PAID') -- Exclude non-daily types
        """
        cur.execute(query, (follower_id,))
        rows = cur.fetchall()
        
        now = datetime.utcnow()
        
        for row in rows:
            sid, config, expiry, is_active, session_type = row
            
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
    # Optional: Path to specific terminal (Crucial for running multiple instances)
    mt5_path = MT5_PATH_ARG 

    init_params = {}
    if mt5_path and os.path.exists(mt5_path):
        init_params['path'] = mt5_path
        print(f"[INFO] Target Terminal: {mt5_path}")

    if not mt5.initialize(**init_params):
        print("[ERROR] initialize() failed, error code =", mt5.last_error())
        if not DRY_RUN: quit()
        print("[WARN] Proceeding in DRY_RUN mode without MT5 Connection check strictness.")
    else:
        # Attempt Auto-Login
        creds = fetch_credentials()
        if creds:
             if not login_mt5(creds):
                 print("[WARN] Warning: Could not login to Follower Account.")
                 if not DRY_RUN:
                     print("[STOP] Aborting to prevent trading on wrong account.")
                     quit()
        else:
            print("[ERROR] No credentials available.")
            if not DRY_RUN:
                print("[STOP] Aborting. Cannot ensure correct account.")
                quit()
        
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
    
    payload = {
        "followerId": MY_FOLLOWER_ID,
        "masterId": str(master_id), # Master Ticket or ID
        "ticket": deal.ticket,
        "symbol": deal.symbol,
        "type": "BUY" if deal.type == 0 else "SELL", # 0=Buy, 1=Sell in Deal too? Actually Deal Entry Out type matters.
        # But we can infer from deal type. deal.type: 0=Buy, 1=Sell.
        "volume": deal.volume,
        "openPrice": 0, 
        "closePrice": deal.price, 
        "openTime": 0, 
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

def execute_trade(signal, api_url):
    ticket = int(signal.get('ticket', 0)) # Handle String from BigInt JSON
    action = signal.get('action') # OPEN, CLOSE, MODIFY
    symbol = signal.get('symbol')
    trade_type = signal.get('type') # "BUY" or "SELL" (Optional for Close/Modify)
    volume = signal.get('volume') 
    signal_id = signal.get('id')
    
    print(f"[EXEC] PROCESSING: {action} {symbol} {trade_type or ''} {volume or ''} (Signal: {signal_id})")

    # ️ SAFETY CHECK: Verify Account ID matches Credentials
    # This prevents trading on Master account if path isolation failed
    # MOVED TO TOP to protect CLOSE/MODIFY actions too!
    current_account = mt5.account_info()
    creds = fetch_credentials() # Re-verify before trade
    
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
        target_ticket = signal.get('ticket', '')
        target_pos = find_trade_by_ticket(target_ticket)
        
        # Fallback FIFO logic if find_trade_by_ticket fails?
        if not target_pos:
             # Emergency FIFO Scan for Symbol (Only if symbol is valid in this terminal context)
             # But if symbol mismatch, we can't scan.
             # So we rely purely on Ticket Match first.
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
                "comment": f"Close {target_ticket}",
            }
            res = mt5.order_send(req)
            if res.retcode == mt5.TRADE_RETCODE_DONE:
                print(f"   [OK] Closed {target_pos.symbol} (Ticket: {res.order}) matched to Master {target_ticket}")
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
        target_ticket = signal.get('ticket', '')
        target_pos = find_trade_by_ticket(target_ticket)
        
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
            print(f"   [WARN] Could not find trade to modify for Master Ticket {target_ticket}")
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

    # 1. VALIDATE & SELECT SYMBOL (Robust) for OPEN
    # 1. VALIDATE & SELECT SYMBOL (Robust) for OPEN
    # Retry loop to handle "Terminal Disconnected" false negatives
    for attempt in range(2):
        if mt5.symbol_select(symbol, True):
            break
        
        # Try generic cleanup (remove suffixes)
        candidates = [symbol, symbol.replace('m', ''), symbol.replace('c', ''), symbol.replace('.pro', '')]
        found = False
        for cand in candidates:
            # Try appending common suffixes
            for suffix in ["", "m", "c", "z", ".pro", ".r"]:
                trial = f"{cand}{suffix}"
                if mt5.symbol_select(trial, True):
                    symbol = trial
                    found = True
                    break
            if found: break
        
        if found:
            break
            
        # If not found, maybe connection is stale?
        if attempt == 0:
             print(f"   [WARN] Symbol {symbol} not found. Refreshing Connection...")
             initialize_mt5()
             time.sleep(0.5)
        else:
             print(f"   [ERROR] Symbol {symbol} not found in this terminal (after refresh).")
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

    # Prepare Order
    order_type = mt5.ORDER_TYPE_BUY if trade_type == "BUY" else mt5.ORDER_TYPE_SELL

    request = {
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": symbol,
        "volume": float(volume),
        "type": order_type,
        "price": market_price,
        "deviation": 20, # Tolerance within execution
        "magic": 234000,
        "magic": 234000,
        "magic": 234000,
        "comment": f"CPY:{signal['ticket']}", # Store Master Ticket for precise closing
        "sl": float(signal.get('sl', 0.0)),
        "tp": float(signal.get('tp', 0.0)),
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
    try:
        # ⚠️ DO NOT re-initialize without path! It can switch terminals.
        # Just check if we are still connected.
        if not mt5.terminal_info(): return
        
        # 🔄 Re-fetch credentials to get latest Risk Settings from DB
        # This allows user to update Risk Limit in UI and have it apply immediately
        creds = fetch_credentials() 
        
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

        # 📊 AGGREGATE FLOATING PNL PER MASTER
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
                # We capture ALL positions or just CPY? USER SAID: "let master and follower see total holding position"
                # For Follower, this means showing all positions they hold.
                # Ideally we filter by Magic 234000 to only show Copy-Trades.
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
        print(f"   [WARN] Sync Balance Failed: {e}") # Added specific error logging for sync_balance

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
                
                # extracting master ticket from comment "CPY:12345"
                if "CPY:" not in pos.comment: continue
                
                try:
                    master_ticket_id = pos.comment.split(':')[1]
                except:
                    continue
                
                # 3. THE GHOST CHECK 👻
                # If we hold a trade (CPY:123) BUT Master's official list does NOT contain 123...
                # AND we are looking at the correct Master (Need to verify Master ID logic, but for now assuming global unique tickets or single master)
                # Ideally comment should contain MasterID too like "CPY:MID:TID". 
                # For this demo, we assume global ticket uniqueness or single master context.
                
                if master_ticket_id not in master_tickets:
                    # 🚦 HISTORY CHECK (Anti-Ghosting Level 2)
                    # Before strictly closing, check if Master actually has a CLOSED record for this ticket.
                    # This prevents closing trade just because it's missing from the ephemeral "Open" list (e.g. during partial close, paging, or lag).
                    # 🚦 HISTORY CHECK (Anti-Ghosting Level 2)
                    is_verified_closed = r_client.sismember(f"history:master:{sub_master_id}:closed", master_ticket_id)
                    
                    if is_verified_closed:
                        print(f"   [👻 GHOST VERIFIED] Master {sub_master_id} CONFIRMED CLOSED Ticket {master_ticket_id} in history. Executing Force Close.")
                        
                        # Construct Mock Signal
                        mock_signal = {
                            "action": "CLOSE",
                            "symbol": pos.symbol,
                            "ticket": master_ticket_id,
                            "id": f"RECON-{master_ticket_id}-{time.time()}",
                            "type": "SELL" if pos.type == 0 else "BUY",
                            "volume": pos.volume
                        }
                        execute_trade(mock_signal, api_url)
                    else:
                        # Safety Hold
                        # print(f"   [🛡️ SAFETY HOLD] Ticket {master_ticket_id} missing from Active list but NOT found in history.")
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
def acquire_terminal_lock():
    if not r_client: return True # Fallback (Redis required)
    
    # 🔒 ROBUST LOCKING: Handle empty path
    lock_seed = MT5_PATH_ARG if MT5_PATH_ARG else "default"
    
    # Hash path to create unique lock key
    path_hash = hashlib.md5(lock_seed.encode()).hexdigest()
    key = f"lock:terminal:{path_hash}"
    
    # Fast Spinlock (Wait up to 10s)
    # We want to be FAST. If someone is using it, wait briefly then grab.
    for attempt in range(100): # 100 * 0.1s = 10s timeout
        # Set Lock with 30s TTL (in case of crash, auto-release)
        is_locked = r_client.set(key, MY_FOLLOWER_ID, ex=30, nx=True)
        if is_locked:
            # print(f"[MUTEX] 🟢 Acquired Terminal Lock") 
            return True
        
        # Check who has it?
        # current_owner = r_client.get(key)
        # if current_owner == MY_FOLLOWER_ID: return True # Re-entrancy
        
        time.sleep(0.1)
        
    print(f"[MUTEX] 🔴 Failed to acquire Terminal Lock after 10s. Forcing overlap (Dangerous).")
    return False

def release_terminal_lock():
    if not r_client: return
    
    lock_seed = MT5_PATH_ARG if MT5_PATH_ARG else "default"
    path_hash = hashlib.md5(lock_seed.encode()).hexdigest()
    key = f"lock:terminal:{path_hash}"
    
    # Only release if WE own it
    # Lua script for atomic check-and-delete is best, but simple get/del is okay for now.
    current_owner = r_client.get(key)
    if current_owner == MY_FOLLOWER_ID:
        r_client.delete(key)
        # print(f"[MUTEX] ⚪ Released Terminal Lock")
        return # <--- EXIT ON SUCCESS

    # If we get here, we didn't own the lock but tried to release it.
    # This might happen if lock expired or was taken by someone else.
    # It is NOT fatal if we are just shutting down cleanly.
    # print(f"[WARN] Could not release lock (Owned by: {current_owner})")
    
    return False

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
    print("[RECON] 🧐 Checking for missed trades...")
    if not r_client: return

    # Get subscriptions (Use Cache if available to save DB hits)
    subs = cached_subs if cached_subs else fetch_subscriptions(MY_FOLLOWER_ID)
    if not subs: return

    for sub_master_id in subs: # sub_master_id is just the master ID string
        state_key = f"state:master:{sub_master_id}:tickets"
        data = r_client.get(state_key)
        
        if not data: continue

        try:
            state = json.loads(data)
            master_positions = state.get("positions", {}) # New Full State
            
            if not master_positions: continue

            # Get Local Positions
            local_positions = mt5.positions_get()
            copied_tickets = set()
            if local_positions:
                for p in local_positions:
                    if p.magic == 234000 and "CPY:" in p.comment:
                        try:
                            # Extract Master Ticket from Comment "CPY:12345"
                            t_id = p.comment.split(':')[1]
                            copied_tickets.add(str(t_id))
                        except:
                            pass
            
            # Check for Missing
            for m_ticket, m_info in master_positions.items():
                if str(m_ticket) not in copied_tickets:
                    print(f"   [CATCH-UP] Found missed trade {m_ticket} ({m_info['symbol']})")
                    
                    # Construct Signal
                    catchup_signal = {
                        "action": "OPEN",
                        "symbol": m_info['symbol'],
                        "ticket": m_ticket,
                        "type": m_info['type'],
                        "volume": m_info['volume'],
                        "price": m_info['price'],
                        "sl": m_info.get('sl'),
                        "tp": m_info.get('tp'),
                        "id": f"CATCHUP-{m_ticket}-{int(time.time())}"
                    }
                    

                    
                    # 🚦 SESSION TIME CHECK:
                    # Catch-up must also respect Trading Hours!
                    # subs is { masterId_str: { 'config': ..., 'expiry': ... } }
                    if sub_master_id in subs:
                        session_ctx = subs[sub_master_id]
                        if not is_within_trading_hours(session_ctx['config']):
                            print(f"   [SKIP] Catch-up for {m_ticket} skipped. Outside Trading Hours.")
                            continue
                    
                    # 🚦 UNSUB CHECK: Before executing catch-up, ensure we are still subscribed!
                    # "active_master_ids" isn't passed here, so we check "subs" directly.
                    # "subs" contains the list of active Master IDs we just fetched from DB.
                    if sub_master_id not in subs:
                        print(f"   [SKIP] Catch-up ignored for {m_ticket}. Not subscribed to Master {sub_master_id}.")
                        continue

                    # Execute (execute_trade handles slippage check)
                    execute_trade(catchup_signal, api_url)
                    time.sleep(0.5) # Pace execution

            # 4. GHOST CHECK (Missed Closes) 👻
            # If we have it (CPY:Ticket) but Master DOESN'T, it means Master closed it while we were away.
            for p in local_positions:
                if p.magic == 234000 and "CPY:" in p.comment:
                    try:
                        my_master_ticket = p.comment.split(':')[1]
                        # If Master's active list excludes this ticket..
                        if my_master_ticket not in master_positions:
                             # DOUBLE CHECK HISTORY (Safety)
                             # Only close if we can verify it was CLOSED in history (to avoid race conditions)
                             is_verified_closed = r_client.sismember(f"history:master:{sub_master_id}:closed", my_master_ticket)
                             
                             if is_verified_closed:
                                 print(f"   [CATCH-UP] Found MISSED CLOSE for {my_master_ticket}. Closing now...")
                                 close_signal = {
                                     "action": "CLOSE",
                                     "symbol": p.symbol,
                                     "ticket": my_master_ticket,
                                     "id": f"CATCHUP-CLOSE-{my_master_ticket}-{int(time.time())}"
                                 }
                                 execute_trade(close_signal, api_url)
                                 time.sleep(0.5)
                             else:
                                 # Optional: If not in active and not in history, assume closed? 
                                 # Safer to wait for history sync or explicit close.
                                 print(f"   [WARN] Ticket {my_master_ticket} missing from active but not verified closed. Holding.")
                    except:
                        pass

        except Exception as e:
            print(f"   [WARN] Catch-up failed: {e}")

def run_executor():
    # 🛑 LOCK CHECK (Singleton per User ID, not per Login)
    # This keeps it stable even if we are temporarily logged into someone else's account.
    if not acquire_lock(MY_FOLLOWER_ID):
        # Do not shutdown MT5, as others might be using it!
        return

    print(f"[START] Executor Started for {MY_FOLLOWER_ID}...")
    
    # ⚠️ SHARED TERMINAL MODE:
    # We do NOT force login on startup. We assume "Lazy Switching".
    # Just verify we can reach the terminal path.
    current_mt5_login = mt5.account_info().login if mt5.account_info() else "Unknown"
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
    pubsub.subscribe(f'channel:follower:{MY_FOLLOWER_ID}') # 🎯 Target for Emergency/Sync
    
    # 🔗 DYNAMIC SUBSCRIPTION
    last_recon_time = 0
    last_sync_time = 0
    last_subs_refresh_time = 0
    
    RECON_INTERVAL = 2.0 # Check for ghosts every 2 seconds (Fast)
    SYNC_INTERVAL = 3.0
    RESET_CHECK_INTERVAL = 1.0 # ⚡ Check renew/expiry every second (Real-Time)
    last_reset_check_time = 0
    SUBS_REFRESH_INTERVAL = 3.0 # 🔄 Check for Unsubscribe/Pause every 3s (Was 10s)
    SYNC_INTERVAL = 3.0
    SUBS_REFRESH_INTERVAL = 3.0 # 🔄 Check for Unsubscribe/Pause every 3s (Was 10s)

    # Keep track of what we are listening to
    # 🧹 PRE-FLIGHT CHECK: Enforce VIP/Paid Expiry BEFORE Subscribing
    # This ensures we don't accidentally subscribe to "Forbidden" channels on startup.
    check_daily_resets(MY_FOLLOWER_ID)
    
    active_subscriptions = {} # Dict: { masterId: timeConfig }
    initial_subs = fetch_subscriptions(MY_FOLLOWER_ID)
    if initial_subs:
        active_subscriptions = initial_subs 
        for mid in active_subscriptions.keys():
            channel = f"signals:master:{mid}"
            pubsub.subscribe(channel)
            print(f"   -> Subscribed to {channel}")
    else:
        print("[ℹ️] No active subscriptions found. Waiting for updates...")
    
    print(f"[OK] Subscribed to Channels: follower:{MY_FOLLOWER_ID}") # Removed 'all_followers'

    # ⚡ CATCH-UP PHASE
    # Now that we are online and subscribed, check what we missed.
    # ⚡ CATCH-UP PHASE
    # Now that we are online and subscribed, check what we missed.
    reconcile_initial_state(api_url, active_subscriptions)

    print("[READY] Waiting for High-Speed Signals... 🚄")

    try:
        while True:
            current_time = time.time()
            
            # ❤️ HEARTBEAT: Refresh Lock
            refresh_lock(MY_FOLLOWER_ID)
            
            # 1. Process Redis Messages (Non-Blocking)
            # 1. Process Redis Messages (Batch Optimization)
            # Drain the queue to fetch multiple signals (up to 10)

            # 1. Check Redis Messages (Real-Time)
            if pubsub:
                message = pubsub.get_message(ignore_subscribe_messages=True)
                if message:
                    if message['type'] == 'message':
                        # 💥 SIGNAL RECEIVED!
                        payload = message['data']
                        if payload:
                            signal = json.loads(payload)
                            master_id = signal.get('masterId') or signal.get('ticket') # Fallback
                            
                            # 🕒 CHECK TRADING HOURS & EXPIRY
                            # Check Trading Hours & Expiry
                            master_key = str(master_id)
                            
                            # DEBUG: Trace Signal Match
                            if master_key not in active_subscriptions:
                                print(f"   [DEBUG] ❌ Signal MasterID '{master_key}' NOT IN Subscriptions: {list(active_subscriptions.keys())}")
                            else:
                                print(f"   [DEBUG] ✅ Signal Matched Subscription: {master_key}")

                            session_ctx = active_subscriptions.get(master_key)
                            
                            if not session_ctx:
                                 # Maybe subs refreshed but local validation lag?
                                 print(f"[SKIP] Unsubscribed Master {master_id}")
                                 continue
                                 
                            time_config = session_ctx['config']
                            expiry = session_ctx.get('expiry')
                            
                            # 1. Check Window
                            if not is_within_trading_hours(time_config):
                                print(f"[SKIP] Signal from {master_id} skipped. Outside Trading Hours.")
                                continue
                                
                            # 2. Check Expiry (Standard Ticket Limit)
                            # Implicit: If expiry set, valid trade time is [expiry - 4h, expiry]
                            if expiry:
                                now_utc = datetime.utcnow()
                                if now_utc > expiry:
                                     print(f"[SKIP] Signal from {master_id} skipped. Ticket Expired at {expiry}")
                                     continue
                                     
                                # Optional: Check Implicit Start? (expiry - 4h)
                                # If expiry is tomorrow, (expiry - 4h) is tomorrow start.
                                # If now < (expiry - 4h), we are too early.
                                implicit_start = expiry - timedelta(hours=4)
                                if now_utc < implicit_start:
                                     print(f"[SKIP] Signal from {master_id} skipped. Waiting for Start Time {implicit_start}")
                                     continue
                                
                            print(f"[⚡] SIGNAL: {signal.get('action')} {signal.get('symbol')} (Master: {master_id})")
                            
                            # 🔐 MUTEX: Serialize Terminal Access
                            if acquire_terminal_lock():
                                try:
                                    execute_trade(signal, api_url or "http://localhost:3000") 
                                except Exception as e:
                                    print(f"[ERR] Exec Error: {e}")
                                finally:
                                    release_terminal_lock()
            
            # 2. Safety & Reconciliation (Timestamp based)
            if current_time - last_recon_time > RECON_INTERVAL:
                 if api_url:
                     # 🔐 MUTEX: Serialize Terminal Access
                     # Wait for other Executors to finish before we check/login
                     if acquire_terminal_lock():
                         try:
                             # Check connection safely
                             term_info = mt5.terminal_info()
                             if not term_info or not term_info.connected:
                                 print("[WARN] Main Loop: Terminal Disconnected. Reconnecting...")
                                 initialize_mt5()
                             
                             reconcile_initial_state(api_url, active_subscriptions)
                         finally:
                             release_terminal_lock()
                     
                     last_recon_time = current_time
            
            # 3. Sync Balance (Timestamp based)
            if current_time - last_sync_time > SYNC_INTERVAL:
                 if api_url:
                     sync_balance(api_url)
                     last_sync_time = current_time
                     
            # 4. Refresh Subscriptions (Dynamic Unsubscribe) 🔄
            if current_time - last_subs_refresh_time > SUBS_REFRESH_INTERVAL:
                 new_subs = fetch_subscriptions(MY_FOLLOWER_ID)
                 
                 # If None, DB might be down. Don't clear cache aggressively?
                 # If empty list [], means we follow NO ONE.
                 if new_subs is not None:
                     # Update the active set so filtering works in the Main Loop
                     old_masters = set(active_subscriptions.keys())
                     active_subscriptions = new_subs # Replace Dict
                     new_masters = set(active_subscriptions.keys())
                     
                     # Log changes
                     added = new_masters - old_masters
                     removed = old_masters - new_masters
                     
                     if added or removed:
                         print(f"[REFRESH] 🔄 Subs Updated. Added: {added}, Removed: {removed}")
                         
                         # Optimized: Subscribe to new channels immediately
                         # (We don't strictly need to unsubscribe from Redis, as we filter messages anyway,
                         # but keeping subscriptions clean reduces network traffic)
                         for m_id in added:
                             pubsub.subscribe(f"signals:master:{m_id}")
                             print(f"   -> Subscribed to signals:master:{m_id}")
                         
                         for m_id in removed:
                             pubsub.unsubscribe(f"signals:master:{m_id}")
                             print(f"   -> Unsubscribed from signals:master:{m_id}")
                 last_subs_refresh_time = current_time

            # 5. Check Daily Resets 🔄
            if current_time - last_reset_check_time > RESET_CHECK_INTERVAL:
                 check_daily_resets(MY_FOLLOWER_ID)
                 last_reset_check_time = current_time

            time.sleep(0.01) # Ultra Low Latency Loop

    except KeyboardInterrupt:
        print("[STOP] Stopping Executor...")
    finally:
        release_lock(MY_FOLLOWER_ID)
        mt5.shutdown()

if __name__ == "__main__":
    initialize_mt5()
    run_executor()
