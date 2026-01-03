import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

# Configuration based on your previous start_engine.ps1 setup
UPDATES = [
    {
        "login": "206872145", # Master (Broadcaster)
        "path": r"C:\Program Files\MetaTrader 5 EXNESS 002\terminal64.exe"
    },
    {
        "login": "206872179", # Follower 1 (Executor)
        "path": r"C:\Program Files\MetaTrader 5 EXNESS\terminal64.exe"
    },
    {
        "login": "206881195", # Follower 2 (Executor - Shared Terminal)
        "path": r"C:\Program Files\MetaTrader 5 EXNESS\terminal64.exe"
    }
]

def fix_paths():
    print("🔧 Fixing MT5 Paths in Database...")
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()
        
        for item in UPDATES:
            print(f"   -> Setting Path for Login {item['login']}...")
            cur.execute("""
                UPDATE "BrokerAccount"
                SET "mt5Path" = %s
                WHERE "login" = %s
            """, (item['path'], item['login']))
            
            if cur.rowcount == 0:
                print(f"      ⚠️ NO MATCH found for login {item['login']}!")
            else:
                print(f"      ✅ Updated {cur.rowcount} row(s).")
            
        conn.commit()
        print(f"✅ Successfully Updated {len(UPDATES)} accounts.")
        
        cur.close()
        conn.close()
    except Exception as e:
        print(f"❌ Update Failed: {e}")

if __name__ == "__main__":
    fix_paths()
