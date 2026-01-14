# 🐳 High-Density Docker MT5 (Shared-Wine)

This setup runs multiple MT5 instances in a **single Docker container** using a shared Wine kernel.
Designed for **4GB RAM** hosts to support **8-12 Users** with Persistent Logins (Zero-Latency).

## 📂 Architecture

- **Base Image**: `python:3.9-slim`
- **Wine**: Shared Kernel (Efficient RAM)
- **Xvfb**: Headless Display `:1`
- **Orchestrator**: Manages processes inside the container

## 🚀 Setup Guide

### 1. Prepare Base MT5
You need a "Clean" installed version of MT5 folder (e.g., usually `C:\Program Files\MetaTrader 5`).
Copy this folder to your server, e.g., to `/home/user/mt5_base`.

### 2. Build Image
```bash
docker build -t mt5-hydra -f deployment/docker/Dockerfile .
```

### 3. Run Container
Map your base MT5 folder and set the number of bots (e.g., 8).

```bash
docker run -d \
  --name hydra-engine \
  --restart always \
  --env NUM_BOTS=8 \
  --env DATABASE_URL="postgresql://..." \
  --env REDIS_URL="redis://..." \
  -v /home/user/mt5_base:/opt/mt5_base:ro \
  -v ./logs:/opt/logs \
  mt5-hydra
```

### 4. Verification
The container will:
1.  Clone `/opt/mt5_base` -> `/opt/bot_01`, `/opt/bot_02`...
2.  Start them in background.
3.  Start `orchestrator.py`.
4.  Orchestrator will discover 8 terminals.
5.  It will assign Users to Terminals (One-to-One).

### ⚡ Optimization Notes
- **MaxBars=1000**: Pre-configured in `optimization.ini` to save RAM.
- **Shared Wine**: Saves ~500MB RAM vs separate containers.
- **Projected Capacity**: ~250MB per bot. 8 Bots = ~2GB RAM + OS overhead. Safe for 4GB VPS.
