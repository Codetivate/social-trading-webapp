
import MetaTrader5 as mt5
import os
import json
import redis
import time

# ⚙️ CONFIG
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
MASTER_ID = "e3a37995-7718-4123-a986-8b9f4a07b55e" # From logs
MASTER_LOGIN = 334564084 # From logs

def sync_master():
    print(f"[SYNC] 🚀 Starting One-Time Master Sync for {MASTER_ID}...")
    
    # 1. Connect Redis
    try:
        r = redis.from_url(REDIS_URL, decode_responses=True)
        print("[SYNC] Redis Connected.")
    except Exception as e:
        print(f"[SYNC] ❌ Redis Fail: {e}")
        return

    # 2. Connect MT5 (Master)
    if not mt5.initialize():
        print(f"[SYNC] ❌ MT5 Init Fail: {mt5.last_error()}")
        return
        
    print(f"[SYNC] Switching to Master Account {MASTER_LOGIN}...")
    # Note: Password usually cached in MT5 if previously used, otherwise we need it.
    # We assume it's saved in terminal for now or try login sans password if active.
    if not mt5.login(login=MASTER_LOGIN): 
        print(f"[SYNC] ❌ Login Failed: {mt5.last_error()}. Ensure credentials are saved.")
        return
        
    time.sleep(1) # Wait for hydration
    
    # 3. Scan Positions
    positions = mt5.positions_get()
    if positions is None:
        print(f"[SYNC] ❌ Failed to get positions.")
        return
        
    print(f"[SYNC] Found {len(positions)} Open Positions on Master.")
    
    payload = {}
    for p in positions:
        payload[str(p.ticket)] = {
            "ticket": str(p.ticket),
            "symbol": p.symbol,
            "type": "BUY" if p.type == 0 else "SELL",
            "volume": float(p.volume),
            "price": float(p.price_open),
            "sl": float(p.sl),
            "tp": float(p.tp),
            "time": int(p.time),
            "age_seconds": time.time() - p.time
        }
        
    # 4. Push to Redis
    r_key = f"signals:master:{MASTER_ID}"
    r.set(r_key, json.dumps(payload))
    
    # Also set "Ready" flag
    r.set(f"status:master:{MASTER_ID}", "ONLINE", ex=60)
    
    print(f"[SYNC] ✅ Pushed {len(payload)} positions to {r_key}.")
    print("[SYNC] 🏁 Done. Executor should catch up now.")
    
    mt5.shutdown()

if __name__ == "__main__":
    sync_master()
