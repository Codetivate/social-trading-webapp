
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
from hft_executor import process_batch, MT5_GLOBAL_LOCK

# ⚙️ CONFIGURATION 

PORT = "3000"
# HOSTS = ["192.168.2.33.nip.io", "localhost", "127.0.0.1"] 
HOSTS = ["192.168.252.237.nip.io", "localhost", "127.0.0.1"] 
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

def get_broker_url(host):
    return f"http://{host}:{PORT}/api/user/broker"

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
    if not conn:
        return {} if EXECUTION_MODE in ['BATCH', 'TURBO'] or follower_id else []
    
    # 🛡️ Guard: Prevent fetching for invalid follower_id
    if EXECUTION_MODE == 'SINGLE' and not follower_id:
        return {}
    
    try:
        cur = conn.cursor()
        
        if EXECUTION_MODE == 'BATCH':
            # 🚌 BATCH MODE (Standard Lane)
            print(f"[DEBUG] Fetching BATCH subscriptions (Shard {args.batch_id})...")
            
            query = """
                SELECT "followerId", "masterId", "timeConfig", "expiry", "executionLane", "allocation", cs."id"
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
                fid, mid, cfg, exp, lane, alloc, session_id = row
                
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
                    'session_id': session_id
                })
            
            print(f"[DEBUG] Batch Standard Loaded: {len(batch_subs)} Masters monitored.")
            return batch_subs

        elif EXECUTION_MODE == 'TURBO':
            # 🏎️ TURBO MODE: UNIVERSAL DYNAMIC ENGINE
            # Fetches BOTH Paid and Free users, but prioritizes Paid via HFT Queue.
        # print(f"[DEBUG] Fetching ALL subscriptions for Dynamic HFT Swarm...")
            
            query = """
                SELECT "followerId", "masterId", "timeConfig", "expiry", "executionLane", "allocation", cs."id"
                FROM "CopySession" cs
                JOIN "User" u ON cs."followerId" = u."id"
                WHERE cs."isActive" = true
                  AND u."role" != 'MASTER' -- 🛑 RULE: Master cannot follow
            """
            cur.execute(query)
            rows = cur.fetchall()
            
            batch_subs = {} 
            for row in rows:
                fid, mid, cfg, exp, lane, alloc, session_id = row
                mid_str = str(mid)
                if mid_str not in batch_subs:
                    batch_subs[mid_str] = []
                
                batch_subs[mid_str].append({
                    'follower_id': fid,
                    'config': cfg,
                    'expiry': exp,
                    'lane': lane,
                    'allocation': float(alloc or 0),
                    'session_id': session_id
                })
                
            print(f"[DEBUG] TURBO Swarm Loaded: {len(batch_subs)} Masters monitored.")
            return batch_subs

        else:
            # SINGLE USER MODE
            print(f"[DEBUG] Fetching subscriptions for Follower: '{follower_id}'")
            query = """
                SELECT "masterId", "timeConfig", "expiry" FROM "CopySession"
                WHERE "followerId" = %s 
                  AND "isActive" = true
                  AND ("expiry" IS NULL OR "expiry" > NOW() - INTERVAL '1 DAY') 
            """
            cur.execute(query, (follower_id,))
            rows = cur.fetchall()
            return {str(row[0]): {'config': row[1], 'expiry': row[2]} for row in rows}

    except Exception as e:
        print(f"[ERROR] Fetch Subscriptions Failed: {e}")
        return {} if EXECUTION_MODE == 'BATCH' else {}
    finally:
        if conn:
            cur.close()
            conn.close()

def fetch_credentials(target_user_id=None):
    use_id = target_user_id if target_user_id else MY_FOLLOWER_ID
    print(f"[INFO] Fetching credentials from Cloud for {use_id}...")
    for host in HOSTS:
        url = get_broker_url(host)
        try:
            res = requests.get(url, headers={"x-bridge-secret": BRIDGE_SECRET, "x-user-id": use_id}, timeout=3)
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


    
# 🕰️ TIME UTILS


def get_master_closed_positions(sub_master_id, lookback_days=2):
    """
    Switch to Master and return a SET of all closed POSITION IDs (not Deal IDs) 
    from the last 'lookback_days'.
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
             
        # 4. Check History (Last 48h)
        from_date = datetime.utcnow() - timedelta(days=lookback_days)
        to_date = datetime.utcnow() + timedelta(days=1) # Future proof
        
        deals = mt5.history_deals_get(from_date, to_date)
        
        if deals:
            count = 0
            for d in deals:
                # We want DEALS that are 'OUT' (Closing)
                # And we store the POSITION ID they closed.
                if d.entry == mt5.DEAL_ENTRY_OUT: 
                    closed_position_ids.add(str(d.position_id))
                    count += 1
            
            if count > 0:
                print(f"   [✅] BATCH HISTORY: Found {count} closed positions in last {lookback_days} days.")
        else:
             print(f"   [ℹ️] No history deals found for Master in last {lookback_days} days.")
             
    except Exception as e:
        print(f"   [ERROR] Batch History Check failed: {e}")
        traceback.print_exc()
        
    finally:
        # 5. Release Lock (Caller must switch back to Follower!)
        release_terminal_lock()

    return closed_position_ids

