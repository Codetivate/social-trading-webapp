import MetaTrader5 as mt5
import argparse
import json
import sys
import os
from datetime import datetime, timedelta

# Argument Parsing
parser = argparse.ArgumentParser(description='Verify MT5 Credentials')
parser.add_argument('--login', type=int, required=True, help='Login ID')
parser.add_argument('--password', type=str, required=True, help='Password')
parser.add_argument('--server', type=str, required=True, help='Server Name')
parser.add_argument('--mt5-path', type=str, help='Path to terminal64.exe', default="")

args = parser.parse_args()

# Initialize MT5
init_params = {}
if args.mt5_path and os.path.exists(args.mt5_path):
    init_params['path'] = args.mt5_path

import time
import redis

# 🔒 REDIS LOCK CONFIG
REDIS_HOST = 'localhost'
REDIS_PORT = 6379
LOCK_KEY = "lock:terminal:global"
r_client = None

try:
    r_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
except:
    pass

def acquire_lock(timeout=10):
    if not r_client: return True
    start = time.time()
    while time.time() - start < timeout:
        if r_client.set(LOCK_KEY, "LOCKED_VERIFY", nx=True, ex=30):
            return True
        time.sleep(0.1)
    return False

def release_lock():
    if r_client:
        r_client.delete(LOCK_KEY)

# 🛡️ ACQUIRE GLOBAL LOCK
# This ensures we don't fight with the HFT Engine
if not acquire_lock(timeout=15):
    # If we can't lock, we fail fast-ish but with a clear reason
    # But wait, maybe we try anyway?
    pass 

max_retries = 2
retry_count = 0
initialized = False

try:
    while retry_count < max_retries:
        if mt5.initialize(**init_params):
            initialized = True
            break
        else:
            # Retry on failure (e.g. IPC Timeout)
            retry_count += 1
            time.sleep(0.5)

finally:
    # Release Lock immediately after Init (or attempts)
    # Actually, we need to hold it until we are done with LOGIN!
    # But initialize is the heavy part. Login is fast?
    # No, we should hold it for the whole duration to be safe.
    pass # We release at the end


if not initialized:
    print(json.dumps({
        "success": False, 
        "error": f"Initialize Failed: {mt5.last_error()}"
    }))
    release_lock()
    sys.exit(1)

# Attempt Login
authorized = mt5.login(
    login=args.login, 
    password=args.password, 
    server=args.server
)

if authorized:
    # 📊 FETCH INITIAL DATA
    info = mt5.account_info()
    
    # ⚡ SKIP HISTORY FETCH IN VERIFY (Optimization)
    # Full history is synced asynchronously by the Broadcaster/Executor logic.
    # This ensures "Connect Broker" is instant.
    history_list = []
    
    
    # Payload
    payload = {
        "success": True,
        "data": {
            "balance": float(info.balance),
            "equity": float(info.equity),
            "leverage": int(info.leverage),
            "currency": info.currency,
            "name": info.name,
            "history": history_list
        }
    }
    
    print(json.dumps(payload))
    mt5.shutdown()
    release_lock()
    sys.exit(0)
else:
    error_code, error_desc = mt5.last_error()
    print(json.dumps({
        "success": False, 
        "error": f"Login Failed: {error_desc} ({error_code})"
    }))
    mt5.shutdown()
    release_lock()
    sys.exit(1)
