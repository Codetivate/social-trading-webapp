import os
import psycopg2
from urllib.parse import urlparse
import sys

# Load Env
from dotenv import load_dotenv
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    print("❌ Error: DATABASE_URL not found in environment.")
    sys.exit(1)

def cleanup_enums():
    print(f"🔌 Connecting to Database...")
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()
        
        # 1. Count Invalid Sessions
        check_q = """
            SELECT count(*), "type" 
            FROM "CopySession" 
            WHERE "type" IN ('VIP', 'GOLDEN')
            GROUP BY "type"
        """
        cur.execute(check_q)
        rows = cur.fetchall()
        
        if not rows:
            print("✅ No 'VIP' or 'GOLDEN' sessions found. Database is clean.")
        else:
            print("⚠️  Found Invalid Sessions:")
            for count, s_type in rows:
                print(f"   - {s_type}: {count}")
                
            # 2. Delete Them
            print("\n🗑️  Deleting invalid sessions...")
            del_q = """
                DELETE FROM "CopySession" 
                WHERE "type" IN ('VIP', 'GOLDEN')
            """
            cur.execute(del_q)
            deleted_count = cur.rowcount
            conn.commit()
            print(f"✅ Successfully deleted {deleted_count} sessions.")

        cur.close()
        conn.close()
        
    except Exception as e:
        print(f"❌ Database Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    cleanup_enums()
