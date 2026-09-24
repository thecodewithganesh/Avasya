#!/usr/bin/env python3
with open('components/dashboard/command-dashboard.tsx', 'r') as f:
    lines = f.readlines()

# Remove the extra div at line 182 (index 181) and restructure
# The grid outer div at line 181 should have two direct children:
# 1. USABLE CAPACITY column
# 2. ROAD ACCESS column

# New structure for lines 181-190
new_section = [
    '        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--color-line)] pt-4">\n',
    '          <div>\n',
    '            <div className="eyebrow">USABLE CAPACITY</div>\n',
    '            <div className="metric mt-1 text-xl font-semibold text-[var(--color-fg)]">{fmtNum(destination.usableCapacity)}</div>\n',
    '          </div>\n',
    '          <div>\n',
    '            <div className="eyebrow">ROAD ACCESS</div>\n',
    '            <div className="mt-1 text-[12px] font-medium text-[var(--color-fg)]">{destination.roadAccess || "EVIDENCE UNAVAILABLE"}</div>\n',
    '          </div>\n',
    '        </div>\n',
]

# Replace lines 181-190 (indices 180-189) with the new structure
# Keep everything else
new_lines = lines[:180] + new_section + lines[190:]

with open('components/dashboard/command-dashboard.tsx', 'w') as f:
    f.writelines(new_lines)
print("Structure fixed!")