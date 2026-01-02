
import MetaTrader5 as mt5
import time
import requests
import json
import os
from dotenv import load_dotenv
load_dotenv() # 📥 Load .env file

# ⚙️ CONFIGURATION
PORT = "3000"
# Try user's IP first, then localhost as fallback
HOSTS = ["192.168.2.33.nip.io", "localhost", "127.0.0.1"] 
BRIDGE_SECRET = os.getenv("API_SECRET", "AlphaBravoCharlieDeltaEchoFoxtro")
# HARCODED ID for testing (The id of Numsin Ketchaisri from logs)
MY_FOLLOWER_ID = os.getenv("FOLLOWER_ID", "79324dd3-e856-4a55-8f90-853988a584ab") # Follower Nes 
POLL_INTERVAL = 1.0 # Seconds
DRY_RUN = False # ⚠️ SAFETY: Set to False to actually execute trades

def get_api_url(host):
    return f"http://{host}:{PORT}/api/engine/poll"

def get_broker_url(host):
    return f"http://{host}:{PORT}/api/user/broker"

def fetch_credentials():
    print("[INFO] Fetching credentials from Cloud...")
    for host in HOSTS:
        url = get_broker_url(host)
        try:
            res = requests.get(url, headers={"x-bridge-secret": BRIDGE_SECRET, "x-user-id": MY_FOLLOWER_ID}, timeout=3)
            if res.status_code == 200:
                print(f"   [OK] Found credentials at {host}")
                return res.json()
            else:
                print(f"   [WARN] {host} returned {res.status_code}: {res.text}")
        except Exception as e:
            print(f"   [WARN] {host} unreachable: {e}")
            pass
    print("[ERROR] Failed to fetch credentials from any host.")
    return None

def login_mt5(creds):
    if not creds: return False
    
    # Check if already logged in
    info = mt5.account_info()
    if info and str(info.login) == str(creds['login']):
        print(f"[OK] Already logged in as {creds['login']}")
        return True

    print(f"[INFO] Logging in as {creds['login']}...")
    authorized = mt5.login(
        login=int(creds['login']), 
        password=creds['password'], 
        server=creds['server']
    )
    
    if authorized:
        print(f"[OK] Login Successful: {creds['login']}")
        return True
    else:
        print(f"[ERROR] Login Failed: {mt5.last_error()}")
        print(f"👉 TIP: If your broker requires OTP, please Login MANUALLY in the MT5 Terminal and check 'Save Password'.")
        return False


    
def initialize_mt5():
    # Optional: Path to specific terminal (Crucial for running multiple instances)
    mt5_path = os.getenv("MT5_PATH", "") 

    init_params = {}
    if mt5_path and os.path.exists(mt5_path):
        init_params['path'] = mt5_path
        print(f"[INFO] Target Terminal: {mt5_path}")

    if not mt5.initialize(**init_params):
        print("[ERROR] initialize() failed, error code =", mt5.last_error())
        if not DRY_RUN: quit()
        print("[WARN] Proceeding in DRY_RUN mode without MT5 Connection check strictness.")
    else:
        # Attempt Auto-Login
        creds = fetch_credentials()
        if creds:
             if not login_mt5(creds):
                 print("[WARN] Warning: Could not login to Follower Account.")
                 if not DRY_RUN:
                     print("[STOP] Aborting to prevent trading on wrong account.")
                     quit()
        else:
            print("[ERROR] No credentials available.")
            if not DRY_RUN:
                print("[STOP] Aborting. Cannot ensure correct account.")
                quit()
        
        if mt5_path:
             actual_path = mt5.terminal_info().path
             expected_dir = os.path.dirname(mt5_path) if mt5_path.endswith('exe') else mt5_path
             
             # Normalized lower case comparison for Windows
             if os.path.normpath(actual_path).lower() != os.path.normpath(expected_dir).lower():
                 print(f"[ERROR] TERMINAL MISMATCH! Expected Dir: {expected_dir}, Got: {actual_path}")
                 if not DRY_RUN:
                     print("[STOP] Aborting due to potential cross-trading risk.")
                     mt5.shutdown()
                     quit()
                     
        # Verify
        info = mt5.account_info()
        print(f"[OK] Exec-Engine Online. Account: {info.login if info else 'Unknown'}")


def acknowledge_signal(signal_id, status="EXECUTED", ticket=None, comment=None):
    # Find server again or reuse known URL? simpler to find again or pass around.
    # Let's reuse the logic or simple assumption logic for now. 
    # For MVP, we'll re-scan or just use the first working one.
    # Ideally `run_executor` should pass the `api_url`.
    pass 

