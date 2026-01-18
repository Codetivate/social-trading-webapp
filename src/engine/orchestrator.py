
import subprocess
import time
import os
import signal
import sys
import psycopg2
from dotenv import load_dotenv

# 📥 Load Config
load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
API_SECRET = os.getenv("API_SECRET", "AlphaBravoCharlieDeltaEchoFoxtro")

# 🔒 POSTGRES CONNECTION POOL
from psycopg2 import pool
PG_POOL = None
try:
    if DATABASE_URL:
        PG_POOL = pool.SimpleConnectionPool(minconn=1, maxconn=5, dsn=DATABASE_URL)
        print("[OK] Orchestrator DB Pool Initialized.")
except Exception as e:
    print(f"[ERROR] Failed to init DB Pool: {e}")

import atexit
def cleanup():
    try:
        if PG_POOL: PG_POOL.closeall()
    except: pass
atexit.register(cleanup)

# 🏗️ Registry of Running Processes: { "userId": subprocess.Popen }
workers = {}

def get_db_connection():
    if not PG_POOL: return psycopg2.connect(DATABASE_URL)
    return PG_POOL.getconn()

def close_db_connection(conn):
    if not conn: return
    try:
        if PG_POOL: PG_POOL.putconn(conn)
        else: conn.close()
    except: pass

def fetch_active_accounts():
    """
    Fetch all users who are approved and should be connected.
    Ideally, we also join with a 'BrokerRegistry' to get the MT5 Path.
    For this MVP, we might hardcode or infer paths.
    """
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        # Fetch users with active broker accounts + Role
        # 🚀 ONLY SPAWN BROADCASTERS (Masters)
        # Followers are handled by the HFT Swarm (executor.py --mode TURBO)
        query = """
            SELECT b."userId", b."login", b."mt5Path", u."role"
            FROM "BrokerAccount" b
            JOIN "User" u ON b."userId" = u."id"
            WHERE b."status" = 'CONNECTED'
              AND u."role" = 'MASTER' 
        """ 
        cur.execute(query)
        accounts = cur.fetchall()
        cur.close()
        conn.close()
        return accounts # List of (userId, login, mt5Path, role)
    except Exception as e:
        print(f"[ERROR] DB Fetch Failed: {e}")
        return []
    finally:
        close_db_connection(conn)

# 🏭 TERMINAL FACTORY & MANAGER
class TerminalManager:
    def __init__(self):
        self.pool = [] # List of available paths
        self.assigned = {} # { user_id: terminal_path }
        self.manual_overrides = {} # { user_id: terminal_path } (From DB)
        self.discover_terminals()
        
    def discover_terminals(self):
        """Scans common paths for MT5 installations"""
        print("[INIT] Scanning for MetaTrader 5 Terminals...")
        
        # USER SPECIFIED TERMINALS (Priority)
        KNOWN_TARGETS = [
            r"C:\Program Files\Vantage International MT5\terminal64.exe", # 🚨 User Request Priority
            r"C:\Program Files\MetaTrader 5 EXNESS\terminal64.exe",
            r"C:\Program Files\MetaTrader 5 EXNESS 002\terminal64.exe",
            r"C:\Program Files\MetaTrader 5 EXNESS 003\terminal64.exe"
        ]
        
        # ☁️ CLOUD GRID PARTITION (MASTERS)
        # Instances 01-04 reserved for Masters. 05-20 reserved for HFT.
        for i in range(1, 5):
            grid_path = f"C:\\MT5_Instance_{i:02d}\\terminal64.exe"
            if os.path.exists(grid_path):
                 KNOWN_TARGETS.append(grid_path)
        
        potential_roots = [
            os.environ.get("ProgramFiles", "C:\\Program Files"),
            os.environ.get("ProgramFiles(x86)", "C:\\Program Files (x86)")
        ]

        # 🐧 LINUX / DOCKER SUPPORT
        if os.name == 'posix':
            potential_roots = ["/opt", "/root/.wine/drive_c/Program Files"]
        
        found = set()
        
        # 0. Add Known Targets
        for kt in KNOWN_TARGETS:
            if os.path.exists(kt):
                found.add(os.path.normpath(kt))

        # 1. Check Env Var Override FIRST (HFT Engine Isolation)
        env_mt5 = os.getenv("MT5_PATH_ARG") or os.getenv("MT5_PATH")
        if env_mt5 and os.path.exists(env_mt5):
            norm_env = os.path.normpath(env_mt5)
            found.add(norm_env)
            # 🛑 CRITICAL: Reserve this for HFT Engine so Masters don't steal it
            print(f"[INIT] Adding {norm_env} to Pool (Shared Mode).")
            # self.assigned['HFT_ENGINE'] = norm_env # 🔓 DISABLED for Single-Terminal Mode
            
        # 2. Scan Directories
        for root in potential_roots:
            if not os.path.exists(root): continue
            try:
                for d in os.listdir(root):
                    # Windows: Look for "MetaTrader", "Exness", "XM"
                    # Linux/Docker: Look for "bot_" prefix (e.g. /opt/bot_01)
                    if "MetaTrader" in d or "Exness" in d or "MT5" in d or d.startswith("bot_"):
                        full_path = os.path.join(root, d, "terminal64.exe")
                        if os.path.exists(full_path):
                            found.add(os.path.normpath(full_path))
            except Exception as e:
                print(f"[WARN] Scan Error in {root}: {e}")

        # 3. Sort Pool (Priority: Known Targets -> EXNESS -> Others)
        def priority_sort(path):
            norm = os.path.normpath(path)
            # 1. Exact Match in KNOWN
            for i, kt in enumerate(KNOWN_TARGETS):
                if os.path.normpath(kt) == norm:
                    return i # 0, 1, 2...
            # 2. Contains "EXNESS"
            if "EXNESS" in norm.upper():
                return 100
            # 3. Others
            return 999
            
        self.pool = sorted(list(found), key=priority_sort)
        print(f"[INFO] Discovered {len(self.pool)} Terminals (Sorted):")
        for t in self.pool:
            print(f"   -> {t}")
        
    def allocate(self, user_id, manual_path=None):
        """Allocates a terminal to a user. Returns Path or None if full."""
        # 1. Manual Override from DB
        if manual_path and os.path.exists(manual_path):
            norm = os.path.normpath(manual_path)
            # Check if occupied by SOMEONE ELSE
            owner = self._get_owner(norm)
            if owner and owner != user_id:
                print(f"[CONFLICT] User {user_id} requested {norm}, but owned by {owner}.")
                return None # Conflict
            self.assigned[user_id] = norm
            return norm

        # 2. Existing Assignment (Sticky)
        if user_id in self.assigned:
            return self.assigned[user_id]
            
        # 3. Allocating New from Pool
        # Find unused terminal
        used_paths = set(self.assigned.values())
        for t in self.pool:
            if t not in used_paths:
                self.assigned[user_id] = t
                print(f"[ALLOC] Assigned {t} to User {user_id}")
                return t
                
        # 4. Limit Reached
        print(f"[LIMIT] ❌ No terminals available for User {user_id}. Max Cap: {len(self.pool)}")
        return None

    def release(self, user_id):
        if user_id in self.assigned:
            print(f"[FREE] Releasing Terminal for User {user_id}")
            del self.assigned[user_id]
            
    def _get_owner(self, path):
        for u, p in self.assigned.items():
            if p == path: return u
        return None

