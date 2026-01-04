
import os
import psycopg2
from datetime import datetime, timedelta, time as d_time
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

def get_db_connection():
    try:
        return psycopg2.connect(DATABASE_URL)
    except Exception as e:
        print(f"[ERROR] DB Connect Failed: {e}")
        return None

def is_within_trading_hours(time_config):
    now = datetime.utcnow().time()
    print(f"   [DEBUG] Checking Hours. Config: {time_config}, Now: {now}")
    
    if not time_config: return True 
    mode = time_config.get('mode', '24/7')
    if mode == '24/7': return True
    
    try:
        s_str = time_config.get('start', '00:00')
        e_str = time_config.get('end', '23:59')
        sh, sm = map(int, s_str.split(':'))
        eh, em = map(int, e_str.split(':'))
        start_time = d_time(sh, sm)
        end_time = d_time(eh, em)
        
        if start_time <= end_time:
            return start_time <= now <= end_time
        else:
            return now >= start_time or now <= end_time
    except Exception as e:
        print(f"[WARN] Time Parse Error: {e}")
        return True

def debug_renewal(follower_id):
    print(f"🔍 Debugging Renewal for Follower: {follower_id}")
    conn = get_db_connection()
    if not conn: return

    cur = conn.cursor()
    
    # FETCH ALL RELEVANT SESSIONS
    query = """
        SELECT "id", "masterId", "timeConfig", "expiry", "isActive", "type", "autoRenew"
        FROM "CopySession"
        WHERE "followerId" = %s
    """
    cur.execute(query, (follower_id,))
    rows = cur.fetchall()
    
    now = datetime.utcnow()
    print(f"🕒 Current UTC Time: {now}")
    
    for row in rows:
        sid, mid, config, expiry, is_active, session_type, auto_renew = row
        print(f"\n👉 Session {sid} (Master: {mid})")
        print(f"   Type: {session_type}, Active: {is_active}, AutoRenew: {auto_renew}")
        print(f"   Expiry: {expiry}")
        
        # 1. Check if eligible for Daily Check logic
        if session_type in ('TRIAL_7DAY', 'PAID'):
             print("   [INFO] Excluded from Renewable Check (Type is TRIAL/PAID)")
        
        if not auto_renew:
             print("   [INFO] AutoRenew is OFF. Skipping.")
             
        # Simulate Logic
        if is_active and expiry and expiry < now:
             print("   [CONDITION] Active + Expired.")
             if is_within_trading_hours(config):
                 print("   ✅ RENEWAL SHOULD TRIGGER!")
             else:
                 print("   ❌ OUTSIDE TRADING HOURS. Should Sleep.")
        elif not is_active:
             print("   [CONDITION] Inactive. Checking Wake Up...")
             start_str = config.get('start', '00:00') if config else '00:00'
             print(f"   Start Time: {start_str}")
        else:
             print("   [OK] Session is Valid (Not Expired).")

    conn.close()

if __name__ == "__main__":
    debug_renewal("a510e860-903d-4c0b-b27e-41309a736d34")