def find_trade_by_ticket(target_ticket):
    """
    Robust 3-Stage Matching Strategy to find Follower's trade 
    corresponding to a Master Ticket.
    """
    target_ticket_str = str(target_ticket)
    stub_exact = f"CPY:{target_ticket_str}"
    
    # 🛡️ GLOBAL SCAN: Get ALL positions to avoid Symbol Mismatch
    all_positions = mt5.positions_get()
    if all_positions is None: return None
    
    # Filter for our bot's trades only
    positions = [p for p in all_positions if p.magic == 234000]
    
    if not positions: return None

    print(f"   [DEBUG] Scanning {len(positions)} active copy trades for Master Ticket {target_ticket_str}...")

    # Pass 1: Exact Match
    for pos in positions:
        if stub_exact in pos.comment:
            print(f"   [MATCH] Found Exact Match: {pos.ticket} (Comment: {pos.comment})")
            return pos
    
    # Pass 2: Fuzzy Match (Ticket ID in comment)
    for pos in positions:
        if target_ticket_str in pos.comment:
            print(f"   [MATCH] Found Fuzzy Match: {pos.ticket} (Comment: {pos.comment})")
            return pos

    # Pass 3: FIFO Fallback (Oldest trade regardless of symbol? No, risky. 
    # Let's return None here and let caller decide fallback or fail.
    # Actually, for CLOSE/MODIFY, we really want to find *something*.
    # But FIFO is dangerous if there are multiple open trades.
    # The previous logic had FIFO fallback inside the Close block.
    # Let's keep it safer: Return None if no string match.
    return None

