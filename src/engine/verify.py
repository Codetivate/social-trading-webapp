import MetaTrader5 as mt5
import argparse
import json
import sys
import os

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

if not mt5.initialize(**init_params):
    print(json.dumps({
        "success": False, 
        "error": f"Initialize Failed: {mt5.last_error()}"
    }))
    sys.exit(1)

# Attempt Login
authorized = mt5.login(
    login=args.login, 
    password=args.password, 
    server=args.server
)

if authorized:
    print(json.dumps({"success": True}))
    mt5.shutdown()
    sys.exit(0)
else:
    error_code, error_desc = mt5.last_error()
    print(json.dumps({
        "success": False, 
        "error": f"Login Failed: {error_desc} ({error_code})"
    }))
    mt5.shutdown()
    sys.exit(1)
