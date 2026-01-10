
import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

DB_URL = os.getenv("DATABASE_URL")
FOLLOWER_ID = "270766441"

def check_broker():
    try:
        conn = psycopg2.connect(DB_URL)
        cur = conn.cursor()
        
        print(f"Checking for Broker Account with login: {FOLLOWER_ID}")
        
        # Check BrokerAccount table
        cur.execute('SELECT "id", "userId", "login", "server", "status" FROM "BrokerAccount" WHERE "login" = %s', (FOLLOWER_ID,))
        res = cur.fetchone()
        
        if res:
            print(f"FOUND BrokerAccount: ID={res[0]}, UserID={res[1]}, Login={res[2]}, Server={res[3]}, Status={res[4]}")
            
            # Check User
            cur.execute('SELECT "id", "email" FROM "User" WHERE "id" = %s', (res[1],))
            user = cur.fetchone()
            print(f"Linked User: {user}")
        else:
            print(f"NOT FOUND BrokerAccount with login {FOLLOWER_ID}")
            
    except Exception as e:
        print(f"Error: {e}")
    finally:
        if conn: conn.close()
        
if __name__ == "__main__":
    check_broker()
