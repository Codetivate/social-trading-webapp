
import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

try:
    conn = psycopg2.connect(os.getenv('DATABASE_URL'))
    cur = conn.cursor()
    print("Activating Sessions...")
    cur.execute('UPDATE "CopySession" SET "isActive"=true, "expiry"=NOW() + INTERVAL \'30 days\'')
    conn.commit()
    print(f"Updated {cur.rowcount} sessions.")

except Exception as e:
    print(e)
