
import os
import json
import time
import redis
from dotenv import load_dotenv

load_dotenv()
REDIS_URL = os.getenv("REDIS_URL", "redis://127.0.0.1:6379")

def debug_redis():
    print(f"🔌 Connecting to Redis at {REDIS_URL}...")
    try:
        r = redis.from_url(REDIS_URL, decode_responses=True)
        r.ping()
        print("✅ Connected!")
    except Exception as e:
        print(f"❌ Connection Failed: {e}")
        return

    # 1. SCAN FOR MASTER STATES
    print("\n🔍 Scanning for Master States (state:master:*:tickets)...")
    keys = r.keys("state:master:*:tickets")
    
    if not keys:
        print("⚠️ No Master States found. Is the Broadcaster running?")
    else:
        for key in keys:
            ttl = r.ttl(key)
            val = r.get(key)
            print(f"   🔑 {key} (TTL: {ttl}s)")
            print(f"      Content: {val[:100]}...") # Truncate for readability state

    # 2. SUBSCRIBE AND LISTEN
    CHANNEL_PATTERN = "signals:master:*"
    print(f"\n🎧 Listening for Signals on {CHANNEL_PATTERN} for 15 seconds...")
    pubsub = r.pubsub()
    pubsub.psubscribe(CHANNEL_PATTERN)
    
    start_time = time.time()
    while time.time() - start_time < 15:
        msg = pubsub.get_message(ignore_subscribe_messages=True)
        if msg:
            print(f"   ⚡ RECEIVED on {msg['channel']}: {msg['data']}")
        time.sleep(0.1)
        
    print("FINISHED.")

if __name__ == "__main__":
    debug_redis()
