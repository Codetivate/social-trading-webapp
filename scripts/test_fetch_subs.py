
import sys
import os

# Init Path
sys.path.append(os.path.join(os.getcwd(), 'src', 'engine'))

# Mock Env
from dotenv import load_dotenv
load_dotenv() # Load from .env in CWD

# os.environ['DATABASE_URL'] = "..." # Don't overwrite if .env exists

from executor import fetch_subscriptions, EXECUTION_MODE

# Force Follower ID
FOLLOWER_ID = "cea89d76-eacd-42a2-a4e3-b935352d9734"

print("--- Testing Fetch Subscriptions ---")
# Use BATCH or TURBO mode simulation
# We need to hack EXECUTION_MODE or just test standard fetch
# fetch_subscriptions behavior depends on Global EXECUTION_MODE variable in executor.py.
# We can't easily change it after import if it's used at top level, but it is used inside function.

import executor
executor.EXECUTION_MODE = 'TURBO' 
print(f"Mode: {executor.EXECUTION_MODE}")

subs = executor.fetch_subscriptions(FOLLOWER_ID)

if subs:
    print(f"Subs Found: {len(subs)}")
    for mid, targets in subs.items():
        print(f"Master: {mid}")
        for t in targets:
            print(f"  -> Follower: {t['follower_id']}")
            print(f"  -> InvertCopy: {t.get('invert_copy')}")
else:
    print("No subs found.")
