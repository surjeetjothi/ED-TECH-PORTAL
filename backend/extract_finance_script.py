import os
import re

backend_path = "backend.py"
finance_router_path = "app/routers/finance.py"

with open(backend_path, "r", encoding="utf-8") as f:
    lines = f.readlines()

start_idx = -1
end_idx = -1

# Find the start of the get_finance_module_access endpoint
for i, line in enumerate(lines):
    if '@app.get("/api/finance/module")' in line:
        start_idx = i
        break

# Find the first AI endpoint after finance
for i in range(start_idx, len(lines)):
    if '@app.post("/api/ai/lesson-plan"' in line:
        # Step back to find the end of the previous endpoint. 
        # The previous endpoint is create_exchange_rate which ends with a blank line or finally: conn.close()
        pass
    if '@app.post("/api/ai/lesson-plan"' in lines[i]:
        end_idx = i
        break

if start_idx == -1 or end_idx == -1:
    print(f"Failed! start={start_idx}, end={end_idx}")
    exit(1)

# Backtrack end_idx just before @app.post("/api/ai/lesson-plan"
while end_idx > start_idx and lines[end_idx-1].strip() == "":
    end_idx -= 1

finance_section = lines[start_idx:end_idx]

# Replace @app.get with @router.get etc.
for i in range(len(finance_section)):
    line = finance_section[i]
    if line.startswith("@app."):
        finance_section[i] = line.replace("@app.", "@router.", 1)

imports = """from fastapi import APIRouter, HTTPException, Depends, Header, Body, Query, Request, Response
from typing import List, Dict, Any, Optional
from datetime import datetime, date
import logging
from app.core.database import get_db_connection
from pydantic import BaseModel

import sys
# Hack to allow importing from backend without circular issues if executed oddly
if "backend" not in sys.modules:
    import backend

from backend import verify_any_permission, _resolve_school_id

router = APIRouter(tags=["Finance"])
logger = logging.getLogger(__name__)

"""

with open(finance_router_path, "w", encoding="utf-8") as f:
    f.write(imports + "".join(finance_section))

# Now modify backend.py
new_backend = lines[:start_idx] + ["\n# --- FINANCE ROUTES EXTRACTED TO app/routers/finance.py ---\n"] + lines[end_idx:]

with open(backend_path, "w", encoding="utf-8") as f:
    f.writelines(new_backend)

print(f"Successfully extracted {end_idx - start_idx} lines to {finance_router_path}")
