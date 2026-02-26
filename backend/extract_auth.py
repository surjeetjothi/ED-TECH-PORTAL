import os

backend_path = "backend.py"
auth_router_path = "app/routers/auth.py"

with open(backend_path, "r") as f:
    lines = f.readlines()

# The boundaries we found
start_line = 6282 - 1  # 0-indexed, def _ensure_authenticator_table...
end_line = 7719     # The return {"message": "Password reset..."} and finally conn.close()
# Actually, let's search for the exact lines to be safe against drift.

start_idx = -1
end_idx = -1

for i, line in enumerate(lines):
    if "def _ensure_authenticator_table(conn) -> None:" in line:
        start_idx = i
        break

for i in range(start_idx, len(lines)):
    if "return {\"message\": \"Password reset successfully. You can now login.\"}" in lines[i]:
        # go down to the end of the finally block
        for j in range(i, i+10):
            if "conn.close()" in lines[j] and "finally:" in lines[j-1]:
                end_idx = j + 1
                break
        break

if start_idx == -1 or end_idx == -1:
    print(f"Failed to find boundaries! start={start_idx}, end={end_idx}")
    exit(1)

auth_section = lines[start_idx:end_idx]

# Create the new auth.py
imports = """from fastapi import APIRouter, HTTPException, Depends, Request, Header
from typing import Optional
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

from app.core.database import get_db_connection
from app.core.security import RateLimiter
from app.core.config import (
    TEACHER_LOGIN_ALIAS, ADMIN_LOGIN_EMAIL, ADMIN_LOGIN_PASSWORD,
    SMTP_EMAIL, STUDENT_OTP_EMAIL_OVERRIDES, PARENT_OTP_EMAIL_OVERRIDES,
    STUDENT_LOGIN_ALIASES, PARENT_LOGIN_ALIASES, ALLOW_OTP_CONSOLE_FALLBACK
)

# We might need to import these from a utils file, but for now we'll mock or keep them
# Since they are in backend.py, we either import them from backend (circular import risk) 
# or move them. 
# We will create a router here.
router = APIRouter(prefix="/api/auth", tags=["Authentication"])

logger = logging.getLogger(__name__)

# --- We will need to redefine or import log_auth_event, validate_password_strength etc. ---
"""

with open(auth_router_path, "w") as f:
    f.write(imports + "".join(auth_section))

# Remove the section from backend.py
new_backend = lines[:start_idx] + ["\n# --- AUTHENTICATION EXTRACTED TO app/routers/auth.py ---\n"] + lines[end_idx:]

with open(backend_path, "w") as f:
    f.writelines(new_backend)

print(f"Successfully extracted {end_idx - start_idx} lines to {auth_router_path}")
