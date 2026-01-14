import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

def check_accounts():
    print("🔍 Checking Database for Connected Accounts...")
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()
        
        # 1. Check BrokerAccounts
        cur.execute('SELECT "userId", "login", "status", "mt5Path" FROM "BrokerAccount"')
        accounts = cur.fetchall()
        
        print(f"\n📊 Found {len(accounts)} Broker Accounts:")
        active_count = 0
        
        for row in accounts:
            uid, login, status, path = row
            icon = "✅" if status == "CONNECTED" else "❌"
            if status == "CONNECTED": active_count += 1
            print(f"   {icon} User: {uid} | Login: {login} | Status: {status}")
            print(f"      Path: {path}")
            
        print(f"\n-----------------------------------------------")
        print(f"🎯 Orchestrator will spawn {active_count} workers.")
        print(f"-----------------------------------------------")
            
        conn.close()
    except Exception as e:
        print(f"❌ DB Connection Failed: {e}")

if __name__ == "__main__":
    check_accounts()
