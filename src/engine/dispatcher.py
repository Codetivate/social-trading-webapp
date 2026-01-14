
import os
import json
import time
import redis
import threading
import psycopg2
from collections import defaultdict
from datetime import datetime

# ⚙️ CONFIGURATION
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
DATABASE_URL = os.getenv("DATABASE_URL")
QUEUE_PRIORITY = "queue:priority"
QUEUE_NORMAL = "queue:normal"
QUEUE_WORKER_PREFIX = "queue:worker:"

# 📡 REDIS CONNECTION
r_client = redis.from_url(REDIS_URL, decode_responses=True)

def get_db_connection():
    return psycopg2.connect(DATABASE_URL)

def fetch_followers_for_master(master_id):
    """
    Returns a list of active followers for a given master, including their assigned Bot (terminal path).
    """
    # 📝 TODO: Cache this result (TTL 30s) to reduce DB load
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Join User -> BrokerAccount -> CopySession
        # We need the Follower's Login, Password, Server, Assigned Terminal Path, AND Risk Factor
        query = """
            SELECT 
                s."followerId", 
                b."login", 
                b."password", 
                b."server",
                b."mt5Path",
                s."riskFactor"
            FROM "CopySession" s
            JOIN "BrokerAccount" b ON s."followerId" = b."userId"
            WHERE s."masterId" = %s 
              AND s."isActive" = true
              AND b."status" = 'CONNECTED'
        """
        cur.execute(query, (master_id,))
        rows = cur.fetchall()
        
        followers = []
        for r in rows:
            followers.append({
                "id": r[0],
                "login": r[1],
                "password": r[2],
                "server": r[3],
                "bot_path": r[4], # Crucial for routing
                "risk_factor": float(r[5]) if r[5] is not None else 100.0 # Default 100%
            })
            
        cur.close()
        conn.close()
        return followers
    except Exception as e:
        print(f"[ERROR] DB Fetch Failed: {e}")
        return []

def dispatch_loop():
    print(f"[DISPATCHER] 🚦 Started. Listening on {QUEUE_PRIORITY}, {QUEUE_NORMAL}...")
    
    while True:
        try:
            # 1. 📥 BLOCKING POP (Priority First)
            # Returns (queue_name, payload_string)
            result = r_client.blpop([QUEUE_PRIORITY, QUEUE_NORMAL], timeout=5)
            
            if not result:
                continue # Timeout, loop again
                
            queue_name, payload_json = result
            task = json.loads(payload_json)
            
            print(f"[DISPATCHER] 📨 Received Task from {queue_name}: {task.get('action')} {task.get('ticket')}")

            # 2. 🛡️ LATENCY GUARD (Drop if > 3s old)
            # Timestamp should be in Payload
            job_ts = task.get("timestamp", 0)
            if time.time() - job_ts > 5.0:
                print(f"[DISPATCHER] 🗑️ Dropped Stale Task (Lag: {time.time() - job_ts:.2f}s)")
                continue

            # 3. 🔍 RESOLVE FOLLOWERS
            master_id = task.get("masterId")
            if not master_id:
                print("[ERROR] Task missing masterId. Skipping.")
                continue
                
            followers = fetch_followers_for_master(master_id)
            if not followers:
                print(f"[DISPATCHER] No active followers for Master {master_id}.")
                continue

            # 4. 📦 BATCH GROUPING
            # Group followers by their Assigned Node AND Bot Path
            batch_map = defaultdict(list)
            
            # Redis Pipeline for fast lookups if many followers
            # But here we do simple lookups for MVP
            
            for f in followers:
                f_id = f.get("id") # User UUID
                bot_path = f.get("bot_path")
                # Normalize bot_path to key (e.g. /opt/bot_01/terminal64.exe -> bot_01)
                bot_key = "bot_default"
                if bot_path and "/opt/" in bot_path:
                     bot_key = bot_path.split("/")[-2]
                
                # 🔍 ROUTING LOOKUP: Where is this user hosted?
                # We expect a Redis Hash "hydra:routing:map" where Key=UserID, Value=ContainerID
                # Default to "node-default" if not found
                container_id = r_client.hget("hydra:routing:map", f_id) or "node-default"
                
                # Group Key: (Container, Bot)
                batch_key = (container_id, bot_key)
                batch_map[batch_key].append(f)

            # 5. 🚀 ROUTE TO WORKERS
            for (node_id, bot_key), follower_batch in batch_map.items():
                worker_payload = {
                    "master_task": task,
                    "followers": follower_batch,
                    "dispatched_at": time.time()
                }
                
                # Construct Worker Queue Key with Swarm ID
                # Format: queue:worker:{NODE_ID}:{BOT_ID}
                queue_key = f"{QUEUE_WORKER_PREFIX}{node_id}:{bot_key}"
                
                r_client.rpush(queue_key, json.dumps(worker_payload))
                print(f"[DISPATCHER] ➡️ Routed Batch ({len(follower_batch)} users) to {node_id}::{bot_key}")

        except Exception as e:
            print(f"[ERROR] Dispatch Loop: {e}")
            time.sleep(1)

if __name__ == "__main__":
    dispatch_loop()
