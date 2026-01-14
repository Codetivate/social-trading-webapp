
import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

try:
    conn = psycopg2.connect(os.getenv('DATABASE_URL'))
    cur = conn.cursor()
    
    print("\n--- BROKER ACCOUNTS ---")
    cur.execute('SELECT "userId", "login", "status", "server" FROM "BrokerAccount"')
    for row in cur.fetchall():
        print(row)
        
    print("\n--- USERS ---")
    cur.execute('SELECT "id", "role", "email" FROM "User" WHERE "role" = \'MASTER\'')
    for row in cur.fetchall():
        print(row)

    print("\n--- COPY SESSIONS ---")
    cur.execute('SELECT "id", "followerId", "masterId", "isActive", "type", "autoRenew" FROM "CopySession"')
    rows = cur.fetchall()
    print(rows)

except Exception as e:
    print(e)
