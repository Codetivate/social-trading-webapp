import time
import requests
import random
import os

# Configuration
PORTS = ["3000", "3001"]
HOSTS = ["localhost", "127.0.0.1", "192.168.2.33"]
MASTER_ID = "1001"
API_SECRET = "super-secret-bridge-key"

def send_signal(payload):
    print(f"📡 Sending {payload['action']} signal for {payload['symbol']}...")
    
    for port in PORTS:
        for host in HOSTS:
            url = f"http://{host}:{port}/api/webhook/signal"
            try:
                r = requests.post(url, json=payload, headers={"x-bridge-secret": API_SECRET}, timeout=2)
                print(f"✅ Success on {host}:{port}! ({r.status_code}): {r.text}")
                return # Stop after success
            except Exception:
                pass # Try next host/port
            
    print(f"❌ Failed to send signal to any host/port")

def simulate():
    print("🎭 Starting Mock Broadcaster (Simulation Mode)")
    print("Press Ctrl+C to stop.")
    
    symbols = ["EURUSD", "GBPUSD", "BTCUSD", "XAUUSD"]
    
    while True:
        # Simulate a random trade
        symbol = random.choice(symbols)
        ticket = random.randint(100000, 999999)
        price = round(random.uniform(1.05, 2000.0), 5)
        
        # 1. OPEN Trade
        open_payload = {
            "masterId": MASTER_ID,
            "ticket": ticket,
            "symbol": symbol,
            "type": random.choice(["BUY", "SELL"]),
            "volume": round(random.uniform(0.1, 1.0), 2),
            "price": price,
            "sl": round(price * 0.99, 5),
            "tp": round(price * 1.01, 5),
            "action": "OPEN"
        }
        send_signal(open_payload)
        
        # Wait a bit
        time.sleep(3)
        
        # 2. MODIFY Trade (Optional)
        if random.random() > 0.5:
            modify_payload = {
                "masterId": MASTER_ID,
                "ticket": ticket,
                "symbol": symbol,
                "action": "MODIFY",
                "sl": round(price * 0.995, 5),
                "tp": round(price * 1.015, 5)
            }
            send_signal(modify_payload)
            time.sleep(2)
            
        # 3. CLOSE Trade
        close_payload = {
            "masterId": MASTER_ID,
            "ticket": ticket,
            "symbol": symbol,
            "action": "CLOSE"
        }
        send_signal(close_payload)
        
        print("-----------------------------------")
        time.sleep(5)

if __name__ == "__main__":
    simulate()