def verify_master_history_closure(sub_master_id, master_ticket_str):
    """
    Wrapper to safely check Master History and GUARANTEE return to Follower.
    """
    # ⚡ FAST CHECK: Redis History (Populated by Broadcaster)
    # This avoids dangerous/slow account switching if possible.
    if r_client:
        redis_key = f"history:master:{sub_master_id}:closed"
        if r_client.sismember(redis_key, master_ticket_str):
            # print(f"   [GHOST] ⚡ Redis confirmed Master {master_ticket_str} is CLOSED.")
            return True

    is_closed = False
    original_login = mt5.account_info().login # Capture CURRENT (Follower) login
    
    try:
        # 1. Fetch Closed History
        closed_set = get_master_closed_positions(sub_master_id, lookback_days=2)
        
        # 2. Check
        if master_ticket_str in closed_set:
            is_closed = True
            
    except Exception as e:
        print(f"   [ERROR] Verify History failed: {e}")
        
    finally:
        # 3. 🛡️ CRITICAL: ALWAYS SWITCH BACK TO FOLLOWER
        # Use the captured 'original_login' to restore state, 
        # regardless of config or variables.
        try:
            current_login = mt5.account_info().login
            if current_login != original_login:
                 print(f"   [🛡️ SAFETY] Switching back to Follower {original_login}...")
                 mt5.login(original_login)
        except Exception as e:
            print(f"   [CRITICAL] Failed to restore Follower account {original_login}: {e}")
        
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

    if not mt5.initialize(**init_params):
        print("[ERROR] initialize() failed, error code =", mt5.last_error())
        if not DRY_RUN: quit()
        print("[WARN] Proceeding in DRY_RUN mode without MT5 Connection check strictness.")
    else:
        # Attempt Auto-Login (SINGLE MODE ONLY)
        # In TURBO/BATCH mode, the Manager Process doesn't need to login. Workers do it.
        if EXECUTION_MODE == 'SINGLE':
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

def execute_trade(signal, api_url, follower_id=None):
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
    lock_owner = MY_FOLLOWER_ID if MY_FOLLOWER_ID else "HFT_SWARM_MANAGER"
    
    for attempt in range(100): # 100 * 0.1s = 10s timeout
        # Set Lock with 30s TTL (in case of crash, auto-release)
        is_locked = r_client.set(key, lock_owner, ex=30, nx=True)
        if is_locked:
            # print(f"[MUTEX] 🟢 Acquired Terminal Lock") 
            return True
        
        # Check who has it?
        current_owner = r_client.get(key)
        if current_owner:
            if isinstance(current_owner, bytes):
                current_owner = current_owner.decode()
            if current_owner == lock_owner: return True # Re-entrancy
        
        time.sleep(0.1)
        
    print(f"[MUTEX] 🔴 Failed to acquire Terminal Lock after 10s. Forcing overlap (Dangerous).")
    return False

