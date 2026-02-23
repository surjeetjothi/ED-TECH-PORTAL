import os

file_path = "index.html"
with open(file_path, "r", encoding="utf-8") as f:
    lines = f.readlines()

start_idx = -1
end_idx = -1
main_idx = -1

for i, line in enumerate(lines):
    if "<!-- PARENT MODULE VIEWS (FR-7)                 -->" in line:
        start_idx = i - 1  # Get the line before this comment "<!-- ==...="
    if "<!-- App Footer -->" in line:
        end_idx = i
    if "</main>" in line:
        main_idx = i

if start_idx != -1 and end_idx != -1 and main_idx != -1 and start_idx > main_idx:
    parent_views = lines[start_idx:end_idx]
    
    # Remove from original location
    del lines[start_idx:end_idx]
    
    # Because main_idx is before start_idx, it won't shift when we delete
    # Insert right before </main>
    lines = lines[:main_idx] + parent_views + lines[main_idx:]

    with open(file_path, "w", encoding="utf-8") as f:
        f.writelines(lines)
    print(f"Success! Moved {len(parent_views)} lines into <main>")
else:
    print(f"Failed. start:{start_idx}, end:{end_idx}, main:{main_idx}")
