# Hydra Core Engine v1.1 Release Notes
**Date:** 2026-01-07
**Status:** Stable Release

## 🚀 Key Improvements

### 1. Robust "Ghost Buster" Protocol
- **Issue:** Previously, `executor.py` would silently fail to close "Ghost Trades" (trades closed by Master but missed by Follower) if the MT5 account was not perfectly aligned.
- **Fix:** 
    - Enhanced `executor.py` to capture and **print** the result of the `process_batch` operation during Ghost Close events.
    - This exposes "Account Drift" errors (e.g., `❌ CRITICAL: Account Drift!`) to the console, allowing the user to take immediate action.
    - The Ghost Buster now checks Redis History (`history:master:xxx:closed`) *before* relying on live position scanning, reducing false positives during startup.

### 2. Log Hygiene (Spam Reduction)
- **Issue:** The console was flooded with repetitive debug logs like `Fetching ALL subscriptions...` and `Credentials received...`.
- **Fix:** 
    - Silenced the high-frequency debug print in `executor.py` (line 157).
    - Reduced verbosity of credential fetching in `sync_balance` operations.
    - Console is now cleaner, highlighting only critical events (Signals, Execution, Errors).

### 3. Execution Safety Guards
- **Feature:** Reinforced the "Last-Mile Safety Check" in `hft_executor.py`.
- **Mechanism:** Before firing ANY trade (Open, Close, Modify), the worker thread verifies that the **currently active MT5 login** matches the **expected follower ID**.
- **Benefit:** Prevents catastrophic cross-account execution if the Shared Terminal is manually switched or taken over by another process.

### 4. Unified Sync Logic (SL/TP Parity)
- **Issue:** Previous Catch-up logic was fragmented, handling "Missing Trades" but ignoring "Modified Trades" (SL/TP changes) efficiently.
- **Fix:** Implemented a **Unified Sync Loop** in `executor.py` that handles both:
    1. **Catch-up OPEN:** Identifying and opening missing trades.
    2. **Catch-up MODIFY:** Detecting SL/TP drift (> 0.0001) and forcing synchronization.

## 📂 Version Manifest

| Component | Version | Status |
| :--- | :--- | :--- |
| **Orchestrator** | `v1.1` | Stable |
| **Broadcaster** | `v1.1` | Stable (Unified Protocol) |
| **Executor** | `v1.1` | Stable |
| **HFT Engine** | `v1.1` | Internal |

## 📦 Backup Location
A snapshot of this release has been stored at:
`src/engine/backups/v1.1/`

---
*Run with `python orchestrator.py` to start the engine.*
