from fastapi import APIRouter, HTTPException, Depends, Request, Header, BackgroundTasks
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
import time
import base64
import secrets
import hashlib
import hmac
import uuid
import os
import requests
import logging
import random
import sqlite3
from urllib.parse import quote

from app.core.database import get_db_connection
from app.core.security import RateLimiter
from app.core.config import (
    TEACHER_LOGIN_ALIAS, ADMIN_LOGIN_EMAIL, ADMIN_LOGIN_PASSWORD,
    SMTP_EMAIL, STUDENT_OTP_EMAIL_OVERRIDES, PARENT_OTP_EMAIL_OVERRIDES,
    STUDENT_LOGIN_ALIASES, PARENT_LOGIN_ALIASES, ALLOW_OTP_CONSOLE_FALLBACK,
    VERIFICATION_TOKEN_TTL_HOURS, VERIFICATION_LINK_BASE, GOOGLE_CLIENT_ID
)
# from backend import send_email, REQUESTS_IMPORT_ERROR # Circular import risk removed

# We might need to import these from a utils file, but for now we'll mock or keep them
# Since they are in backend.py, we either import them from backend (circular import risk) 
# or move them. 
# We will create a router here.
router = APIRouter(tags=["Authentication"])


from app.models.schemas import (
    LoginResponse, LoginRequest, Verify2FARequest, RegisterRequest,
    GenericSocialRequest, ForgotPasswordRequest, ResetPasswordRequest,
    AuthenticatorSetupRequest, SocialTokenRequest
)
from app.core.auth_utils import (
    log_auth_event, validate_password_strength, normalize_and_validate_email,
    normalize_registration_role, mask_email, hash_password, verify_password
)

logger = logging.getLogger(__name__)

