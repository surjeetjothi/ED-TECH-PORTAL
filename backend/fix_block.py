import re

with open("app/routers/auth.py", "r") as f:
    lines = f.readlines()

start_idx = -1
end_idx = -1

for i, line in enumerate(lines):
    if "# --- SUPER ADMIN: SCHOOL MANAGEMENT ---" in line:
        start_idx = i
    if "google-login" in line and "@router." in line:
        # Go back to grab the def google_login... wait, the decorator is the start
        end_idx = i - 1 # previous line or so, maybe some blank lines
        break

while lines[end_idx].strip() == "":
    end_idx -= 1

print(f"Extracting auth.py lines {start_idx} to {end_idx}")

if start_idx != -1 and end_idx != -1:
    extracted_block_lines = lines[start_idx:end_idx+1]
    
    # Remove them from auth.py
    new_auth_lines = lines[:start_idx] + lines[end_idx+1:]
    with open("app/routers/auth.py", "w") as f:
        f.writelines(new_auth_lines)
        
    extracted_text = "".join(extracted_block_lines).replace("@router.", "@app.")
    
    # Put it in backend.py after the router include
    with open("backend.py", "r") as f:
        bk_lines = f.readlines()
        
    insert_idx = -1
    for i, line in enumerate(bk_lines):
        if "app.include_router(auth.router)" in line:
            insert_idx = i + 1
            break
            
    if insert_idx != -1:
        bk_lines.insert(insert_idx, "\n" + extracted_text + "\n")
        with open("backend.py", "w") as f:
            f.writelines(bk_lines)
        print("Successfully moved non-auth routes back to backend.py")
    else:
        print("Could not find insertion point in backend.py")
