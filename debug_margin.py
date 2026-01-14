import MetaTrader5 as mt5
import time

if not mt5.initialize():
    print("Init failed")
    exit()

sym = "GOLD"
info = mt5.symbol_info(sym)
if not info:
    print(f"{sym} not found. Trying XAUUSD")
    sym = "XAUUSD"
    info = mt5.symbol_info(sym)

if info:
    print(f"Symbol: {sym}")
    print(f"Contract Size: {info.trade_contract_size}")
    print(f"Margin Init: {info.margin_initial}")
    print(f"Margin Maint: {info.margin_maintenance}")
    print(f"Currency Margin: {info.currency_margin}")
else:
    print("Symbol not found")
mt5.shutdown()
