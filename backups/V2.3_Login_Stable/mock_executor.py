import time
import requests
import os

# ⚙️ CONFIGURATION
PORTS = ["3000", "3001"]
HOSTS = ["localhost", "127.0.0.1", "192.168.2.33"]
BRIDGE_SECRET = "super-secret-bridge-key"
# HARCODED ID for testing (The id of Numsin Ketchaisri from logs)
MY_FOLLOWER_ID = "0c13bf41-fad5-4884-8be5-c6bb2532cca5" 
POLL_INTERVAL = 1.0 # Seconds

def get_api_url(host, port):
    return f"http://{host}:{port}/api/engine/poll"

def find_server():
    print("🔎 Searching for Signal Server...")
    for port in PORTS:
        for host in HOSTS:
            url = get_api_url(host, port)
            try:
                # print(f"   Ping {url}...")
                r = requests.get(f"{url}?followerId={MY_FOLLOWER_ID}", 
                             headers={"x-bridge-secret": BRIDGE_SECRET}, timeout=1)
                if r.status_code == 200:
                    print(f"✅ Found Server at: {host}:{port}")
                    return url
            except Exception:
                pass
    print("❌ Could not connect to server.")
    return None

def run_executor():
    print(f"🏎️ Mock Executor Started for {MY_FOLLOWER_ID}...")
    
    api_url = None
    while not api_url:
        api_url = find_server()
        if not api_url:
            print("   Retrying in 2s...")
            time.sleep(2)

    while True:
        try:
            # 1. Ask Server: "Any jobs for me?"
            response = requests.get(
                f"{api_url}?followerId={MY_FOLLOWER_ID}", 
                headers={"x-bridge-secret": BRIDGE_SECRET},
                timeout=2
            )
            
            if response.status_code == 200:
                data = response.json()
                signals = data.get("signals", [])
                
                for sig in signals:
                    print(f"⚡ SIMULATED EXECUTION: {sig['action']} {sig['symbol']} {sig['volume']} Lots")
                    print(f"   (Ticket: {sig['ticket']}, Status: {sig['status']})")
                    # In real executor, we would now call MT5, then acknowledge to API.
            
            time.sleep(POLL_INTERVAL)
            
        except Exception as e:
            print(f"⚠️ Poll Error: {e}")
            time.sleep(1)

if __name__ == "__main__":
    run_executor()
