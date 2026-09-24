#!/usr/bin/env python3
with open('components/dashboard/command-dashboard.tsx', 'r') as f:
    content = f.read()

# Replace the grid structure - fix the extra div issue
old = """<div className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--color-line)] pt-4">
<div>
  <div className="eyebrow">USABLE CAPACITY</div>
  <div className="metric mt-1 text-xl font-semibold text-[var(--color-fg)]">{fmtNum(destination.usableCapacity)}</div>
</div>
<div>
  <div className="eyebrow">ROAD ACCESS</div>
  <div className="mt-1 text-[12px] font-medium text-[var(--color-fg)]">{destination.roadAccess || "EVIDENCE UNAVAILABLE"}</div>
</div>
</div>"""

new = """<div className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--color-line)] pt-4">
          <div>
            <div className="eyebrow">USABLE CAPACITY</div>
            <div className="metric mt-1 text-xl font-semibold text-[var(--color-fg)]">{fmtNum(destination.usableCapacity)}</div>
          </div>
          <div>
            <div className="eyebrow">ROAD ACCESS</div>
            <div className="mt-1 text-[12px] font-medium text-[var(--color-fg)]">{destination.roadAccess || "EVIDENCE UNAVAILABLE"}</div>
          </div>
        </div>"""

if old in content:
    content = content.replace(old, new)
    print("Grid structure fixed")
else:
    print("Pattern not found - showing context")
    idx = content.find('<div className="mt-4 grid grid-cols-2 gap-3 border-t border')
    if idx >= 0:
        print(content[idx:idx+400])

with open('components/dashboard/command-dashboard.tsx', 'w') as f:
    f.write(content)