# --- We will need to redefine or import log_auth_event, validate_password_strength etc. ---
def _ensure_authenticator_table(conn) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS user_authenticator_secrets (
            user_id TEXT PRIMARY KEY,
            secret_key TEXT NOT NULL,
            is_enabled BOOLEAN DEFAULT FALSE,
            created_at TEXT,
            updated_at TEXT,
            FOREIGN KEY (user_id) REFERENCES students(id) ON DELETE CASCADE
        )
        """
    )
    conn.commit()

def _generate_totp_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode("utf-8").replace("=", "")

def _normalize_base32_secret(secret_key: str) -> bytes:
    clean = (secret_key or "").strip().replace(" ", "").upper()
    if not clean:
        return b""
    padding = "=" * ((8 - len(clean) % 8) % 8)
    return base64.b32decode(clean + padding, casefold=True)

def _totp_for_counter(secret_key: str, counter: int, digits: int = 6) -> str:
    key = _normalize_base32_secret(secret_key)
    if not key:
        return ""
    msg = counter.to_bytes(8, byteorder="big")
    h = hmac.new(key, msg, hashlib.sha1).digest()
    offset = h[-1] & 0x0F
    binary = ((h[offset] & 0x7F) << 24) | ((h[offset + 1] & 0xFF) << 16) | ((h[offset + 2] & 0xFF) << 8) | (h[offset + 3] & 0xFF)
    return str(binary % (10 ** digits)).zfill(digits)

def _verify_totp_code(secret_key: str, submitted_code: str, step_seconds: int = 30, skew_steps: int = 1) -> bool:
    code = "".join(ch for ch in str(submitted_code or "") if ch.isdigit())
    if len(code) != 6:
        return False
    counter = int(time.time() // step_seconds)
    for delta in range(-skew_steps, skew_steps + 1):
        if _totp_for_counter(secret_key, counter + delta) == code:
            return True
    return False

@router.post("/api/auth/login", response_model=LoginResponse, dependencies=[Depends(RateLimiter(max_requests=5, window_seconds=60))])
async def login_user(request: LoginRequest, background_tasks: BackgroundTasks):
    # Reload .env on each login so auth toggles (like ENABLE_2FA) take effect immediately.
    from dotenv import load_dotenv
    env_path_local = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    load_dotenv(dotenv_path=env_path_local, override=True)
    teacher_login_alias = os.getenv("TEACHER_LOGIN_ALIAS", TEACHER_LOGIN_ALIAS)
    admin_login_email = os.getenv("ADMIN_LOGIN_EMAIL", ADMIN_LOGIN_EMAIL)
    admin_login_password = os.getenv("ADMIN_LOGIN_PASSWORD", ADMIN_LOGIN_PASSWORD)
    root_admin_login_email = admin_login_email
    root_admin_login_password = admin_login_password
    logger.info(f"Login attempt for user: {request.username}")
    conn = get_db_connection()
    cursor = conn.cursor()

    username_clean = request.username.strip()
    username_lower = username_clean.lower()
    if username_lower == teacher_login_alias.lower():
        lookup_username = "teacher"
    elif (
        (admin_login_email and username_lower == admin_login_email.lower())
        or (root_admin_login_email and username_lower == root_admin_login_email.lower())
    ):
        lookup_username = "rootadmin" if request.role.strip() == "Root_Super_Admin" else "admin"
    else:
        # Prefer exact identifier match first. This prevents alias IDs from shadowing
        # direct email-based accounts when both records exist in legacy datasets.
        exact_user = cursor.execute(
            "SELECT id FROM students WHERE LOWER(id) = LOWER(?)",
            (username_clean,),
        ).fetchone()
        if exact_user:
            lookup_username = exact_user["id"]
        else:
            alias_candidates = STUDENT_LOGIN_ALIASES.get(username_lower) or PARENT_LOGIN_ALIASES.get(username_lower)
            if alias_candidates:
                if isinstance(alias_candidates, str):
                    alias_candidates = (alias_candidates,)
                lookup_username = username_clean
                for candidate_id in alias_candidates:
                    found_alias_user = cursor.execute(
                        "SELECT id FROM students WHERE LOWER(id) = LOWER(?)",
                        (candidate_id,),
                    ).fetchone()
                    if found_alias_user:
                        lookup_username = found_alias_user["id"]
                        break
            else:
                lookup_username = username_clean
    
    logger.info(f"DEBUG LOGIN: username_lower={username_lower} | teacher_login_alias={teacher_login_alias} | lookup={lookup_username}")
    # Case-insensitive username lookup
    user = cursor.execute(
        "SELECT id, name, password, role, failed_login_attempts, locked_until, is_super_admin, school_id, email_verified FROM students WHERE LOWER(id) = LOWER(?)",
        (lookup_username,)
    ).fetchone()

    # Backward compatibility fallback: if Root Admin alias user is not present, reuse existing Admin/email user.
    if not user and lookup_username == "rootadmin":
        user = cursor.execute(
            "SELECT id, name, password, role, failed_login_attempts, locked_until, is_super_admin, school_id, email_verified FROM students WHERE LOWER(id) = LOWER('admin')",
        ).fetchone()
    if not user and request.role.strip() == "Root_Super_Admin":
        user = cursor.execute(
            "SELECT id, name, password, role, failed_login_attempts, locked_until, is_super_admin, school_id, email_verified FROM students WHERE LOWER(id) = LOWER(?)",
            (username_clean,),
        ).fetchone()

    if not user:
        conn.close()
        with open("login_debug.txt", "a") as f:
            f.write(f"Login Failed: User {request.username} not found\n")
        logger.warning(f"Login failed for user: {request.username} - User not found")
        log_auth_event(request.username, "Login Failed", "User not found")
        raise HTTPException(status_code=401, detail="Invalid credentials.")

    auth_user_id = user["id"]
    login_email = None
    if "@" in auth_user_id:
        login_email = auth_user_id
    elif auth_user_id == "teacher":
        login_email = teacher_login_alias
    elif auth_user_id in ("admin", "rootadmin"):
        login_email = root_admin_login_email or admin_login_email or SMTP_EMAIL
    elif auth_user_id in STUDENT_OTP_EMAIL_OVERRIDES:
        login_email = STUDENT_OTP_EMAIL_OVERRIDES[auth_user_id]
    elif auth_user_id in PARENT_OTP_EMAIL_OVERRIDES:
        login_email = PARENT_OTP_EMAIL_OVERRIDES[auth_user_id]

    # If an email-based alias was used for login, prefer that for OTP delivery.
    if (username_lower in STUDENT_LOGIN_ALIASES or username_lower in PARENT_LOGIN_ALIASES) and "@" in username_clean:
        login_email = username_clean

    if not bool(user["email_verified"]):
        conn.close()
        log_auth_event(auth_user_id, "Login Failed", "Email not verified")
        raise HTTPException(status_code=403, detail="Email not verified. Please verify your account before logging in.")

    # Enforce Role Match with normalized role aliases to avoid UI label drift.
    allow_login = False
    db_role = user['role'].strip()
    req_role = request.role.strip()

    def normalize_role_name(role_name: str) -> str:
        normalized = (role_name or "").strip().lower().replace("_", " ")
        role_aliases = {
            "principal": "tenant admin",
            "tenant admin": "tenant admin",
            "admin": "root super admin",
            "super admin": "root super admin",
            "superadmin": "root super admin",
            "root super admin": "root super admin",
            "parent": "parent guardian",
            "parent guardian": "parent guardian",
        }
        return role_aliases.get(normalized, normalized)

    db_role_norm = normalize_role_name(db_role)
    req_role_norm = normalize_role_name(req_role)

    if db_role_norm == req_role_norm:
        allow_login = True
    elif db_role_norm == "root super admin" and req_role_norm == "root super admin":
        allow_login = True
    elif db_role_norm == "tenant admin" and req_role_norm == "tenant admin":
        allow_login = True
    
    # Special case: 'teacher' user might be Teacher title but lower in DB or vice versa
    if user['id'] == 'teacher' and req_role == 'Teacher':
        allow_login = True
        
    if not allow_login:
        conn.close()
        debug_msg = f"Role mismatch for {request.username}. DB={db_role}, Req={req_role}"
        with open("login_debug.txt", "a") as f:
            f.write(f"Login Failed: {debug_msg}\n")
        logger.warning(debug_msg)
        log_auth_event(auth_user_id, "Login Failed", f"Role Mismatch: Tried {req_role} as {db_role}")
        raise HTTPException(status_code=403, detail=f"Access Denied: You are registered as a {db_role}, not a {req_role}.")

    # Check Account Lockout
    if user['locked_until']:
        lock_time = datetime.fromisoformat(user['locked_until'])
        if datetime.now() < lock_time:
            conn.close()
            remaining_min = int((lock_time - datetime.now()).total_seconds() / 60)
            log_auth_event(auth_user_id, "Login Failed", "Account locked")
            raise HTTPException(status_code=403, detail=f"Account locked. Try again in {remaining_min + 1} minutes.")
        else:
            cursor.execute("UPDATE students SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?", (auth_user_id,))
            conn.commit()

    # Password Verification (bcrypt-aware, with seamless legacy plain-text fallback)
    if verify_password(request.password, user['password']):
        cursor.execute("UPDATE students SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?", (auth_user_id,))

        # Auto-upgrade plain-text password to bcrypt hash on first successful login
        stored = user['password']
        if not stored.startswith(("$2b$", "$2y$", "$2a$")):
            try:
                new_hash = hash_password(request.password)
                cursor.execute("UPDATE students SET password = ? WHERE id = ?", (new_hash, auth_user_id))
                conn.commit()
                logger.info(f"Password upgraded to bcrypt for user: {auth_user_id}")
            except Exception as _upg_err:
                logger.warning(f"Password upgrade failed for {auth_user_id}: {_upg_err}")
        
        # --- RBAC SYNC LOGIC (Preserve legacy migration) ---
        legacy_role_name = user['role']
        
        # 1. Sync Legacy Role if needed (Migration on Login)
        user_roles_check = cursor.execute("SELECT role_id FROM user_roles WHERE user_id = ?", (auth_user_id,)).fetchall()
        
        if not user_roles_check:
             # Get Role ID (Handle 'Admin' -> 'Super Admin' mapping if needed, or just match name)
             target_role = legacy_role_name
             if target_role == 'Super Admin':
                 target_role = 'Root_Super_Admin'
             
             # Get Role ID
             role_row = cursor.execute("""
                 SELECT r.id 
                 FROM roles r
                 LEFT JOIN role_permissions rp ON r.id = rp.role_id
                 WHERE r.name = ?
                 GROUP BY r.id
                 ORDER BY COUNT(rp.permission_id) DESC
                 LIMIT 1
             """, (target_role,)).fetchone()
             
             if role_row:
                 try:
                    cursor.execute("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)", (auth_user_id, role_row['id']))
                    conn.commit()
                 except:
                    pass 

        # --- 2FA / EMAIL OTP FLOW ---
        ENABLE_2FA = os.getenv("ENABLE_2FA", "false").lower() == "true"
        tenant_auth_mode = "password_only"
        try:
            sec_row = cursor.execute(
                "SELECT auth_mode FROM institution_security_settings WHERE school_id = ?",
                (user["school_id"] if user["school_id"] else 1,)
            ).fetchone()
            if sec_row and sec_row["auth_mode"]:
                tenant_auth_mode = sec_row["auth_mode"]
        except Exception:
            tenant_auth_mode = "password_only"

        if tenant_auth_mode == "authenticator_app":
            try:
                _ensure_authenticator_table(conn)
                auth_row = cursor.execute(
                    "SELECT user_id, secret_key, is_enabled FROM user_authenticator_secrets WHERE user_id = ?",
                    (auth_user_id,)
                ).fetchone()
                if not auth_row:
                    now_iso = datetime.now().isoformat()
                    cursor.execute(
                        """
                        INSERT INTO user_authenticator_secrets (user_id, secret_key, is_enabled, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?)
                        """,
                        (auth_user_id, _generate_totp_secret(), False, now_iso, now_iso)
                    )
                    conn.commit()
                log_auth_event(auth_user_id, "2FA Required", "Authenticator app verification required")
                conn.close()
                return LoginResponse(
                    user_id=user['id'],
                    success=True,
                    requires_2fa=True,
                    email_masked=mask_email(login_email) if login_email else None,
                    security_mode=tenant_auth_mode
                )
            except HTTPException:
                conn.close()
                raise
            except Exception as e:
                conn.close()
                logger.error(f"Authenticator setup check failed: {e}")
                raise HTTPException(status_code=500, detail="Unable to initialize authenticator setup.")

        require_email_otp = (
            ENABLE_2FA
            or tenant_auth_mode == "email_otp"
            or auth_user_id in ("teacher", "admin")
            or username_lower in STUDENT_LOGIN_ALIASES
            or auth_user_id in STUDENT_OTP_EMAIL_OVERRIDES
            or username_lower in PARENT_LOGIN_ALIASES
            or auth_user_id in PARENT_OTP_EMAIL_OVERRIDES
        )

        # Trigger email OTP when enabled (or privileged account) and recipient email exists.
        if require_email_otp and login_email:
            # Generate Code
            otp_code = str(random.randint(100000, 999999))
            
            # Store in DB (backup_codes used as OTP storage)
            try:
                cursor.execute("DELETE FROM backup_codes WHERE user_id = ?", (auth_user_id,))
                cursor.execute("INSERT INTO backup_codes (user_id, code, created_at) VALUES (?, ?, ?)", 
                            (auth_user_id, otp_code, datetime.now().isoformat()))
                conn.commit()
                
                # Send Email
                from backend import send_email
                background_tasks.add_task(send_email, login_email, "Your Verification Code", f"Your code is: {otp_code}")
                
                if ALLOW_OTP_CONSOLE_FALLBACK:
                    logger.warning(
                        f"2FA email queued for {auth_user_id} to {login_email}. "
                        f"Terminal fallback OTP: {otp_code}"
                    )
                
                logger.info(f"2FA Code queued for {auth_user_id}")
                log_auth_event(auth_user_id, "2FA Required", f"OTP queued for {login_email}")
                
                conn.close()
                return LoginResponse(
                    user_id=user['id'], 
                    success=True,
                    requires_2fa=True,
                    email_masked=mask_email(login_email),
                    security_mode=tenant_auth_mode
                )
            except HTTPException:
                conn.close()
                raise
            except Exception as e:
                conn.close()
                logger.error(f"2FA Generation Error: {e}")
                raise HTTPException(status_code=500, detail="Unable to generate 2FA verification code.")
        elif require_email_otp and not login_email:
            conn.close()
            logger.error(f"2FA configured but no recipient email mapped for user {auth_user_id}")
            raise HTTPException(status_code=500, detail="2FA is enabled but no recipient email is configured for this account.")
        
        # --- NORMAL LOGIN (2FA Skipped) ---
        user_dict = dict(user)
        role = user_dict.get('role', 'Student')
        school_name = "Independent"
        school_id = user_dict.get('school_id', 1)
        is_super_admin = user_dict.get('is_super_admin', False)
        
        if school_id:
            sch = cursor.execute("SELECT name FROM schools WHERE id = ?", (school_id,)).fetchone()
            if sch: school_name = sch['name']

        # Fetch RBAC Data
        # 1. Fetch Assigned Roles
        roles_data = cursor.execute("""
            SELECT r.name 
            FROM roles r 
            JOIN user_roles ur ON r.id = ur.role_id 
            WHERE ur.user_id = ?
        """, (auth_user_id,)).fetchall()
        role_names = [r['name'] for r in roles_data]
        
        # Fallback
        if not role_names:
            role_names = [role]

        # 2. Fetch Permissions
        perms_data = cursor.execute("""
            SELECT DISTINCT p.code 
            FROM permissions p
            JOIN role_permissions rp ON p.id = rp.permission_id
            JOIN user_roles ur ON rp.role_id = ur.role_id
            WHERE ur.user_id = ?
        """, (auth_user_id,)).fetchall()
        perm_codes = [p['code'] for p in perms_data]

        # Root_Super_Admin always gets wildcard permissions
        if role in ('Root_Super_Admin', 'Super Admin') or bool(is_super_admin):
            perm_codes = ['*']
            is_super_admin = True  # ensure flag is set

        related_student_id = None
        try:
            if 'Parent' in role_names or 'Parent_Guardian' in role_names or role == 'Parent':
                 child = cursor.execute("SELECT student_id FROM guardians WHERE LOWER(email) = LOWER(?)", (auth_user_id,)).fetchone()
                 if not child and auth_user_id in PARENT_OTP_EMAIL_OVERRIDES:
                     child = cursor.execute("SELECT student_id FROM guardians WHERE LOWER(email) = LOWER(?)", (PARENT_OTP_EMAIL_OVERRIDES[auth_user_id],)).fetchone()
                 if not child and login_email:
                     child = cursor.execute("SELECT student_id FROM guardians WHERE LOWER(email) = LOWER(?)", (login_email,)).fetchone()
                 if child:
                     related_student_id = child['student_id']
        except Exception as e:
            logger.error(f"Error fetching related student for login: {e}")

        conn.close()
        logger.info(f"Login successful for {auth_user_id}, 2FA skipped.")
        
        return LoginResponse(
            user_id=user['id'], 
            name=user_dict.get('name'),
            role=role, 
            roles=role_names,
            permissions=perm_codes,
            requires_2fa=False,
            school_id=school_id,
            school_name=school_name,
            is_super_admin=bool(is_super_admin),
            related_student_id=related_student_id,
            security_mode=tenant_auth_mode
        )

    else:
        new_attempts = (user['failed_login_attempts'] or 0) + 1
        if new_attempts >= 5: 
            lockout_duration = datetime.now() + timedelta(minutes=15)
            cursor.execute("UPDATE students SET failed_login_attempts = ?, locked_until = ? WHERE id = ?", 
                           (new_attempts, lockout_duration.isoformat(), auth_user_id))
            conn.commit()
            conn.close()
            logger.warning(f"Account locked for user: {auth_user_id}")
            log_auth_event(auth_user_id, "Account Locked", "Too many failed attempts")
            raise HTTPException(status_code=403, detail="Account locked. Too many failed attempts.")
        else:
            cursor.execute("UPDATE students SET failed_login_attempts = ? WHERE id = ?", (new_attempts, auth_user_id))
            conn.commit()
            conn.close()
            remaining = 5 - new_attempts
            logger.warning(f"Login failed for user: {auth_user_id} - Invalid password.")
            log_auth_event(auth_user_id, "Login Failed", f"Invalid password.")
            log_auth_event(auth_user_id, "Login Failed", f"Invalid password.")
            raise HTTPException(status_code=401, detail=f"Invalid credentials. {remaining} attempts remaining.")


@router.post("/api/auth/verify-2fa", response_model=LoginResponse, dependencies=[Depends(RateLimiter(max_requests=5, window_seconds=60))])
async def verify_backup_code(request: Verify2FARequest):
    conn = get_db_connection()
    cursor = conn.cursor()

    user = cursor.execute("SELECT * FROM students WHERE id = ?", (request.user_id,)).fetchone()
    if not user:
        conn.close()
        raise HTTPException(status_code=404, detail="User not found.")

    school_id = user["school_id"] if user["school_id"] else 1
    tenant_auth_mode = "password_only"
    try:
        sec = cursor.execute(
            "SELECT auth_mode FROM institution_security_settings WHERE school_id = ?",
            (school_id,)
        ).fetchone()
        if sec and sec["auth_mode"]:
            tenant_auth_mode = sec["auth_mode"]
    except Exception:
        tenant_auth_mode = "password_only"

    verified = False
    if tenant_auth_mode == "authenticator_app":
        try:
            _ensure_authenticator_table(conn)
            row = cursor.execute(
                "SELECT secret_key, is_enabled FROM user_authenticator_secrets WHERE user_id = ?",
                (request.user_id,)
            ).fetchone()
            if row and _verify_totp_code(row["secret_key"], request.code):
                verified = True
                if not bool(row["is_enabled"]):
                    cursor.execute(
                        "UPDATE user_authenticator_secrets SET is_enabled = ?, updated_at = ? WHERE user_id = ?",
                        (True, datetime.now().isoformat(), request.user_id)
                    )
                    conn.commit()
        except Exception:
            verified = False
    else:
        code_entry = cursor.execute(
            "SELECT code FROM backup_codes WHERE user_id = ? AND code = ?",
            (request.user_id, request.code)
        ).fetchone()
        verified = bool(code_entry)

    if not verified:
        conn.close()
        log_auth_event(request.user_id, "2FA Failed", "Invalid or used code")
        raise HTTPException(status_code=401, detail="Invalid one-time code.")
        
    # cursor.execute("DELETE FROM backup_codes WHERE user_id = ? AND code = ?", (request.user_id, request.code))
    user_dict = dict(user)
    role = user_dict.get('role', 'Student')
    school_name = "Independent"
    school_id = user_dict.get('school_id', 1)
    is_super_admin = user_dict.get('is_super_admin', False)

    if school_id:
            sch = cursor.execute("SELECT name FROM schools WHERE id = ?", (school_id,)).fetchone()
            if sch: school_name = sch['name']

    # Fetch RBAC Data
    # 1. Fetch Assigned Roles
    roles_data = cursor.execute("""
        SELECT r.name 
        FROM roles r 
        JOIN user_roles ur ON r.id = ur.role_id 
        WHERE ur.user_id = ?
    """, (request.user_id,)).fetchall()
    role_names = [r['name'] for r in roles_data]
    
    # Fallback
    if not role_names:
        role_names = [role]

    # 2. Fetch Permissions
    perms_data = cursor.execute("""
        SELECT DISTINCT p.code 
        FROM permissions p
        JOIN role_permissions rp ON p.id = rp.permission_id
        JOIN user_roles ur ON rp.role_id = ur.role_id
        WHERE ur.user_id = ?
    """, (request.user_id,)).fetchall()
    perm_codes = [p['code'] for p in perms_data]

    # Root_Super_Admin always gets wildcard permissions
    if role in ('Root_Super_Admin', 'Super Admin') or bool(is_super_admin):
        perm_codes = ['*']
        is_super_admin = True

    related_student_id = None
    try:
        if 'Parent' in role_names or 'Parent_Guardian' in role_names or role in ('Parent', 'Parent_Guardian'):
            child = cursor.execute(
                "SELECT student_id FROM guardians WHERE LOWER(email) = LOWER(?) ORDER BY id DESC LIMIT 1",
                (request.user_id,),
            ).fetchone()
            if not child and request.user_id in PARENT_OTP_EMAIL_OVERRIDES:
                child = cursor.execute(
                    "SELECT student_id FROM guardians WHERE LOWER(email) = LOWER(?) ORDER BY id DESC LIMIT 1",
                    (PARENT_OTP_EMAIL_OVERRIDES[request.user_id],),
                ).fetchone()
            if child:
                related_student_id = child['student_id']
    except Exception as e:
        logger.error(f"Error fetching related student for 2FA: {e}")

    conn.commit()
    conn.close()
    
    logger.info(f"2FA Successful for user: {request.user_id}")
    log_auth_event(request.user_id, "Login Success", "2FA Verified")

    return LoginResponse(
        user_id=request.user_id,
        name=user_dict.get('name'),
        role=role, 
        roles=role_names,
        permissions=perm_codes,
        requires_2fa=False,
        school_id=school_id,
        school_name=school_name,
        is_super_admin=bool(is_super_admin),
        related_student_id=related_student_id,
        security_mode=tenant_auth_mode
    )

@router.post("/api/auth/authenticator/setup")
async def setup_authenticator(request: AuthenticatorSetupRequest):
    user_id = (request.user_id or "").strip()
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required.")

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        user = cursor.execute("SELECT id, school_id FROM students WHERE id = ?", (user_id,)).fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User not found.")

        school_id = user["school_id"] if user["school_id"] else 1
        sec = cursor.execute(
            "SELECT auth_mode FROM institution_security_settings WHERE school_id = ?",
            (school_id,)
        ).fetchone()
        auth_mode = (sec["auth_mode"] if sec and sec["auth_mode"] else "password_only").strip()
        if auth_mode != "authenticator_app":
            raise HTTPException(status_code=400, detail="Authenticator setup is not enabled for this institution.")

        _ensure_authenticator_table(conn)
        row = cursor.execute(
            "SELECT secret_key, is_enabled FROM user_authenticator_secrets WHERE user_id = ?",
            (user_id,)
        ).fetchone()
        now_iso = datetime.now().isoformat()
        if row:
            secret_key = (row["secret_key"] or "").strip() or _generate_totp_secret()
            if not row["secret_key"]:
                cursor.execute(
                    "UPDATE user_authenticator_secrets SET secret_key = ?, updated_at = ? WHERE user_id = ?",
                    (secret_key, now_iso, user_id)
                )
                conn.commit()
            is_enabled = bool(row["is_enabled"])
        else:
            secret_key = _generate_totp_secret()
            cursor.execute(
                """
                INSERT INTO user_authenticator_secrets (user_id, secret_key, is_enabled, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (user_id, secret_key, False, now_iso, now_iso)
            )
            conn.commit()
            is_enabled = False

        issuer = "ClassBridge"
        account = user_id
        otpauth_url = f"otpauth://totp/{issuer}:{account}?secret={secret_key}&issuer={issuer}&algorithm=SHA1&digits=6&period=30"
        qr_url = "https://chart.googleapis.com/chart?cht=qr&chs=220x220&chl=" + quote(otpauth_url, safe="")
        return {
            "message": "Authenticator setup ready.",
            "user_id": user_id,
            "secret_key": secret_key,
            "otpauth_url": otpauth_url,
            "qr_url": qr_url,
            "is_enabled": is_enabled
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unable to load authenticator setup: {str(e)}")
    finally:
        conn.close()

@router.post("/api/auth/register", status_code=201, dependencies=[Depends(RateLimiter(max_requests=5, window_seconds=60))])
async def register_user(request: RegisterRequest, background_tasks: BackgroundTasks):
    email = normalize_and_validate_email(request.email)
    selected_role = normalize_registration_role(request.role)
    validate_password_strength(request.password)

    conn = get_db_connection()
    try:
        cursor = conn.cursor()

        if request.invitation_token:
            invite = cursor.execute(
                "SELECT * FROM invitations WHERE token = ? AND is_used = 0",
                (request.invitation_token,)
            ).fetchone()
            if not invite:
                raise HTTPException(status_code=400, detail="Invalid or used invitation token.")
            if datetime.now() > datetime.fromisoformat(invite['expires_at']):
                raise HTTPException(status_code=400, detail="Invitation expired.")
            invite_role = normalize_registration_role(invite["role"])
            if invite_role != selected_role:
                raise HTTPException(status_code=400, detail="Token does not match the requested role.")
            cursor.execute("UPDATE invitations SET is_used = 1 WHERE token = ?", (request.invitation_token,))
             
        # Validate School ID if provided
        school_id = request.school_id or 1
        if school_id != 1: # If not default, check if exists
            sch = cursor.execute("SELECT id FROM schools WHERE id = ?", (school_id,)).fetchone()
            if not sch:
                 raise HTTPException(status_code=400, detail="Invalid School ID selected.")

        if cursor.execute("SELECT id FROM students WHERE LOWER(id) = LOWER(?)", (email,)).fetchone():
            raise HTTPException(status_code=400, detail="User ID/Email already exists.")

        verification_token = secrets.token_urlsafe(32)
        verification_expires_at = (datetime.now() + timedelta(hours=VERIFICATION_TOKEN_TTL_HOURS)).isoformat()

        # Insert User with School ID
        cursor.execute(
            """
            INSERT INTO students (
                id, name, grade, preferred_subject, attendance_rate, home_language, password,
                role, school_id, is_super_admin, email_verified, email_verification_token, email_verification_expires_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                email, request.name, request.grade, request.preferred_subject,
                100.0, "English", hash_password(request.password), selected_role, school_id, 0, 0, verification_token, verification_expires_at
            ) 
        )

        verification_link = f"{VERIFICATION_LINK_BASE}/api/auth/verify-email?token={verification_token}"
        email_body = f"""
        <p>Hello {request.name},</p>
        <p>Welcome to Noble Nexus. Please verify your email to activate your account.</p>
        <p><a href="{verification_link}">Verify Email</a></p>
        <p>This link expires in {VERIFICATION_TOKEN_TTL_HOURS} hours.</p>
        """
        from backend import send_email
        background_tasks.add_task(send_email, email, "Verify your Noble Nexus account", email_body)

        conn.commit()
        log_auth_event(email, "Register Success", f"Role: {selected_role}, School: {school_id}, Email verification pending")
        return {"message": "Registration successful. Please verify your email to activate your account."}
    except sqlite3.IntegrityError:
        log_auth_event(email, "Register Failed", "User ID already exists")
        raise HTTPException(status_code=400, detail="User ID already exists.")
    except Exception as e:
        conn.rollback()
        log_auth_event(email, "Register Failed", f"Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Registration failed: {str(e)}")
    finally:
        conn.close()

@router.get("/api/auth/verify-email")
async def verify_email(token: str):
    if not token or len(token.strip()) < 20:
        raise HTTPException(status_code=400, detail="Invalid verification token.")

    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        user = cursor.execute(
            """
            SELECT id, email_verification_expires_at, email_verified
            FROM students
            WHERE email_verification_token = ?
            """,
            (token.strip(),)
        ).fetchone()
        if not user:
            raise HTTPException(status_code=400, detail="Invalid verification token.")

        if bool(user["email_verified"]):
            return {"message": "Email already verified. Your account is active."}

        expires_at = user["email_verification_expires_at"]
        if not expires_at or datetime.now() > datetime.fromisoformat(expires_at):
            raise HTTPException(status_code=400, detail="Verification token has expired.")

        cursor.execute(
            """
            UPDATE students
            SET email_verified = TRUE,
                email_verification_token = NULL,
                email_verification_expires_at = NULL
            WHERE id = ?
            """,
            (user["id"],)
        )
        conn.commit()
        log_auth_event(user["id"], "Email Verified", "Account activated by verification link")
        return {"message": "Email verified successfully. Your account is now active."}
    finally:
        conn.close()


@router.post("/api/auth/google-login", response_model=LoginResponse)
async def google_login(request: SocialTokenRequest):
    logger.info(f"Processing Google Login...")
    if requests is None:
        from backend import REQUESTS_IMPORT_ERROR
        raise HTTPException(status_code=503, detail=f"Google login unavailable: requests import failed ({REQUESTS_IMPORT_ERROR})")
    
    # 1. Verify Token with Google
    try:
        # Use Google's tokeninfo endpoint to verify the ID token
        response = requests.get(f"https://oauth2.googleapis.com/tokeninfo?id_token={request.token}")
        
        if response.status_code != 200:
             logger.error(f"Google Token Check Failed: {response.text}")
             raise HTTPException(status_code=401, detail="Invalid Google Token")
        
        google_data = response.json()
        
        # 2. Verify Audience matches our Client ID
        if google_data['aud'] != GOOGLE_CLIENT_ID:
             logger.error(f"Audience Mismatch: {google_data['aud']}")
             raise HTTPException(status_code=401, detail="Token audience mismatch")
             
        user_email = google_data['email']
        user_name = google_data.get('name', 'Google User') # Use real name from Google
        
    except Exception as e:
        logger.error(f"Google Login Error: {e}")
        raise HTTPException(status_code=401, detail=f"Google Authentication Failed.")

    # 3. Handle User in Database
    conn = get_db_connection()
    user = conn.execute("SELECT id, role FROM students WHERE id = ?", (user_email,)).fetchone()
    
    role = 'Student'
    if user:
         role = user['role']
    else:
        # Auto-register new user from Google
        conn.execute("INSERT INTO students (id, name, grade, preferred_subject, attendance_rate, home_language, password, math_score, science_score, english_language_score, role, school_id, is_super_admin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                     (user_email, user_name, 9, "Science", 100.0, "English", "social_login", 0.0, 0.0, 0.0, 'Student', 1, False))
        conn.commit()
        log_auth_event(user_email, "Register Success", "Google Auto-Register")
    
    conn.close()
    
    log_auth_event(user_email, "Login Success", "Google Login")
    return LoginResponse(
        user_id=user_email, 
        role=role, 
        school_id=1, 
        school_name="Independent", 
        is_super_admin=False
    )

@router.post("/api/auth/microsoft-login", response_model=LoginResponse)
async def microsoft_login(request: SocialTokenRequest):
    logger.info("Processing Microsoft Login")
    if requests is None:
        from backend import REQUESTS_IMPORT_ERROR
        raise HTTPException(status_code=503, detail=f"Microsoft login unavailable: requests import failed ({REQUESTS_IMPORT_ERROR})")
    
    # Check if this is a Simulated Token (starts with 'token_')
    if request.token.startswith("token_"):
        # Extract unique part from simulated token for uniqueness
        unique_suffix = request.token.split("_")[-1] if "_" in request.token else str(random.randint(1000,9999))
        user_email = f"ms_user_{unique_suffix}@example.com"
        user_name = f"Microsoft User {unique_suffix}"
    else:
        # REAL TOKEN LOGIC: Verify via Microsoft Graph API
        # The frontend sends an Access Token for Graph API (User.Read scope).
        # We verify it by successfully calling the /me endpoint.
        try:
            graph_response = requests.get(
                "https://graph.microsoft.com/v1.0/me",
                headers={"Authorization": f"Bearer {request.token}"}
            )
            
            if graph_response.status_code != 200:
                 logger.error(f"Graph API Failed: {graph_response.text}")
                 raise HTTPException(status_code=401, detail="Invalid Microsoft Token")

            graph_data = graph_response.json()
            # Use 'mail' (email) or 'userPrincipalName' (UPN) as the unique ID
            user_email = graph_data.get('mail') or graph_data.get('userPrincipalName')
            user_name = graph_data.get('displayName', 'Microsoft User')
            
            if not user_email:
                 raise ValueError("No email found in Microsoft account")
                 
        except Exception as e:
             logger.error(f"Microsoft Login Validation Error: {e}")
             raise HTTPException(status_code=401, detail="Microsoft Authentication Failed")

    conn = get_db_connection()
    user = conn.execute("SELECT id, role FROM students WHERE id = ?", (user_email,)).fetchone()
    
    role = 'Student'
    if user:
         role = user['role']
    else:
        # Auto-register new user
        conn.execute("INSERT INTO students (id, name, grade, preferred_subject, attendance_rate, home_language, password, math_score, science_score, english_language_score, role, school_id, is_super_admin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                     (user_email, user_name, 9, "Math", 100.0, "English", "social_login", 0.0, 0.0, 0.0, 'Student', 1, False))
        conn.commit()
        log_auth_event(user_email, "Register Success", "Microsoft Auto-Register")

    conn.close()
    
    log_auth_event(user_email, "Login Success", "Microsoft Login")
    # For now, social logins default to school_id=1 and Student role
    return LoginResponse(
        user_id=user_email, 
        role=role, 
        school_id=1, 
        school_name="Independent", 
        is_super_admin=False
    )

@router.post("/api/auth/social-login", response_model=LoginResponse)
async def generic_social_login(request: GenericSocialRequest):
    logger.info(f"Processing {request.provider} Login")
    user_id = f"{request.provider.lower()}_user"
    
    conn = get_db_connection()
    user = conn.execute("SELECT id FROM students WHERE id = ?", (user_id,)).fetchone()
    
    if not user:
        conn.execute("INSERT INTO students (id, name, grade, preferred_subject, attendance_rate, home_language, password, math_score, science_score, english_language_score, role, school_id, is_super_admin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Student', 1, False)",
                     (user_id, f"{request.provider} User", 9, "General", 100.0, "English", "social_login", 0.0, 0.0, 0.0))
        conn.commit()
        log_auth_event(user_id, "Register Success", f"{request.provider} Auto-Register")

    conn.close()
    
    log_auth_event(user_id, "Login Success", f"{request.provider} Login")
    return LoginResponse(
        user_id=user_id, 
        role='Student', 
        school_id=1, 
        school_name="Independent", 
        is_super_admin=False
    )

@router.post("/api/auth/forgot-password")
async def forgot_password(request: ForgotPasswordRequest):
    logger.info(f"Password reset requested for: {request.email}")
    conn = get_db_connection()
    user = conn.execute("SELECT id FROM students WHERE id = ?", (request.email,)).fetchone()
    
    if user:
        token = str(uuid.uuid4())
        expires_at = (datetime.now() + timedelta(minutes=15)).isoformat()
        conn.execute("INSERT INTO password_resets (token, user_id, expires_at) VALUES (?, ?, ?)", 
                     (token, request.email, expires_at))
        conn.commit()
        conn.close()
        
        link = f"http://127.0.0.1:8000/?reset_token={token}"
        log_auth_event(request.email, "Password Reset Requested", f"Token generated (Dev Link: {link})")
        return {
            "message": "Reset link generated (DEV MODE).", 
            "dev_link": link 
        }
    else:
        conn.close()
        log_auth_event(request.email, "Password Reset Requested", "User not found")
        return {"message": "If an account exists, a reset link has been sent."}

@router.post("/api/auth/reset-password")
async def reset_password(request: ResetPasswordRequest):
    conn = get_db_connection()
    try:
        reset_entry = conn.execute("SELECT user_id, expires_at FROM password_resets WHERE token = ?", (request.token,)).fetchone()
        
        if not reset_entry:
            raise HTTPException(status_code=400, detail="Invalid or expired reset token.")
            
        if datetime.now() > datetime.fromisoformat(reset_entry['expires_at']):
            conn.execute("DELETE FROM password_resets WHERE token = ?", (request.token,))
            conn.commit()
            raise HTTPException(status_code=400, detail="Reset token has expired.")
            
        validate_password_strength(request.new_password)
        hashed_pw = hash_password(request.new_password)
        conn.execute("UPDATE students SET password = ?, failed_login_attempts = 0, locked_until = NULL WHERE id = ?", (hashed_pw, reset_entry['user_id']))
        conn.execute("DELETE FROM password_resets WHERE token = ?", (request.token,))
        conn.commit()
        
        log_auth_event(reset_entry['user_id'], "Password Reset Success", "Password updated via token & Account unlocked")
        return {"message": "Password reset successfully. You can now login."}
    finally:
        conn.close()
