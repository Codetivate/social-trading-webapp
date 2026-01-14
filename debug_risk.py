
import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
FOLLOWER_ID = "cea89d76-eacd-42a2-a4e3-b935352d9734"

try:
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    cur.execute('SELECT "id", "masterId", "riskFactor" FROM "CopySession" WHERE "followerId" = %s', (FOLLOWER_ID,))
    rows = cur.fetchall()
    for row in rows:
        print(f"RISK_VALUE: {row[2]}")
    conn.close()
except Exception as e:
    print(e)
