import logging
import re
from datetime import datetime
from fastapi import HTTPException
from app.core.database import get_db_connection

try:
    import bcrypt as _bcrypt
    _BCRYPT_AVAILABLE = True
except ImportError:
    _BCRYPT_AVAILABLE = False

logger = logging.getLogger(__name__)


def hash_password(plain: str) -> str:
    """Return a bcrypt hash of `plain`. Falls back to plain text if bcrypt unavailable."""
    if _BCRYPT_AVAILABLE:
        return _bcrypt.hashpw(plain.encode("utf-8"), _bcrypt.gensalt()).decode("utf-8")
    return plain  # graceful fallback — use only in local dev


def verify_password(plain: str, stored: str) -> bool:
    """
    Verify `plain` against `stored`.
    Handles two cases:
      1. Stored is a bcrypt hash (starts with '$2b$' or '$2y$').
      2. Stored is a legacy plain-text value (for existing users before migration).
    """
    if not plain or not stored:
        return False
    is_bcrypt_hash = stored.startswith(("$2b$", "$2y$", "$2a$"))
    if is_bcrypt_hash and _BCRYPT_AVAILABLE:
        try:
            return _bcrypt.checkpw(plain.encode("utf-8"), stored.encode("utf-8"))
        except Exception:
            return False
    # Legacy plain-text fallback (allows smooth migration without a forced password reset)
    return plain == stored



def log_auth_event(user_id: str, event_type: str, details: str = ""):
    try:
        conn = get_db_connection()
        timestamp = datetime.now().isoformat()
        conn.execute("INSERT INTO auth_logs (user_id, event_type, timestamp, details) VALUES (?, ?, ?, ?)",
                     (user_id, event_type, timestamp, details))
        conn.commit()
        conn.close()
    except Exception as e:
        logger.error(f"Failed to write auth log: {e}")

def update_user_logout(user_id: str):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        row = cursor.execute("SELECT id, timestamp FROM auth_logs WHERE user_id = ? AND event_type = 'Login Success' AND logout_time IS NULL ORDER BY id DESC LIMIT 1", (user_id,)).fetchone()
        if row:
            log_id = row['id']
            try:
                start_time = datetime.fromisoformat(row['timestamp'])
                end_time = datetime.now()
                duration = int((end_time - start_time).total_seconds() / 60)
                cursor.execute("UPDATE auth_logs SET logout_time = ?, duration_minutes = ? WHERE id = ?", 
                               (end_time.isoformat(), duration, log_id))
                conn.commit()
            except ValueError:
                pass
    except Exception as e:
        logger.error(f"Logout update failed: {e}")
    finally:
        conn.close()

def validate_password_strength(password: str):
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters long.")
    if not any(char.isupper() for char in password):
        raise HTTPException(status_code=400, detail="Password must contain at least one uppercase letter.")
    if not any(char.isdigit() for char in password):
        raise HTTPException(status_code=400, detail="Password must contain at least one number.")
    if not any(not char.isalnum() for char in password):
        raise HTTPException(status_code=400, detail="Password must contain at least one special character.")
    return True

def normalize_and_validate_email(email: str) -> str:
    normalized = (email or "").strip().lower()
    email_pattern = r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$"
    if not re.match(email_pattern, normalized):
        raise HTTPException(status_code=400, detail="Invalid email format.")
    return normalized

def mask_email(email: str) -> str:
    try:
        local, domain = email.split("@", 1)
        if len(local) <= 2:
            masked_local = local[0] + "*"
        else:
            masked_local = local[0] + ("*" * (len(local) - 2)) + local[-1]
        return f"{masked_local}@{domain}"
    except Exception:
        return email

def normalize_registration_role(role: str) -> str:
    raw = (role or "").strip().lower()
    role_map = {
        "student": "Student",
        "teacher": "Teacher",
        "parent": "Parent",
        "admin": "Admin",
        "tenant_admin": "Tenant_Admin",
        "principal": "Tenant_Admin",
        "finance_admin": "Root_Super_Admin",
        "academic_admin": "Academic_Admin",
        "hr_admin": "HR_Admin",
        "root_super_admin": "Root_Super_Admin",
        "parent_guardian": "Parent_Guardian",
    }
    normalized = role_map.get(raw)
    if not normalized:
        raise HTTPException(status_code=400, detail="Invalid role selected.")
    return normalized
