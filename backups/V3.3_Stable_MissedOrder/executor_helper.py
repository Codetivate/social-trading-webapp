
def verify_master_history_closure(master_id, master_ticket_str, from_ts=0):
    """
    Checks if a ticket exists in the Master's Closed History (Redis Set).
    Returns True if confirmed closed.
    """
    if not r_client: return False
    
    # 1. Check Fast Set (O(1))
    # Broadcaster adds to this set immediately upon detecting close.
    key = f"history:master:{master_id}:closed"
    if r_client.sismember(key, str(master_ticket_str)):
        return True
        
    # 2. (Optional) Check Stream? 
    # For now, Set is the primary source of truth for "Recently Closed"
    return False
