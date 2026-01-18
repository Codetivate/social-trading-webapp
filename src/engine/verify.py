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
parser.add_argument('--otp', type=str, help='One-Time Password', default="")
parser.add_argument('--mt5-path', type=str, help='Path to terminal64.exe', default="")

args = parser.parse_args()

# Initialize MT5
init_params = {}
if args.mt5_path and os.path.exists(args.mt5_path):
    init_params['path'] = args.mt5_path
else:
    # 🧠 HEURISTIC: Auto-detect Path from Server Name (The "Real Architecture" Fix)
    # USER REQUEST: "Only Vantage first" -> We default to Vantage if no other match.
    DEFAULT_PATH = r"C:\Program Files\Vantage International MT5\terminal64.exe"
    
    TERMINAL_MAP = {
        "Vantage": r"C:\Program Files\Vantage International MT5\terminal64.exe",
        "PiSecurities": r"C:\Program Files\Vantage International MT5\terminal64.exe", # Force Pi -> Vantage
        "Exness": r"C:\Program Files\Vantage International MT5\terminal64.exe", # Force Exness -> Vantage (Per user request "Only Vantage")
    }
    
    found_path = False
    for key, path in TERMINAL_MAP.items():
        if key.lower() in args.server.lower() and os.path.exists(path):
            sys.stderr.write(f"DEBUG: Auto-Selected Terminal for {args.server}: {path}\n")
            init_params['path'] = path
            found_path = True
            break
            
    if not found_path and os.path.exists(DEFAULT_PATH):
        sys.stderr.write(f"DEBUG: No specific map found. Defaulting to Vantage Terminal: {DEFAULT_PATH}\n")
        init_params['path'] = DEFAULT_PATH

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
if not acquire_lock(timeout=15):
    print(json.dumps({"success": False, "error": "Could not acquire Terminal Lock"}))
    sys.exit(1)