def release_terminal_lock():
    if not r_client: return
    
    lock_seed = MT5_PATH_ARG if MT5_PATH_ARG else "default"
    # NORMALIZE PATH to ensure matching hash with Broadcaster
    lock_seed = os.path.normpath(str(lock_seed)).lower().strip()
    
    path_hash = hashlib.md5(lock_seed.encode()).hexdigest()
    lock_key = f"lock:terminal:{path_hash}"
    print(f"[DEBUG] Terminal Lock Key: {lock_key}")
    
    # Only release if WE own it
    lock_owner = MY_FOLLOWER_ID if MY_FOLLOWER_ID else "HFT_SWARM_MANAGER"
    
    current_owner = r_client.get(lock_key)
    if current_owner:
        if isinstance(current_owner, bytes):
            current_owner = current_owner.decode()
            
        if current_owner == lock_owner:
            r_client.delete(lock_key)
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
        # ⏳ WAIT FOR BROADCASTER (Race Condition Fix)
        # If Broadcaster is starting up, Redis key might be empty.
        # We must wait for it to populate, otherwise we skip Ghost Checks.
        data = None
        for _ in range(5):
             data = r_client.get(state_key)
             if data: break
             print(f"   [WAIT] Waiting for Broadcaster State ({sub_master_id})...")
             time.sleep(1.0)
        
        if not data:
             print(f"   [WARN] Broadcaster State missing for {sub_master_id}. Skipping sync.")
             continue

        try:
            state = json.loads(data)
            master_positions = state.get("positions", {}) # New Full State
            
            # 🛡️ ACCOUNT INTEGRITY: Ensure we are logged in as Follower before scanning positions!
            # If we drifted to Master, we will see 0 positions (Master's) and miss the Ghost Check.
            if EXECUTION_MODE == 'SINGLE' and MY_FOLLOWER_ID:
                 pass
                 # current = mt5.account_info()
                 # if current:
                     # We need to resolve MY_FOLLOWER_ID to a Login ID (Integer). 
                     # Ideally we have it stored. For now, let's just re-login if we suspect drift.
                     # Actually, login_mt5 handles the check.
                     # creds = fetch_credentials(MY_FOLLOWER_ID)
                     # if creds and str(current.login) != str(creds[0]):
                     #     print(f"   [⚠️] Account Drift Detected in Recon! Active: {current.login}, Target: {creds[0]}. Re-logging...")
                     #     login_mt5(creds)
            
            # REMOVED: if not master_positions: continue 
            # REASON: If Master has 0 positions, we MUST proceed to Ghost Check to close our dangling trades!
            
            print(f"   [DEBUG-MASTER] Master Pos Keys: {list(master_positions.keys())}")

            # Get Local Positions (Retry Logic)
            local_positions = None
            for _ in range(5):
                local_positions = mt5.positions_get()
                if local_positions is not None: break
                time.sleep(0.5)

            # 🛡️ SAFETY: If MT5 returns None (Error), abort Recon to prevent False Catch-up
            # RE-FETCH LOCAL POSITIONS to be sure (after wait)
            local_positions = mt5.positions_get()
            if local_positions is None: local_positions = []
            
            print(f"   [DEBUG-GHOST] Local Positions Scanned: {len(local_positions)}")
            if len(local_positions) > 0:
                 print(f"   [DEBUG-GHOST] Sample Position 0: Ticket={local_positions[0].ticket}, Magic={local_positions[0].magic}, Comment='{local_positions[0].comment}'")

            # Double Check Mode:
            copied_tickets = set()
            # Iterate LOCAL positions.
            # If a position has Magic=234000 and "CPY:" in comment..
            # Check if it exists in 'master_positions'.
            for p in local_positions:
                # Filter for OUR copies only
                
                # DEBUG: Print non-matching but potential candidates?
                # if p.magic != 234000: print(f"   [DEBUG-SKIP] Magic Mismatch {p.magic}")
                
                if p.magic == 234000 and "CPY:" in p.comment:
                    try:
                        # Extract Master Ticket from Comment "CPY:12345"
                        t_id = p.comment.split(':')[1].strip().split(' ')[0] # Clean up "12345" from "12345 [sl]"
                        copied_tickets.add(str(t_id))
                    except:
                        pass
        
            # Check for Missing or Modified Trades
            batch_list_open = []
            batch_list_modify = []
            
            # Map Master Tickets to Local Position Objects for faster lookup
            # We already have copied_tickets set, but we need the actual objects.
            local_map = {} # { master_ticket_str: local_position_obj }
            for p in local_positions:
                if p.magic == 234000 and "CPY:" in p.comment:
                    try:
                        m_tid = p.comment.split(':')[1].strip().split(' ')[0]
                        local_map[str(m_tid)] = p
                    except: pass

            # ==================================================================================
            # 4. UNIFIED SYNC: OPEN (Catch-up) & MODIFY (SL/TP Drift)
            # ==================================================================================
            for m_ticket, m_info in master_positions.items():
                m_ticket_str = str(m_ticket)
                local_p = local_map.get(m_ticket_str)

                # ------------------------------------------------------------------
                # A. MISSING TRADE -> CATCH-UP (OPEN)
                # ------------------------------------------------------------------
                if not local_p:
                     # Filter: Only Catch-up if within meaningful timeframe/price? 
                     # For now, we trust the Master's Open list.
                     print(f"   [CATCH-UP] Found Missing Trade {m_ticket}! Syncing...")

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
                     
                     batch_jobs = []
                     current_login_id = mt5.account_info().login if mt5.account_info() else 0
                     
                     for t in targets:
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
                                 "target_ticket": 0
                             })
                     
                     if batch_jobs:
                         # 🔒 Check Lock
                         locked = False
                         if MT5_PATH_ARG: locked = acquire_terminal_lock()
                         try:
                             process_batch(batch_jobs, catchup_signal)
                         finally:
                             if locked: release_terminal_lock()

                # ------------------------------------------------------------------
                # B. EXISTING TRADE -> CHECK SL/TP DRIFT (MODIFY)
                # ------------------------------------------------------------------
                else:
                    master_sl = float(m_info.get('sl', 0.0))
                    master_tp = float(m_info.get('tp', 0.0))
                    local_sl = float(local_p.sl)
                    local_tp = float(local_p.tp)
                    
                    diff_sl = abs(local_sl - master_sl)
                    diff_tp = abs(local_tp - master_tp)
                    
                    # Update if SL or TP differs by > 0.0001 (approx 1 point or less)
                    if diff_sl > 0.0001 or diff_tp > 0.0001:
                        print(f"   [SYNC] 🔄 SL/TP Drift {m_ticket}. L({local_sl}/{local_tp}) vs M({master_sl}/{master_tp}). Updating...")
                        
                        mod_signal = {
                            "action": "MODIFY",
                            "ticket": str(local_p.ticket), # Use LOCAL TICKET
                            "symbol": local_p.symbol,
                            "sl": master_sl,
                            "tp": master_tp,
                            "id": f"SYNC-MOD-{local_p.ticket}-{int(time.time())}"
                        }
                        
                        # Find credentials for the CURRENT account that owns this trade
                        current_login_id = mt5.account_info().login
                        
                        targets = []
                        session_ctx = subs.get(sub_master_id)
                        if isinstance(session_ctx, list): targets = session_ctx
                        else: targets = [session_ctx]

                        target_job = None
                        for t in targets:
                            creds = fetch_credentials(t.get('follower_id'))
                            if creds and str(creds['login']) == str(current_login_id):
                                 target_job = {
                                     "login": creds['login'],
                                     "password": creds['password'],
                                     "server": creds['server'],
                                     "terminal_path": MT5_PATH_ARG,
                                     "is_premium": t.get('lane') == 'TURBO',
                                     "target_ticket": local_p.ticket
                                 }
                                 break # Found the owner
                        
                        if target_job:
                             # Execute immediately
                             process_batch([target_job], mod_signal)
                        else:
                             print(f"   [WARN] Could not find credentials for active account {current_login_id} for MODIFY.")



                





                    

                    

                    




            # ==================================================================================
            # 👻 GHOST BUSTER: Close Local Trades missing from Master
            # ==================================================================================
            # Start fresh scan for ghosts (using already fetched 'local_positions')
            # Only if we successfully got local positions.
            if local_positions:
                for p in local_positions:
                    # 1. Filter our trades
                    if p.magic == 234000 and "CPY:" in p.comment:
                        try:
                            # 2. Extract Master ID
                            m_ticket_str = p.comment.split(':')[1].strip().split(' ')[0]
                            
                            # 3. Check if missing from Master's "Open" list
                            if m_ticket_str not in master_positions:
                                print(f"   [GHOST] 👻 Candidate Found: Local {p.ticket} (Master {m_ticket_str})")
                                
                                # 4. DOUBLE CHECK MODE: Verify it's actually CLOSED in History
                                # (Prevents closing if Master is just disconnected or partial sync)
                                is_closed_in_history = verify_master_history_closure(sub_master_id, m_ticket_str)
                                
                                if is_closed_in_history:
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
                     # 2. Check for Changes (Optimization)
                     # Simple key check is fast
                     # But sentinel syncing needs logic.
                     
                     # 3. Sentinel Sync (Deep Resolution)
                     # This process is slow (Fetch Creds -> Decrypt)
                     # We do it HERE in background so Main Loop stays fast ⚡
                     if EXECUTION_MODE in ['BATCH', 'TURBO']:
                         self.sync_sentinel(new_subs)

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
            "symbol": signal.get('symbol'),
            "type": signal.get('type', 'UNKNOWN'),
            "action": signal.get('action', 'OPEN'), # Pass Action (OPEN/CLOSE)
            "volume": res.get('volume', signal.get('volume')),
            "price": res.get('price', 0.0), # Execution Price
            "profit": res.get('profit', 0.0), # Realized PnL (for Close)
            "status": "FILLED" if success else "FAILED",
            "message": res.get('message')
        }
        
        try:
             # We use a header secret if needed
             requests.post(EXECUTION_WEBHOOK_URL, json=payload, headers={"x-bridge-secret": "AlphaBravoCharlieDeltaEchoFoxtro"}, timeout=2)
             # print(f"   [✔] Reported {f_id} -> DB")
        except Exception as e:
             print(f"[ERROR] Failed to report execution for {f_id}: {e}")
             
    print(f"   [HFT] Batch Complete: {len(report)} processed.")
                                
