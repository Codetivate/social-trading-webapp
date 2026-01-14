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
    # 📊 FETCH INITIAL DATA
    info = mt5.account_info()
    
    # 📜 FETCH HISTORY
    # Fetch from beginning (0) to Now
    # Note: history_deals_get returns tuples/objects
    deals = mt5.history_deals_get(0, datetime.now() + timedelta(days=1)) 
    
    history_list = []
    if deals:
        for d in deals:
            # Only track actual trades (Entry In/Out/InOut)
            if d.entry in [mt5.DEAL_ENTRY_IN, mt5.DEAL_ENTRY_OUT, mt5.DEAL_ENTRY_INOUT]:
                history_list.append({
                    "ticket": str(d.ticket),
                    "order": str(d.order),
                    "time": int(d.time), # Unix Timestamp
                    "type": d.type, 
                    "entry": d.entry,
                    "symbol": d.symbol,
                    "volume": float(d.volume),
                    "price": float(d.price),
                    "profit": float(d.profit),
                    "swap": float(d.swap),
                    "commission": float(d.commission),
                    "comment": d.comment
                })
    
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
    sys.exit(0)
else:
    error_code, error_desc = mt5.last_error()
    print(json.dumps({
        "success": False, 
        "error": f"Login Failed: {error_desc} ({error_code})"
    }))
    mt5.shutdown()
    sys.exit(1)
