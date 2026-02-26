import os
import re

backend_path = "backend.py"
models_path = "app/core/models.py"

with open(backend_path, "r", encoding="utf-8") as f:
    lines = f.readlines()

start_idx = -1
end_idx = -1

for i, line in enumerate(lines):
    if "# --- 2. DATA MODELS ---" in line:
        start_idx = i
        break

for i in range(start_idx, len(lines)):
    if "# --- 3. DATABASE HELPER FUNCTIONS ---" in lines[i]:
        end_idx = i
        break

if start_idx == -1 or end_idx == -1:
    print(f"Failed! start={start_idx}, end={end_idx}")
    exit(1)

model_section = lines[start_idx:end_idx]

imports_for_models = """from pydantic import BaseModel
from typing import List, Dict, Any, Optional

"""

with open(models_path, "w", encoding="utf-8") as f:
    f.write(imports_for_models + "".join(model_section))

# Now modify backend.py to remove it and import it
new_backend = lines[:start_idx] + ["\nfrom app.core.models import *\n\n"] + lines[end_idx:]

with open(backend_path, "w", encoding="utf-8") as f:
    f.writelines(new_backend)

print(f"Successfully extracted {end_idx - start_idx} lines of models to {models_path}")
