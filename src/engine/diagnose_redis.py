
import redis
import os
import time

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

def diagnose():
    print(f"🔌 Connecting to {REDIS_URL}...")
    try:
        r = redis.from_url(REDIS_URL, decode_responses=True)
        
        # 1. Check Max Clients Config
        try:
            config = r.config_get("maxclients")
            print(f"⚙️  Redis Config 'maxclients': {config.get('maxclients', 'Unknown')}")
        except Exception as e:
            print(f"⚠️  Could not get config: {e}")

        # 2. Check Client Info
        try:
            info = r.info("clients")
            print(f"📊 Current Connected Clients: {info.get('connected_clients', 'Unknown')}")
            print(f"   Blocked Clients: {info.get('blocked_clients', 'Unknown')}")
        except Exception as e:
             print(f"⚠️  Could not get INFO clients: {e}")

        # 3. List Clients (Summary)
        try:
            client_list = r.client_list()
            print(f"\n📋 Client Breakdown ({len(client_list)} total):")
            
            by_name = {}
            by_addr = {}
            
            for c in client_list:
                name = c.get('name', 'unknown')
                addr = c.get('addr', 'unknown').split(':')[0]
                
                by_name[name] = by_name.get(name, 0) + 1
                by_addr[addr] = by_addr.get(addr, 0) + 1
            
            print("   By Name:")
            for n, count in by_name.items():
                print(f"     - {n}: {count}")
                
            print("   By IP:")
            for ip, count in by_addr.items():
                print(f"     - {ip}: {count}")
                
        except Exception as e:
            print(f"⚠️  Could not list clients: {e}")

    except Exception as e:
        print(f"❌ FATAL: Could not connect to Redis to diagnose: {e}")

if __name__ == "__main__":
    diagnose()
