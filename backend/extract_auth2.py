import os
import re

backend_path = "backend.py"
security_path = "app/core/security.py"
finance_path = "app/routers/finance.py"

with open(backend_path, "r", encoding="utf-8") as f:
    lines = f.readlines()

start_idx = -1
end_idx = -1

for i, line in enumerate(lines):
    if line.startswith("ROLE_PERMISSIONS = {"):
        start_idx = i
        break

for i in range(start_idx, len(lines)):
    if line.startswith("# --- LMS & UPLOADS CONFIGURATION ---") or "async def verify_any_permission(" in lines[i]:
        # we found verify_any_permission, now find its end
        pass

for i in range(start_idx, len(lines)):
    if "async def verify_any_permission(" in lines[i]:
        for j in range(i, len(lines)):
            if "raise HTTPException(status_code=403, detail=\"Permission denied.\")" in lines[j]:
                end_idx = j + 2
                break
        break

if start_idx == -1 or end_idx == -1:
    print(f"Failed! start={start_idx}, end={end_idx}")
    exit(1)

auth_section = lines[start_idx:end_idx]

imports_for_security = """
from typing import List
from fastapi import Header, HTTPException
from app.core.database import get_db_connection
from app.core.auth_utils import log_auth_event
"""

with open(security_path, "a", encoding="utf-8") as f:
    f.write(imports_for_security + "".join(auth_section))

# Now modify backend.py to remove it and import it
new_backend = lines[:start_idx] + ["from app.core.security import ROLE_PERMISSIONS, check_permission, verify_permission, verify_any_permission\n"] + lines[end_idx:]

with open(backend_path, "w", encoding="utf-8") as f:
    f.writelines(new_backend)

# Now update finance.py import
with open(finance_path, "r", encoding="utf-8") as f:
    finance_content = f.read()

finance_content = finance_content.replace(
    "from backend import verify_any_permission, _resolve_school_id",
    "from app.core.security import verify_any_permission\n# _resolve_school_id is defined below"
)

with open(finance_path, "w", encoding="utf-8") as f:
    f.write(finance_content)

print(f"Successfully moved verify_permission ({end_idx - start_idx} lines) to {security_path}")
