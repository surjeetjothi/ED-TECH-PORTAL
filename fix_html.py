import sys

with open("index.html", "r") as f:
    lines = f.readlines()

start_idx = -1
end_idx = -1
main_idx = -1

for i, line in enumerate(lines):
    if "<!-- PARENT MODULE VIEWS (FR-7)                 -->" in line:
        start_idx = i - 1 # Include the previous comment boundary
    if "<!-- App Footer -->" in line:
        end_idx = i
    if "</main>" in line:
        main_idx = i

if start_idx != -1 and end_idx != -1 and main_idx != -1:
    parent_views = lines[start_idx:end_idx]
    
    # Remove from original location
    del lines[start_idx:end_idx]
    
    # Recalculate main_idx after deletion if main_idx > start_idx (it isn't)
    # Insert right before </main>
    lines.insert(main_idx, "".join(parent_views))

    with open("index.html", "w") as f:
        f.writelines(lines)
    print("Fixed layout")
else:
    print(f"Failed. start:{start_idx}, end:{end_idx}, main:{main_idx}")