# Global Singleton
TERMINAL_MGR = TerminalManager()

def spawn_worker(user_id, login, mt5_path, role):
    """
    Spawns a new Worker (Broadcaster) based on User Role.
    """
    if role != 'MASTER':
        # print(f"[SKIP] Ignoring Non-Master Role: {role} (Handled by HFT Swarm)")
        return

    # 🛑 SCALABILITY CHECK: Allocate Terminal
    assigned_term = TERMINAL_MGR.allocate(user_id, mt5_path)
    if not assigned_term:
        print(f"[SKIP] Cannot spawn Master {user_id} (No Terminal Available). Please install more MT5 instances.")
        return

    script_type = "BROADCASTER"
    script_file = "src/engine/broadcaster.py"
    
    print(f"[Spawn] Starting {script_type} for User {user_id} (Login: {login}) on {assigned_term}...")
    
    cmd = [
        sys.executable, script_file,
        "--user-id", str(user_id),
        "--secret", API_SECRET,
        "--mt5-path", assigned_term # FORCE ASSIGNED PATH
    ]
    
    # Spawn Process
    try:
        p = subprocess.Popen(cmd, shell=False) 
        workers[user_id] = p
        print(f"[OK] {script_type} PID:{p.pid} started for {user_id}")
    except Exception as e:
        print(f"[ERROR] Failed to spawn {script_type}: {e}")
        TERMINAL_MGR.release(user_id) # Release on failure

def monitor_and_heal():
    """
    Main Loop: Syncs desired state (DB) with actual state (Processes).
    """
    print("Orchestrator: Monitoring Grid...")
    
    while True:
        try:
            # 1. Get Desired State
            active_accounts = fetch_active_accounts()
            active_user_ids = {row[0] for row in active_accounts}
            
            # 2. Prune Dead Workers
            crashed_ids = []
            for uid, proc in workers.items():
                if proc.poll() is not None: # Process exited
                    print(f"[WARN] Worker for {uid} died/exited with code {proc.returncode}")
                    crashed_ids.append(uid)
            
            for uid in crashed_ids:
                del workers[uid]

            # 3. Spawn New/Recovered Workers
            for row in active_accounts:
                uid, login, mt5_path, role = row
                if uid not in workers:
                    spawn_worker(uid, login, mt5_path, role)
            
# ...
            # 4. Stop Removed Workers
            to_stop = []
            for uid in workers:
                if uid not in active_user_ids:
                    print(f"[STOP] User {uid} no longer active. Stopping worker...")
                    workers[uid].terminate()
                    to_stop.append(uid)
            
            for uid in to_stop:
                del workers[uid]

            # 5. 🛡️ SPAWN SENTINEL SERVICE (Global Monitor)
            # 🛑 DISABLED (User Request): Removed to reduce overhead.
            # Ensures PnL/Equity/Risk checks run independently of Broadcasters.
            # global monitor_process
            # if monitor_process is None or monitor_process.poll() is not None:
            #     print("[ORCHESTRATOR] Spawning Hydra Sentinel (Monitor Service)...")
            #     monitor_cmd = [sys.executable, "src/engine/monitor_service.py"]
            #     try:
            #         # New console window for visibility
            #         # On Windows, we can use creationflags=subprocess.CREATE_NEW_CONSOLE to verify it runs
            #         # But simpler is just spawn.
            #         monitor_process = subprocess.Popen(monitor_cmd, shell=False)
            #         print(f"[OK] Sentinel Started PID:{monitor_process.pid}")
            #     except Exception as e:
            #         print(f"[ERROR] Failed to spawn Sentinel: {e}")

            time.sleep(5) 

        except KeyboardInterrupt:
            print("Shutting down Orchestrator...")
            for uid, proc in workers.items():
                proc.terminate()
            if monitor_process:
                monitor_process.terminate()
            break
        except Exception as e:
            print(f"[ERROR] Loop Error: {e}")
            time.sleep(5)

if __name__ == "__main__":
    print("hydra-orchestrator v1.3 (Sentinel Managed)")
    monitor_process = None
    monitor_and_heal()
