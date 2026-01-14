
import redis
import json
import time
import sys

# Connect to Redis
try:
    r = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)
    r.ping()
    print("[OK] Connected to Redis")
except Exception as e:
    print(f"[ERROR] Redis Connection Failed: {e}")
    sys.exit(1)

MASTER_ID = "test_master_1" # Ensure this master is in your subscriptions test data if possible, or use a real one
# User provided Master ID in previous context: e3a37995-7718-4123-a986-8b9f4a07b55e
# Let's use a generic one or ask user. For now, I'll use a placeholder.
# Actually, the user can edit this.

CHANNEL = f"signals:master:{MASTER_ID}"

def send_signal(action, age_offset=0):
    timestamp = time.time() - age_offset
    ticket = int(time.time())
    
    payload = {
        "masterId": MASTER_ID,
        "ticket": ticket,
        "symbol": "EURUSDm",
        "action": action,
        "type": "BUY",
        "volume": 0.01,
        "timestamp": timestamp,
        "magic": 123456
    }
    
    msg = json.dumps(payload)
    print(f"[SEND] Publishing to {CHANNEL} (Age: {age_offset}s)...")
    r.publish(CHANNEL, msg)
    print(f"   -> Payload: {msg}")

if __name__ == "__main__":
    print("--- 🧪 Signal Test Tool ---")
    print("1. Sending FRESH Signal (Should be Processed)")
    send_signal("OPEN", age_offset=0)
    
    time.sleep(1)
    
    print("\n2. Sending STALE Signal (Should be SKIPPED > 60s)")
    send_signal("OPEN", age_offset=70) # 70 seconds old

    print("\n[DONE] Check Executor Console for:")
    print("   - [DEBUG] 📩 Received RAW Payload...")
    print("   - [WARN] ⏳ Skipping Stale Signal...")