def execute_trade(signal, api_url):
    ticket = int(signal.get('ticket', 0)) # Handle String from BigInt JSON
    action = signal['action'] # OPEN, CLOSE, MODIFY
    symbol = signal['symbol']
    trade_type = signal['type'] # "BUY" or "SELL"
    volume = signal['volume'] 
    signal_id = signal['id']
    
    print(f"[EXEC] PROCESSING: {action} {symbol} {trade_type} {volume} Lots (Signal: {signal_id})")

    # 1. VALIDATE SYMBOL (Common for OPEN/CLOSE)
    selected = mt5.symbol_select(symbol, True)
    if not selected:
        # Try generic cleanup
        clean = symbol.replace('m', '').replace('c', '')
        if mt5.symbol_select(clean, True): symbol = clean
        else:
             # Try suffixes
             for s in ["m", "c", "z"]: 
                if mt5.symbol_select(f"{symbol}{s}", True): 
                    symbol = f"{symbol}{s}"
                    break
    
    current_tick = mt5.symbol_info_tick(symbol)
    if not current_tick:
        print(f"[ERROR] No tick for {symbol}")
        send_ack(api_url, signal_id, "FAILED", 0, "No Tick")
        return

    # 🔄 HANDLE CLOSE SIGNAL
    if action == "CLOSE":
        target_ticket = signal.get('ticket', '')
        target_pos = find_trade_by_ticket(target_ticket)
        
        # Fallback FIFO logic if find_trade_by_ticket fails?
        if not target_pos:
             # Emergency FIFO Scan for Symbol
             symbol_audit = mt5.positions_get(symbol=symbol)
             if symbol_audit:
                 target_pos = symbol_audit[0] # Oldest
                 print(f"   [FALLBACK] No comment match. Using FIFO rule: {target_pos.ticket}")

        if target_pos:
            type_close = mt5.ORDER_TYPE_SELL if target_pos.type == mt5.ORDER_TYPE_BUY else mt5.ORDER_TYPE_BUY
            price_close = current_tick.bid if type_close == mt5.ORDER_TYPE_SELL else current_tick.ask
            
            req = {
                "action": mt5.TRADE_ACTION_DEAL,
                "symbol": target_pos.symbol, # Use actual symbol from position
                "volume": target_pos.volume,
                "type": type_close,
                "position": target_pos.ticket,
                "price": price_close,
                "magic": 234000,
                "comment": f"Close {target_ticket}",
            }
            res = mt5.order_send(req)
            if res.retcode == mt5.TRADE_RETCODE_DONE:
                print(f"   [OK] Closed {target_pos.symbol} (Ticket: {res.order}) matched to Master {target_ticket}")
                send_ack(api_url, signal_id, "EXECUTED", res.order, "Closed")
                return
            else:
                print(f"   [ERROR] Close Failed: {res.comment}")
        else:
             print(f"   [WARN] No matching copy trade found to close for {symbol}")
             send_ack(api_url, signal_id, "FAILED", 0, "Trade not found")
        return

    # 🛠️ HANDLE MODIFY SIGNAL
    if action == "MODIFY":
        target_ticket = signal.get('ticket', '')
        target_pos = find_trade_by_ticket(target_ticket)
        
        if target_pos:
            sl = float(signal.get('sl', 0.0))
            tp = float(signal.get('tp', 0.0))
            
            print(f"   [MODIFY] Updating Ticket {target_pos.ticket} -> SL: {sl}, TP: {tp}")
            
            req = {
                "action": mt5.TRADE_ACTION_SLTP,
                "symbol": target_pos.symbol,
                "position": target_pos.ticket,
                "sl": sl,
                "tp": tp,
                "magic": 234000,
            }
            res = mt5.order_send(req)
            if res.retcode == mt5.TRADE_RETCODE_DONE:
                 print(f"   [OK] Modified Ticket {target_pos.ticket}")
                 send_ack(api_url, signal_id, "EXECUTED", target_pos.ticket, "Modified")
            else:
                 print(f"   [ERROR] Notify Failed: {res.comment}")
        else:
            print(f"   [WARN] Could not find trade to modify for Master Ticket {target_ticket}")
            send_ack(api_url, signal_id, "FAILED", 0, "Trade Not Found")
        return


    # 🚫 HANDLE OTHERS
    if action != "OPEN":
         send_ack(api_url, signal_id, "EXECUTED", 0, "Skipped")
         return

    if not trade_type or not volume:
         print(f"   ❌ Invalid OPEN signal")
         send_ack(api_url, signal_id, "FAILED", 0, "Invalid Data")
         return

    market_price = current_tick.ask if trade_type == "BUY" else current_tick.bid
    
    # Check difference between Master's Entry Price (signal['price']) and Current Market Price
    master_price = signal.get('price')
    MAX_SLIPPAGE_POINTS = 50 # Configurable: 50 points = 5 pips
    
    # 🛡️ IDEMPOTENCY CHECK (Strict)
    # Check if we ALREADY have a trade for this Master Ticket
    existing_positions = mt5.positions_get(symbol=symbol)
    if existing_positions:
        stub = f"CPY:{signal.get('ticket')}"
        for pos in existing_positions:
            if pos.magic == 234000 and stub in pos.comment:
                print(f"   [WARN] Duplicate Signal Ignored. Trade already exists for Ticket {signal.get('ticket')}")
                processed_signals.add(signal_id) # Mark handled
                send_ack(api_url, signal_id, "EXECUTED", pos.ticket, "Duplicate Ignored")
                return

    if master_price:
        point = mt5.symbol_info(symbol).point
        diff_points = abs(market_price - float(master_price)) / point
        
        # ⚠️ SLIPPAGE WARNING (Non-blocking for now due to data mismatch potentially)
        if diff_points > MAX_SLIPPAGE_POINTS:
            msg = f"Slippage High: {int(diff_points)} pts"
            # print(f"   ⚠️ {msg} (Executing anyway)") 
            # send_ack(api_url, signal_id, "WARNING", 0, msg)
        # else:
            # print(f"   ✅ Price OK")

    # 🛡️ SAFETY CHECK: Verify Account ID matches Credentials
    # This prevents trading on Master account if path isolation failed
    current_account = mt5.account_info()
    creds = fetch_credentials() # Re-verify or use cached? Use current connection check.
    
    if current_account and creds and str(current_account.login) != str(creds['login']):
         print(f"[CRITICAL] ACCOUNT MISMATCH! Expected {creds['login']}, Action on {current_account.login}")
         print("[STOP] BLOCKING ORDER to prevent unauthorized trade.")
         send_ack(api_url, signal_id, "FAILED", 0, "Account Mismatch")
         return

    # Prepare Order
    order_type = mt5.ORDER_TYPE_BUY if trade_type == "BUY" else mt5.ORDER_TYPE_SELL

    request = {
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": symbol,
        "volume": float(volume),
        "type": order_type,
        "price": market_price,
        "deviation": 20, # Tolerance within execution
        "magic": 234000,
        "magic": 234000,
        "magic": 234000,
        "comment": f"CPY:{signal['ticket']}", # Store Master Ticket for precise closing
        "sl": float(signal.get('sl', 0.0)),
        "tp": float(signal.get('tp', 0.0)),
        "type_time": mt5.ORDER_TIME_GTC,
        "type_filling": mt5.ORDER_FILLING_IOC,
    }
    
    # Send
    result = mt5.order_send(request)
    
    if result is None:
        error_code, description = mt5.last_error()
        print(f"[ERROR] Order Send Failed (Result is None). Error: {error_code}, {description}")
        send_ack(api_url, signal_id, "FAILED", 0, f"MT5 Error {error_code}: {description}")
        return

    if result.retcode != mt5.TRADE_RETCODE_DONE:
        print("[ERROR] Order Send Failed:", result.comment)
        send_ack(api_url, signal_id, "FAILED", 0, result.comment)
    else:
        print("[OK] Order Executed:", result.order)
        send_ack(api_url, signal_id, "EXECUTED", result.order, "Filled")

