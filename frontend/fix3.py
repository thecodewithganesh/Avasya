#!/usr/bin/env python3
with open('components/dashboard/command-dashboard.tsx', 'r') as f:
    content = f.read()

# Replace the grid structure at lines 183-186 with a simpler layout
# Old:
# <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--color-line)] pt-4">
#   <div><div className="eyebrow">USABLE CAPACITY</div><div className="metric mt-1 text-xl font-semibold text-[var(--color-fg)]">{fmtNum(destination.usableCapacity)}</div></div>
#   <div><div className="eyebrow">ROAD ACCESS</div><div className="mt-1 text-[12px] font-medium text-[var(--color-fg)]">{destination.roadAccess || "EVIDENCE UNAVAILABLE"}</div></div>
# </div>

# New: Use a simple two-column layout without grid, or use a different approach
# Let me use a flex layout instead, which might be more compatible

new = '''<div className="mt-4 flex gap-3 border-t border-b border-[var(--color-line)] pt-4 pb-2">
          <div>
            <div className="eyebrow">USABLE CAPACITY</div>
            <div className="metric mt-1 text-xl font-semibold text-[var(--color-fg)]">{fmtNum(destination.usableCapacity)}</div>
          </div>
          <div>
            <div className="eyebrow">ROAD ACCESS</div>
            <div className="mt-1 text-[12px] font-medium text-[var(--color-fg)]">{destination.roadAccess || "EVIDENCE UNAVAILABLE"}</div>
          </div>
        </div>'''

if '<div className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--color-line)] pt-4">' in content:
    content = content.replace(
        '<div className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--color-line)] pt-4">\n          <div><div className="eyebrow">USABLE CAPACITY</div><div className="metric mt-1 text-xl font-semibold text-[var(--color-fg)]">{fmtNum(destination.usableCapacity)}</div></div>\n          <div><div className="eyebrow">ROAD ACCESS</div><div className="mt-1 text-[12px] font-medium text-[var(--color-fg)]">{destination.roadAccess || "EVIDENCE UNAVAILABLE"}</div></div>\n        </div>',
        new
    )
    print("Grid structure replaced")
else:
    print("Grid pattern not found - showing context")
    if '<div className="mt-4 grid grid-cols-2 gap-3 border-t border-' in content:
        idx = content.find('<div className="mt-4 grid grid-cols-2 gap-3 border-t border-')
        print(content[idx:idx+300])

with open('components/dashboard/command-dashboard.tsx', 'w') as f:
    f.write(content)