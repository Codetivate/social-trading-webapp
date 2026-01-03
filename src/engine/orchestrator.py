
import subprocess
import time
import os
import signal
import sys
import psycopg2
from dotenv import load_dotenv

# 📥 Load Config
load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
API_SECRET = os.getenv("API_SECRET", "AlphaBravoCharlieDeltaEchoFoxtro")

# 🏗️ Registry of Running Processes: { "userId": subprocess.Popen }
workers = {}

def get_db_connection():
    return psycopg2.connect(DATABASE_URL)

def fetch_active_accounts():
    """
    Fetch all users who are approved and should be connected.
    Ideally, we also join with a 'BrokerRegistry' to get the MT5 Path.
    For this MVP, we might hardcode or infer paths.
    """
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        # Fetch users with active broker accounts + Role
        query = """
            SELECT b."userId", b."login", b."mt5Path", u."role"
            FROM "BrokerAccount" b
            JOIN "User" u ON b."userId" = u."id"
            WHERE b."status" = 'CONNECTED'
        """ 
        cur.execute(query)
        accounts = cur.fetchall()
        cur.close()
        conn.close()
        return accounts # List of (userId, login, mt5Path, role)
    except Exception as e:
        print(f"[ERROR] DB Fetch Failed: {e}")
        return []

def spawn_worker(user_id, login, mt5_path, role):
    """
    Spawns a new Worker (Broadcaster or Executor) based on User Role.
    """
    script_type = "BROADCASTER" if role == "MASTER" else "EXECUTOR"
    script_file = "src/engine/broadcaster.py" if role == "MASTER" else "src/engine/executor.py"
    
    print(f"[Spawn] Starting {script_type} for User {user_id} (Login: {login})...")
    
    # Validation
    if not mt5_path:
        print(f"[WARN] No MT5 Path found for {user_id}. Using default env var.")
        mt5_path = "" 

    cmd = [
        sys.executable, script_file,
        "--user-id", str(user_id),
        "--secret", API_SECRET,
        "--mt5-path", mt5_path
    ]
    
    # Spawn Process
    try:
        p = subprocess.Popen(cmd, shell=False) 
        workers[user_id] = p
        print(f"[OK] {script_type} PID:{p.pid} started for {user_id}")
    except Exception as e:
        print(f"[ERROR] Failed to spawn {script_type}: {e}")

def monitor_and_heal():
    """
    Main Loop: Syncs desired state (DB) with actual state (Processes).
    """
    print("Orchestrator: Monitoring Grid...")
    
    while True:
        try:
            # 1. Get Desired State
            active_accounts = fetch_active_accounts()
            active_user_ids = {row[0] for row in active_accounts}
            
            # 2. Prune Dead Workers
            crashed_ids = []
            for uid, proc in workers.items():
                if proc.poll() is not None: # Process exited
                    print(f"[WARN] Worker for {uid} died/exited with code {proc.returncode}")
                    crashed_ids.append(uid)
            
            for uid in crashed_ids:
                del workers[uid]

            # 3. Spawn New/Recovered Workers
            for row in active_accounts:
                uid, login, mt5_path, role = row
                if uid not in workers:
                    spawn_worker(uid, login, mt5_path, role)
            
            # 4. Stop Removed Workers (Handling Disconnections)
            to_stop = []
            for uid in workers:
                if uid not in active_user_ids:
                    print(f"[STOP] User {uid} no longer active. Stopping worker...")
                    workers[uid].terminate() # Graceful options?
                    to_stop.append(uid)
            
            for uid in to_stop:
                del workers[uid]

            time.sleep(5) # Check every 5 seconds

        except KeyboardInterrupt:
            print("Shutting down Orchestrator...")
            for uid, proc in workers.items():
                proc.terminate()
            break
        except Exception as e:
            print(f"[ERROR] Loop Error: {e}")
            time.sleep(5)

if __name__ == "__main__":
    print("hydra-orchestrator v1.0")
    monitor_and_heal()
