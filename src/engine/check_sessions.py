import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

def check_sessions():
    print("🔍 Checking Copy Sessions...")
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()
        
        cur.execute("""
            SELECT "followerId", "masterId", "isActive" 
            FROM "CopySession"
        """)
        rows = cur.fetchall()
        
        print(f"\n📊 Found {len(rows)} Sessions:")
        for row in rows:
            print(f"👉 {row[0]} -> {row[1]}")
            
        conn.close()
    except Exception as e:
        print(f"❌ DB Error: {e}")

if __name__ == "__main__":
    check_sessions()