try:
    max_retries = 2
    retry_count = 0
    initialized = False

    while retry_count < max_retries:
        if mt5.initialize(**init_params):
            initialized = True
            break
        else:
            retry_count += 1
            time.sleep(0.5)

    if not initialized:
        print(json.dumps({
            "success": False, 
            "error": f"Initialize Failed: {mt5.last_error()}"
        }))
        sys.exit(1) # handled by finally

    # ⚡ FAST PATH: Check if already logged in (With Stabilization)
    authorized = False # Default to False
    # Give terminal a moment to report status after init hook
    start_chk = time.time()
    current_account = None
    
    while time.time() - start_chk < 3.0: 
        current_account = mt5.account_info()
        if current_account and current_account.login == args.login:
             sys.stderr.write(f"DEBUG: Already logged in to {args.login}. Skipping auth.\n")
             authorized = True
             break
        time.sleep(0.5)
        
    if not authorized:
        if current_account:
             sys.stderr.write(f"DEBUG: Session Mismatch. Current: {current_account.login} | Target: {args.login}\n")
        else:
             sys.stderr.write(f"DEBUG: No active session detected (Info is None). Proceeding to Login...\n")
        
        # Attempt Login
        authorized = False
    if not authorized:
        if args.otp:
            clean_otp = args.otp.strip()
            # 🚀 OTP PRIORITY MODE
            # sys.stderr.write(f"DEBUG: Attempting OTP Login. PassLen={len(args.password)} OTPLen={len(clean_otp)}\n")
            authorized = mt5.login(
                login=args.login, 
                password=args.password + clean_otp, 
                server=args.server
            )
            if not authorized:
                 sys.stderr.write(f"DEBUG: OTP Login Failed. Code: {mt5.last_error()}\n")
        else:
            # Standard Login
            authorized = mt5.login(
                login=args.login, 
                password=args.password, 
                server=args.server
            )

    # 🤖 ROBOT LOGIN FALLBACK (For Error -7 / OTP Blocked)
    if not authorized and args.otp:
        last_error = mt5.last_error()
        # Code -7 (Unsupported authorization mode) or similar 2FA blocks
        if last_error[0] == -7 or "authorization" in last_error[1].lower():
            sys.stderr.write(f"DEBUG: API Login Blocked ({last_error}). Triggering ROBOT_FINGER...\n")
            
            try:
                import pyautogui
                
                # 1. Focus Terminal
                # Assuming window title contains "MetaTrader 5" or the Server Name
                # Windows only:
                import ctypes
                user32 = ctypes.windll.user32
                # Force window to foreground (Simple approach: Alt+Tab or Click center)
                # Ideally, we rely on the fact that mt5.initialize() often brings it up.
                
                # 2. Open Login Dialog (File -> Login)
                # Hotkey: Usually Insert or just standard menu. 
                # Let's try Generic flow: File (Alt+F) -> Login (L)
                sys.stderr.write("DEBUG: RF -> Opening Dialog...\n")
                pyautogui.hotkey('alt', 'f')
                time.sleep(0.5)
                pyautogui.press('l') # Login to Trade Account
                time.sleep(1.0)
                
                # 3. Enter Credentials
                # Dialog usually starts at LOGIN field focused.
                sys.stderr.write("DEBUG: RF -> Typing Credentials...\n")
                pyautogui.write(str(args.login))
                pyautogui.press('tab')
                pyautogui.write(args.password)
                
                # OPTIMIZATION: Do NOT press Tab here. 
                # Pressing Enter on Password field typically triggers "OK" (Submit).
                # Pressing Tab usually moves focus to "Save Password" check.
                pyautogui.press('enter') 
                
                # 4. Check for OTP Field (Is it Login -> Pass -> Save -> OTP?)
                # If OTP field exists, we tab to it. If it's a popup AFTER, we press Enter first.
                # VANTAGE OPTION A: OTP is in the main dialog (3rd field).
                # VANTAGE OPTION B: OTP is a second popup.
                
                # Attempt A (Assume 3rd field)
                # Save Password check? usually 3rd. OTP 4th?
                # Let's try: Login -> Tab -> Pass -> Enter -> Wait -> OTP -> Enter
                
                sys.stderr.write("DEBUG: RF -> Sent Login. Waiting for OTP prompt...\n")
                time.sleep(2.0)
                
                # 5. Type OTP (Blindly, into whatever popped up)
                pyautogui.write(clean_otp)
                pyautogui.press('enter')
                
                # 6. Verify Success (Polling Loop)
                sys.stderr.write("DEBUG: RF -> Sequence Complete. Polling for session match...\n")
                
                for _ in range(10): # Wait up to 10s (OTP auth is slow)
                    time.sleep(1.0)
                    info = mt5.account_info()
                    if info and info.login == args.login:
                         authorized = True
                         sys.stderr.write("DEBUG: ROBOT_FINGER SUCCESS! 🤖✅\n")
                         break
                    else:
                         current = info.login if info else "None"
                         sys.stderr.write(f"DEBUG: Waiting... Current: {current} | Target: {args.login}\n")
                    
            except ImportError:
                sys.stderr.write("DEBUG: PyAutoGUI not installed. Cannot use Robot Finger.\n")
            except Exception as e:
                sys.stderr.write(f"DEBUG: Robot Finger Failed: {e}\n")


    if authorized:
        info = mt5.account_info()
        
        # � NOTE: We do NOT import historical trades here.
        # Trades are tracked in real-time by the Broadcaster starting from connection.
        # This ensures we only record trades made AFTER joining the platform.
        
        payload = {
            "success": True,
            "data": {
                "balance": float(info.balance),
                "equity": float(info.equity),
                "leverage": int(info.leverage),
                "currency": info.currency,
                "name": info.name,
                "history": []  # Empty - tracking starts from now
            }
        }
        print(json.dumps(payload))
        sys.exit(0)
    else:
        # Final Error Report
        error_code, error_desc = mt5.last_error()
        print(json.dumps({
            "success": False, 
            "error": f"Login Failed: {error_desc} ({error_code})"
        }))
        sys.exit(1)

except Exception as e:
    print(json.dumps({"success": False, "error": f"Unexpected Error: {e}"}))
    sys.exit(1)

finally:
    # 🔓 ALWAYS RELEASE LOCK
    # NOTE: If we successfully logged in via GUI, we DO NOT want to shutdown terminal.
    # But if we were just verifying, shutdown might kill the GUI session?
    # mt5.shutdown() disconnects the binding, doesn't kill process if it was already running.
    if initialized: mt5.shutdown()
    release_lock()