def send_ack(api_url, signal_id, status, ticket, comment):
    try:
        payload = {
            "signalId": signal_id,
            "status": status,
            "ticket": ticket,
            "comment": comment
        }
        requests.post(api_url, json=payload, headers={"x-bridge-secret": BRIDGE_SECRET}, timeout=2)
        print(f"   [ACK] Acknowledged {status}")
    except Exception as e:
        print(f"   [WARN] Ack Failed: {e}")

def find_server():
    print("[INFO] Searching for Signal Server...")
    for host in HOSTS:
        url = get_api_url(host)
        try:
            print(f"   Trying {url}...", end="")
            requests.get(f"{url}?followerId={MY_FOLLOWER_ID}", 
                         headers={"x-bridge-secret": BRIDGE_SECRET}, timeout=3)
            print(" [OK]")
            return url
        except Exception as e:
            print(f" [ERROR] Failed ({e})")
    print("[ERROR] Could not connect to any server.")
    return None

def sync_balance(api_url):
    try:
        # ⚠️ DO NOT re-initialize without path! It can switch terminals.
        # Just check if we are still connected.
        if not mt5.terminal_info(): return
        
        info = mt5.account_info()
        if not info: return

        # Construct Base URL (strip /api/engine/poll)
        base_url = api_url.replace("/api/engine/poll", "/api/user/broker")
        
        payload = {
            "balance": info.balance,
            "equity": info.equity,
            "balance": info.balance,
            "equity": info.equity,
            "leverage": info.leverage,
            "login": info.login
        }
        headers = {
            "x-bridge-secret": BRIDGE_SECRET,
            "x-user-id": MY_FOLLOWER_ID
        }
        # Fire and forget (timeout 1s)
        requests.put(base_url, json=payload, headers=headers, timeout=1)
    except:
        pass # Silent fail is ok for stats

# Avoid duplicate processing
processed_signals = set()
# ⚙️ REDIS CONFIGURATION (Loaded from .env)
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
import redis
r_client = redis.from_url(REDIS_URL)

def run_executor():
    print(f"[START] Executor Started for {MY_FOLLOWER_ID}...")
    print(f"[INFO] Mode: {'DRY RUN (SimulationOnly)' if DRY_RUN else 'LIVE TRADING'}")
    print(f"[INFO] Transport: REDIS PUB/SUB ⚡ (Low Latency)")
    
    api_url = find_server()
    if not api_url:
        print("[WARN] API not found. Reporting (Hooks/Acks) might fail, but Trading will proceed via Redis.")
    
    # 🔗 Connect to Redis Pub/Sub
    try:
        pubsub = r_client.pubsub()
        pubsub.subscribe('channel:all_followers')
        print(f"[OK] Subscribed to Redis Channel: channel:all_followers")
    except Exception as e:
        print(f"[ERROR] Failed to connect to Redis: {e}")
        return

    print("[READY] Waiting for High-Speed Signals... 🚄")

    # 💓 Heartbeat / Balance Sync Thread could go here. 
    # For now, we sync once at start.
    if api_url: sync_balance(api_url)
    
    # 🔄 Event Loop
    for message in pubsub.listen():
        if message['type'] == 'message':
            try:
                # 📨 Parse Signal
                raw_data = message['data']
                signal = json.loads(raw_data)
                
                # 🛡️ IDEMPOTENCY CHECK
                # Use Timestamp-Action-Ticket as ID if no explicit ID
                sig_id = signal.get('id') or f"{signal.get('ticket')}-{signal.get('action')}"
                signal['id'] = sig_id

                if sig_id in processed_signals:
                    continue
                
                processed_signals.add(sig_id)
                
                # ⚡ FAST EXECUTION
                # Note: In a real system, we'd check "Is this signal for me?" 
                # For this High-Scale Demo, we assume we subscribe to the global feed 
                # and execute match logic inside or just execute all (Demo Mode).
                
                # Filter: Only execute if we have a valid Master ID? 
                # For now, let's just Print & Execute to prove the pipe works.
                print(f"[⚡ REDIS SIGNAL] {signal.get('action')} {signal.get('symbol')} (Ticket: {signal.get('ticket')})")
                
                execute_trade(signal, api_url)

            except json.JSONDecodeError:
                print(f"[ERR] Invalid JSON: {message['data']}")
            except Exception as e:
                print(f"[ERR] Processing Failed: {e}")

if __name__ == "__main__":
    initialize_mt5()
    run_executor()