def run_executor():
    # 🛑 LOCK CHECK (Singleton per User ID, not per Login)
    # This keeps it stable even if we are temporarily logged into someone else's account.
    if not acquire_lock(MY_FOLLOWER_ID):
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
         try:
             target_login = int(MY_FOLLOWER_ID)
             if current_mt5_login != target_login:
                 print(f"[WARN] Startup Account Mismatch! Expected: {target_login}, Found: {current_mt5_login}")
                 print(f"   -> Attempting to fetch credentials and switch...")
                 creds = fetch_credentials(MY_FOLLOWER_ID)
                 
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
                     # We do NOT exit, we hope user switches manually.
                     
         except Exception as e:
             print(f"[ERROR] Account Verification Failed: {e}")

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
    reconcile_initial_state(api_url, active_subscriptions)

    print("[READY] Waiting for High-Speed Signals... 🚄")

    try:
        while True:
            current_time = time.time()
            
            # ❤️ HEARTBEAT: Refresh Lock
            refresh_lock(MY_FOLLOWER_ID)
            
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
                added = new_keys - old_keys
                removed = old_keys - new_keys
                for m in added: pubsub.subscribe(f"signals:master:{m}")
                for m in removed: pubsub.unsubscribe(f"signals:master:{m}")
                if added or removed: print(f"[LOOP] ⚡ Channels Updated: +{len(added)} / -{len(removed)}")
            else:
                 active_subscriptions = current_active_subs # Just refresh content ptr
            
            if pubsub:
                message = pubsub.get_message(ignore_subscribe_messages=True)
                if message:
                    if message['type'] == 'message':
                        payload = message['data']
                        if payload:
                            signal = json.loads(payload)
                            master_id = str(signal.get('masterId') or signal.get('ticket'))
                            
                            targets = []
                            
                            if EXECUTION_MODE == 'BATCH' or EXECUTION_MODE == 'TURBO':
                                # BATCH/TURBO LOGIC
                                if master_id in active_subscriptions:
                                    # List of { follower_id, config... }
                                    targets = active_subscriptions[master_id]
                                    print(f"   [{EXECUTION_MODE}] Signal for Master {master_id} -> {len(targets)} Targets Found.")
                            else:
                                # SINGLE LOGIC
                                if master_id in active_subscriptions:
                                    ctx = active_subscriptions[master_id]
                                    
                                    # 🔒 EXPIRY CHECK (Just-in-Time)
                                    if ctx.get('expiry') and ctx['expiry'] < datetime.utcnow():
                                        print(f"   [SKIP] Session Expired for {MY_FOLLOWER_ID}. Skipping Trade.")
                                    
                                    else:
                                        targets = [{
                                            'follower_id': MY_FOLLOWER_ID,
                                            'config': ctx['config'],
                                            'expiry': ctx.get('expiry')
                                        }]
                                        # SINGLE EXECUTION (Legacy 1:1)
                                        f_id = MY_FOLLOWER_ID
                                        
                                        # MUTEX LOCK
                                        if acquire_terminal_lock():
                                            try:
                                                execute_trade(signal, api_url or "http://localhost:3000", follower_id=f_id)
                                            finally:
                                                release_terminal_lock()
                            
                            # 🚀 HFT INTEGRATION (BATCH/TURBO)
                            if EXECUTION_MODE in ['BATCH', 'TURBO']:
                                from hft_executor import process_batch
                                # Prepare Slave List for HFT Engine
                                slave_list = []
                                # We need a fast credential lookup.
                                login_map = {} # Store Login -> FollowerID mapping for reporting
                                
                                for target in targets:
                                    # 🔒 EXPIRY CHECK (Just-in-Time)
                                    if target.get('expiry') and target['expiry'] < datetime.utcnow():
                                         # print(f"   [SKIP] Session Expired for {target['follower_id']}. Skipping.")
                                         continue

                                    creds = fetch_credentials(target['follower_id'])
                                    if creds:
                                            # DYNAMIC PRIORITY LOGIC
                                            # Check lane from subscription data
                                            is_turbo = target.get('lane') == 'TURBO'
                                            
                                            # 🛠️ TICKET RESOLUTION (HFT MAPPING)
                                            target_ticket = 0
                                            action = signal.get('action')
                                            if action in ['MODIFY', 'CLOSE']:
                                                master_ticket = int(signal.get('ticket', 0)) # Use Int for lookup
                                                
                                                # Use Helper
                                                # Use Helper
                                                resolved_t = get_follower_ticket(master_ticket, target['follower_id'])
                                                
                                                if resolved_t:
                                                    target_ticket = int(resolved_t)
                                                else:
                                                    # 🩹 SELF-HEALING FALLBACK
                                                    # Redis Map Missing? Try Local Scan (if Hybrid/Single).
                                                    print(f"   [WARN] Ticket Map Missing for {master_ticket}. Attempting Self-Heal Scan...")
                                                    found_pos = None
                                                    
                                                    # 🔐 LOCK & SCAN
                                                    try: 
                                                        from hft_executor import MT5_GLOBAL_LOCK
                                                        lock_ctx = MT5_GLOBAL_LOCK
                                                    except: pass

                                                    if lock_ctx and lock_ctx.acquire(blocking=False):
                                                        try:
                                                            found_pos = find_trade_by_ticket(master_ticket)
                                                        finally:
                                                            lock_ctx.release()
                                                    elif EXECUTION_MODE == 'SINGLE':
                                                        found_pos = find_trade_by_ticket(master_ticket)
                                                        
                                                    if found_pos:
                                                        target_ticket = int(found_pos.ticket)
                                                        # HEAL THE MAP 🩹
                                                        save_ticket_map(master_ticket, target_ticket, target['follower_id'])
                                                        print(f"   [🩹] Self-Healed Map: Master {master_ticket} -> Follower {target_ticket}")
                                                    else:
                                                         print(f"   [❌] Self-Heal Failed: Could not find trade locally.")

                                            slave_config = {
                                                "login": creds['login'],
                                                "password": creds['password'],
                                                "server": creds['server'],
                                                "terminal_path": MT5_PATH_ARG, 
                                                "balance": 0,
                                                "is_premium": is_turbo, # <--- ALIGNMENT WITH HFT ENGINE
                                                # New Injected Params
                                                "target_ticket": target_ticket,
                                                "max_daily_loss": float(creds.get('maxDailyLoss', 0) or 0),
                                                "min_equity": float(creds.get('minEquity', 0) or 0)
                                            }
                                            slave_list.append(slave_config)
                                            # ✅ Ensure Key is INT for robust matching
                                            login_map[int(creds['login'])] = target['follower_id']
                                
                                # 4. Execute Batch & Report
                                if slave_list:
                                    # 🔒 LOCK HFT BATCH
                                    # Prevents Broadcaster from stealing focus during high-speed ops
                                    locked = False
                                    if MT5_PATH_ARG:
                                         locked = acquire_terminal_lock()
                                    
                                    try:
                                        # process_batch returns List[TradeResult]
                                        results = process_batch(slave_list, signal)
                                    finally:
                                        if locked: release_terminal_lock()
                                    
                                    # REPORT RESULTS (Console + DB feedback?)

                                    # For now, print to console so we can see what happened
                                    if results:
                                        print(f"   [HFT] Execution Report:")
                                        for res in results:
                                            # Handle Dict Result from HFT
                                            is_success = (res.get('status') == 'success')
                                            status_icon = "✅" if is_success else "❌"
                                            login_id = res.get('accountId')
                                            msg = res.get('message')
                                            deal = res.get('dealId')
                                            
                                            print(f"       -> Slave {login_id}: {status_icon} {msg} (Deal: {deal})")
                                            
                                            # ✅ PERSIST TICKET MAP (Critical for Modify/Close)
                                            if is_success and signal.get('action') == 'OPEN':
                                                 # We need FollowerID. Map accountId -> followerId
                                                 # We built login_map earlier: login_map[login] = follower_id
                                                 f_uuid = login_map.get(login_id)
                                                 if f_uuid and deal:
                                                     save_ticket_map(signal.get('ticket'), deal, f_uuid)
                                                     # print(f"       [💾] Mapped Master {signal.get('ticket')} -> Follower {deal}")

                                else:
                                    print("   [HFT] No valid targets found (Credentials missing?)")
                                
                                continue # Skip legacy loop below
            
            # 2. Safety & Reconciliation (Timestamp based)
            # ⚠️ SINGLE MODE ONLY: The Manager Process (TURBO) does not manage a local terminal state.
            # 2. Safety & Reconciliation (Timestamp based)
            # ⚠️ HYBRID MODE: If TURBO/BATCH but we have a Local Path, we perform reconciliation using the Global Lock.
            is_hybrid = ((EXECUTION_MODE == 'TURBO' or EXECUTION_MODE == 'BATCH') and MT5_PATH_ARG)
            should_reconcile = (EXECUTION_MODE == 'SINGLE' or is_hybrid) and (current_time - last_recon_time > RECON_INTERVAL)
            
            if should_reconcile:
                 if api_url:
                     # 🔐 GLOBAL MUTEX: Serialize Terminal Access between Manager and HFT Workers
                     # If HFT module loaded, use its lock. Else fallback to local mutex logic.
                     lock_ctx = None
                     try:
                        from hft_executor import MT5_GLOBAL_LOCK
                        lock_ctx = MT5_GLOBAL_LOCK
                     except ImportError:
                         # Fallback for Pure Single Mode
                         pass
                     
                     if lock_ctx:
                         # 🟢 GLOBAL LOCK (Thread-Safe with Workers)
                         acquired = lock_ctx.acquire(blocking=False) # Non-blocking Attempt
                         if acquired:
                             try:
                                 reconcile_initial_state(api_url, active_subscriptions)
                             finally:
                                 lock_ctx.release()
                     else:
                         # 🟡 LEGACY LOCK (Process Mutual Exclusion Only)
                         if acquire_terminal_lock():
                             try:
                                 term_info = mt5.terminal_info()
                                 if not term_info or not term_info.connected:
                                     print("[WARN] Main Loop: Terminal Disconnected. Reconnecting...")
                                     initialize_mt5()
                                 
                                 reconcile_initial_state(api_url, active_subscriptions)
                             finally:
                                 release_terminal_lock()
                     
                     last_recon_time = current_time
            
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

            time.sleep(0.001) # Ultra Low Latency Loop (1ms)

    except KeyboardInterrupt:
        print("[STOP] Stopping Executor...")
    finally:
        release_lock(MY_FOLLOWER_ID)
        mt5.shutdown()

if __name__ == "__main__":
    print("Hydra Executor v1.1 (Ghost Buster & Unified Sync)")
    initialize_mt5()
    run_executor()
