import os

file_path = r"c:\Users\nesnk\Desktop\social-trading-webapp\my-copy-app\src\engine\executor.py"

with open(file_path, "r", encoding="utf-8") as f:
    lines = f.readlines()

# Indices determination
# We want to keep lines 1 to 1334 (Index 0 to 1333)
# We want to keep lines 1795 onwards (Index 1794 onwards)
# Dropping Index 1334 to 1793.

part1 = lines[:1334] # 0 to 1333
part2 = lines[1794:] # 1794 to End

print(f"Original Line Count: {len(lines)}")
print(f"Keeping Part 1: {len(part1)} lines (End: {part1[-1].strip()})")
print(f"Keeping Part 2: {len(part2)} lines (Start: {part2[0].strip()})")

new_content = part1 + part2

with open(file_path, "w", encoding="utf-8") as f:
    f.writelines(new_content)

print(f"New Line Count: {len(new_content)}")
print("Cleanup Complete.")
