#!/usr/bin/env python3
with open('components/dashboard/command-dashboard.tsx', 'r') as f:
    content = f.read()

# Replace the flex layout structure - use hardcoded colors and simpler structure
old = '''<div className="mt-4 flex gap-3 border-t border-b border-[var(--color-line)] pt-4 pb-2">
          <div>
            <div className="eyebrow">USABLE CAPACITY</div>
            <div className="metric mt-1 text-xl font-semibold text-[var(--color-fg)]">{fmtNum(destination.usableCapacity)}</div>
          </div>
          <div>
            <div className="eyebrow">ROAD ACCESS</div>
            <div className="mt-1 text-[12px] font-medium text-[var(--color-fg)]">{destination.roadAccess || "EVIDENCE UNAVAILABLE"}</div>
          </div>
        </div>'''

new = '''<div className="mt-4 space-y-3 border-b border-slate-200 pt-4 pb-2">
          <div className="text-sm">
            <div className="font-medium text-slate-600">USABLE CAPACITY</div>
            <div className="font-medium text-slate-900">{fmtNum(destination.usableCapacity)}</div>
          </div>
          <div>
            <div className="font-medium text-slate-600">ROAD ACCESS</div>
            <div className="text-slate-500 text-xs">{destination.roadAccess || "EVIDENCE UNAVAILABLE"}</div>
          </div>
        </div>'''

if '<div className="mt-4 flex gap-3 border-t border-b border-[var(--color-line)] pt-4 pb-2">' in content:
    content = content.replace(old, new)
    print("Flex structure replaced")
else:
    print("Flex pattern not found - showing context")
    if '<div className="mt-4 flex gap-3' in content:
        idx = content.find('<div className="mt-4 flex gap-3')
        print(content[idx:idx+300])

with open('components/dashboard/command-dashboard.tsx', 'w') as f:
    f.write(content)