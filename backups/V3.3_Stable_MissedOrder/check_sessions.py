import os
import psycopg2
from dotenv import load_dotenv
from datetime import datetime

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

def check_sessions():
    print("🔍 Checking Copy Sessions...")
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()
        
        cur.execute("""
            SELECT id, "masterId", "followerId", "isActive", type, expiry, "timeConfig", "autoRenew"
            FROM "CopySession"
            WHERE "followerId" = 'a510e860-903d-4c0b-b27e-41309a736d34'
        """)
        rows = cur.fetchall()
        
        print(f"\n📊 Found {len(rows)} Sessions for follower a510...:")
        for row in rows:
            # id, masterId, followerId, isActive, type, expiry, timeConfig, autoRenew
            sid, mid, fid, active, stype, expiry, config, auto_renew = row
            
            status_icon = "✅" if active else "❌"
            
            # Check expiry
            expiry_str = "No Expiry"
            if expiry:
                expiry_str = str(expiry)
                if expiry < datetime.utcnow():
                    status_icon = "💀" # Expired

            print(f"{status_icon} [{stype}] {mid} | Active: {active} | Renew: {auto_renew} | Expires: {expiry_str}")
            
        conn.close()
    except Exception as e:
        print(f"❌ DB Error: {e}")

if __name__ == "__main__":
    check_sessions()
