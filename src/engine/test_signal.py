import redis
import json
import time

# Update with your Master ID
MASTER_ID = "b19255b0-6a17-4077-8346-cd2505a4e337"
CHANNEL = f"signals:master:{MASTER_ID}"

r = redis.from_url("redis://localhost:6379", decode_responses=True)

payload = {
    "action": "OPEN",
    "symbol": "EURUSD",
    "ticket": "999999", # Test Ticket
    "type": "BUY",
    "volume": 0.01,
    "price": 1.1000,
    "sl": 1.0900,
    "tp": 1.1100,
    "masterId": MASTER_ID
}

print(f"🚀 Firing Test Signal to {CHANNEL}...")
r.publish(CHANNEL, json.dumps(payload))
print("✅ Sent.")
