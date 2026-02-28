import time
import logging
from fastapi import Request, HTTPException, status
from app.core.caching import redis_client, _local_fallback_cache

logger = logging.getLogger(__name__)

class RateLimiter:
    """
    Dependency for FastAPI endpoints to rate limit requests.
    Uses Redis if available, otherwise falls back to local memory.
    """
    def __init__(self, max_requests: int = 5, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window_seconds = window_seconds

    def __call__(self, request: Request):
        # Extract client IP (or forwarded IP if behind proxy)
        client_ip = request.client.host if request.client else "127.0.0.1"
        if "X-Forwarded-For" in request.headers:
            client_ip = request.headers["X-Forwarded-For"].split(",")[0].strip()
        
        # Determine the endpoint being accessed
        path = request.url.path
        
        # Rate limit key
        key = f"rate_limit:{client_ip}:{path}"
        
        if redis_client:
            try:
                # Atomically increment the counter
                current_requests = redis_client.incr(key)
                
                # If this is the first request in the window, set the expiration
                if current_requests == 1:
                    redis_client.expire(key, self.window_seconds)
                
                # Check against the limit
                if current_requests > self.max_requests:
                    logger.warning(f"Rate limit exceeded for {client_ip} on {path}. Attempt: {current_requests}")
                    raise HTTPException(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        detail="Too many requests. Please try again later."
                    )
            except HTTPException:
                raise
            except Exception as e:
                logger.error(f"Redis rate limiting error: {e}")
                # Fail open if Redis crashes so we don't block legitimate users entirely
                pass
        else:
            # Fallback local in-memory rate limiting
            now = time.time()
            entry = _local_fallback_cache.get(key)
            if entry is None or (now - entry['ts']) >= self.window_seconds:
                # Reset or create new window
                _local_fallback_cache[key] = {'count': 1, 'ts': now}
            else:
                _local_fallback_cache[key]['count'] += 1
                if _local_fallback_cache[key]['count'] > self.max_requests:
                    logger.warning(f"Local Rate limit exceeded for {client_ip} on {path}. Attempt: {_local_fallback_cache[key]['count']}")
                    raise HTTPException(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        detail="Too many requests. Please try again later."
                    )

from typing import List
from fastapi import Header, HTTPException
from app.core.database import get_db_connection
from app.core.auth_utils import log_auth_event
ROLE_PERMISSIONS = {
    "Admin": [
        "view_dashboard", "manage_users", "manage_invitations",
        "view_all_grades", "edit_all_grades",
        "schedule_active_class", "manage_groups", "view_audit_logs",
        "assignment_view", "assignment_create", "assignment_grade",
        "view_permissions", "edit_permissions", "permission_management",
        "staff_view", "finance_view", "finance_dashboard_read", "finance_reports_read",
        "finance_gl_manage", "finance_receivables_manage", "finance_payables_manage",
        "finance_payroll_manage", "role_management",
        # RBAC management permissions (legacy fallback)
        "view_role_management", "add_roles", "edit_roles", "delete_roles",
        "user_management"
    ],
    "Principal": [
        "view_dashboard", "manage_users", "manage_invitations",
        "view_all_grades", "edit_all_grades",
        "schedule_active_class", "manage_groups", "view_audit_logs",
        "assignment_view", "assignment_create", "assignment_grade",
        "view_permissions", "edit_permissions", "permission_management",
        "staff_view", "finance_view", "finance_dashboard_read", "finance_reports_read",
        "role_management",
        # RBAC management (read-only for Principal)
        "view_role_management"
    ],
    "Tenant_Admin": [
        "view_dashboard", "manage_users", "manage_invitations",
        "view_all_grades", "edit_all_grades",
        "view_permissions", "edit_permissions", "permission_management",
        "finance_view", "finance_dashboard_read", "finance_reports_read",
        "finance_gl_manage", "finance_receivables_manage", "finance_payables_manage",
        "finance_payroll_manage", "role_management",
        "view_role_management", "add_roles", "edit_roles", "delete_roles",
        "user_management", "staff_view"
    ],
    "Teacher": [
        "view_dashboard", "invite_students",
        "view_all_grades", "edit_all_grades",
        "schedule_active_class", "manage_groups",
        "assignment_view", "assignment_create", "assignment_grade",
        "finance_payroll_self_read"
    ],
    "Student": [
        "view_dashboard", "view_own_grades", "join_active_class",
        "finance_fees_self_read"
    ],
    "Parent": [
        "view_dashboard", "view_child_grades",
        "finance_fees_child_read"
    ],
    "Parent_Guardian": [
        "view_dashboard", "view_child_grades",
        "finance_fees_child_read"
    ]
}

def check_permission(user_role: str, required_permission: str) -> bool:
    if user_role not in ROLE_PERMISSIONS:
        return False
    return required_permission in ROLE_PERMISSIONS[user_role]

async def verify_permission(permission: str, x_user_role: str = Header(None, alias="X-User-Role"), x_user_id: str = Header(None, alias="X-User-Id")):
    if not x_user_id:
         raise HTTPException(status_code=401, detail="Authentication required")

    # Special bypass for the hardcoded Root Admin account (not in students table)
    if x_user_id == "rootadmin":
        return True

    conn = get_db_connection()
    try:
        user = conn.execute("SELECT role, is_super_admin FROM students WHERE id = ?", (x_user_id,)).fetchone()
        
        if not user:
            # Also try case-insensitive lookup (handles ID casing differences between DBs)
            user = conn.execute(
                "SELECT role, is_super_admin FROM students WHERE LOWER(id) = LOWER(?)",
                (x_user_id,)
            ).fetchone()
        
        if not user:
            # User ID was provided but doesn't exist — this is a 403 (forbidden),
            # NOT a 401 (unauthenticated). The request has an identity but no access.
            log_auth_event(x_user_id, "Unauthorized Access", f"User ID not found in system, permission: {permission}")
            raise HTTPException(status_code=403, detail="Access denied: user identity not recognized.")

        current_role = user['role']
        is_super = user['is_super_admin']

        # 1. Super Admin Override
        if is_super or current_role in ('Super Admin', 'Root_Super_Admin'):
            return True

        # 2. Check DB Permissions via user_roles table
        # Join user_roles -> roles -> role_permissions -> permissions
        # Also check for wildcard '*' permission assignment
        query = """
            SELECT 1 
            FROM user_roles ur
            JOIN role_permissions rp ON ur.role_id = rp.role_id
            JOIN permissions p ON rp.permission_id = p.id
            WHERE ur.user_id = ? 
            AND (p.code = ? OR p.code = '*')
        """
        has_perm = conn.execute(query, (x_user_id, permission)).fetchone()

        if not has_perm:
            # Also check via role name directly in roles table (for users assigned by role name)
            role_query = """
                SELECT 1
                FROM roles r
                JOIN role_permissions rp ON r.id = rp.role_id
                JOIN permissions p ON rp.permission_id = p.id
                WHERE r.name = ?
                AND (p.code = ? OR p.code = '*')
            """
            has_perm = conn.execute(role_query, (current_role, permission)).fetchone()

        if not has_perm:
            # Fallback to legacy hardcoded check (temporary migration bridge)
            if current_role in ROLE_PERMISSIONS and permission in ROLE_PERMISSIONS[current_role]:
                return True
                
            log_auth_event(x_user_id, "Unauthorized Access", f"Missing permission: {permission}")
            raise HTTPException(status_code=403, detail=f"Permission denied: {permission} required.")
        
        return True
    finally:
        conn.close()

async def verify_any_permission(permission_codes: List[str], x_user_id: str) -> str:
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    denied = None
    for code in permission_codes:
        try:
            await verify_permission(code, x_user_id=x_user_id)
            return code
        except HTTPException as e:
            denied = e
            if e.status_code == 401:
                raise
            continue
    if denied:
        raise denied
    raise HTTPException(status_code=403, detail="Permission denied.")
