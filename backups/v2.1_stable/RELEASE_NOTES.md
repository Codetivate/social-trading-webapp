# Hydra Engine v2.1 (Stable Release)
**Release Date:** 2026-01-09
**Status:** STABLE - CRITICAL FIXES APPLIED

## 🚀 Key Improvements

### 1. Auto-Reconnect & Standby Mode
- **Previous Behavior:** If the broker disconnected (or API returned 404), the `executor.py` script would terminate immediately for safety, requiring manual restart.
- **V2.1 Fix:** The engine now enters a **Standby Loop** (`[WAIT] ⏳ Waiting for Broker Connection...`). It pauses synchronized operations but stays alive. As soon as connectivity is restored in the Dashboard, it resumes automatically.

### 2. "Ghost Buster" Cycle Restoration
- **Problem:** A logic bug (`continue` statement) in the main loop caused the engine to SKIP maintenance tasks (Ghost Check, Balance Sync) whenever it processed a signal. This led to "missed closes" during active trading.
- **V2.1 Fix:** The execution loop was restructured to ensure maintenance tasks run **every cycle**, regardless of signal volume. This guarantees that open trades are reconciled (Ghost Busted) within 2-3 seconds.

### 3. Strengthened Self-Healing
- **Problem:** When a Ticket Map was missing (e.g., after restart), the "Self-Heal" scan would give up if the terminal was busy (Lock contention), leading to failed closures.
- **V2.1 Fix:** Changed lock acquisition to `blocking=True` with a timeout. The engine now waits patiently for the terminal to be free before scanning, ensuring it always finds the trade.

### 4. Immediate Data Sync
- **Feature:** On clicking "Connect", the system now performs a deep fetch (via `verify.py`) to grab:
  - Real-time Balance & Equity
  - Historical Deals (for initial population)
- This ensures the UI is populated instantly upon connection.

### 5. Disconnect Logic
- **Feature:** "Disconnect" action now explicitly sets DB status to `DISCONNECTED` for ALL associated accounts, preventing "Ghost Sessions".

## 📂 Backup Manifest
This folder contains the stable snapshots of:
- `executor.py`: Main Engine Logic
- `broadcaster.py`: Master Signal Source
- `hft_executor.py`: High-Frequency Dispatcher
- `verify.py`: Validation Utility
- `route.ts`: API Endpoint for Broker Data
- `user.ts`: Disconnect/Connect Actions
