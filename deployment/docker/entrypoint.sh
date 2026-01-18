#!/bin/bash
set -e

# 0. Cleanup Old Locks (Fixes "Server already active" error)
rm -f /tmp/.X1-lock
rm -f /tmp/.X11-unix/X1

# 1. Start Virtual Display (Xvfb)
Xvfb :1 -screen 0 640x480x8 &
export DISPLAY=:1
# Force Encoding to avoid UnicodeEncodeError in Wine
export PYTHONIOENCODING=utf-8
export LANG=C.UTF-8
echo "[HYDRA] Display :1 started"

# 2. MT5 Setup (First Run Only)
BASE_DIR="/opt/mt5_base"
if [ ! -d "$BASE_DIR" ]; then
    echo "[HYDRA] Installing MT5 Base..."
    mkdir -p $BASE_DIR
    wget -q -O mt5setup.exe https://download.mql5.com/cdn/web/metaquotes.software.corp/mt5/mt5setup.exe
    WINEPREFIX=$BASE_DIR wine mt5setup.exe /auto &
    PID=$!
    sleep 30
    echo "[HYDRA] MT5 Install Logic Complete (Shim)"
    # Refined logic needed here for actual install wait, but this works for shim
fi

# 3. Install Python in Wine (Crucial for MetaTrader5 Lib)
WINE_PYTHON="/root/.wine/drive_c/Program Files/Python39/python.exe"
if [ ! -f "$WINE_PYTHON" ]; then
    echo "[HYDRA] Installing Python for Windows (inside Wine)..."
    wget -q https://www.python.org/ftp/python/3.9.13/python-3.9.13-amd64.exe
    wine python-3.9.13-amd64.exe /quiet InstallAllUsers=1 PrependPath=1 Include_test=0
    
    echo "[HYDRA] Waiting for Python install..."
    sleep 45 # Give it time to settle
    
    # Install Deps in Wine
    echo "[HYDRA] Installing Dependencies in Wine..."
    # Force reinstall of deps including psycopg2-binary
    wine pip install --no-cache-dir MetaTrader5 redis requests python-dotenv psutil psycopg2-binary colorama cryptography pytz
fi

# 4. Start Python Engine (via Wine)
echo "[HYDRA] Starting Orchestrator (Master Manager)..."
wine python src/engine/orchestrator.py &
ORCH_PID=$!

echo "[HYDRA] Starting Executor (Follower Swarm)..."
# Force install deps on every startup to catch misses (lightweight if cached)
wine pip install psycopg2-binary --quiet

wine python src/engine/executor.py --mode TURBO
