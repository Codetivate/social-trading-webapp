#!/bin/bash
set -e

# 1. 📺 START VIRTUAL DISPLAY (Shared X11)
echo "[INIT] Starting Xvfb on :1 (1024x768x16)..."
Xvfb :1 -screen 0 1024x768x16 &
export DISPLAY=:1
sleep 2 # Wait for X server

# 2. 🧬 CLONE TERMINALS
# We expect a valid MT5 installation at /opt/mt5_base.
# Ideally, users mount this volume: -v /path/to/my/mt5:/opt/mt5_base:ro
if [ ! -d "/opt/mt5_base" ] || [ -z "$(ls -A /opt/mt5_base)" ]; then
    echo "[ERROR] /opt/mt5_base is empty! Please mount your MT5 installation directory."
    echo "Usage: docker run -v /c/MT5:/opt/mt5_base ..."
    exit 1
fi

BOT_COUNT=${NUM_BOTS:-4}
echo "[INIT] Spawning $BOT_COUNT Shared-Wine Instances..."

for i in $(seq -f "%02g" 1 $BOT_COUNT); do
    BOT_DIR="/opt/bot_$i"
    
    # Check if already cloned (persistence)
    if [ ! -d "$BOT_DIR" ]; then
        echo "   -> Cloning Instance $i to $BOT_DIR..."
        cp -r /opt/mt5_base "$BOT_DIR"
        
        # Inject Optimization Config (Low RAM)
        cp /opt/optimization.ini "$BOT_DIR/config/common.ini"
    else
        echo "   -> Instance $i exists. Skipping clone."
    fi

    fi

    # 🚀 LAUNCH MT5 (Background)
    # /portable: Keeps data in local dir (crucial for isolation)
    # /common.ini: Applies RAM optimizations
    # WINEDEBUG=-all: Suppress all Wine debug logs to save I/O and CPU
    echo "   -> Starting Terminal $i..."
    WINEDEBUG=-all wine "$BOT_DIR/terminal64.exe" /portable /config:config/common.ini > "/opt/logs/bot_$i.log" 2>&1 &
    
    # Stagger startups to prevent CPU spike (Linear ramp-up)
    sleep 5
done

echo "[INIT] All Terminals Launched!"

# 3. 🧠 START HYDRA SERVICES
echo "[HYDRA] Starting Dispatcher..."
python src/engine/dispatcher.py > /opt/logs/dispatcher.log 2>&1 &

echo "[HYDRA] Starting Worker Service..."
python src/engine/worker_service.py > /opt/logs/worker.log 2>&1 &

# 4. 🧠 START ORCHESTRATOR
# The orchestrator will scan /opt/bot_* and discover the terminals we just launched.
echo "[ORCHESTRATOR] Starting Python Engine..."
exec python src/engine/orchestrator.py
