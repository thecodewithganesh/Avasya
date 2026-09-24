#!/usr/bin/env python3
with open('components/dashboard/command-dashboard.tsx', 'r') as f:
    content = f.read()

# Use the most minimal structure possible - no Tailwind classes
old = '''<section className="p-4 bg-slate-950/80 border-y border-slate-300">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <strong className="font-medium text-slate-500">USABLE CAPACITY</strong>
              <span className="font-medium text-slate-100">{fmtNum(destination.usableCapacity)}</span>
            </div>
            <div>
              <strong className="font-medium text-slate-500">ROAD ACCESS</strong>
              <span className="text-slate-400 text-xs">{destination.roadAccess || "EVIDENCE UNAVAILABLE"}</span>
            </div>
          </div>
        </section>'''

new = '''<div>
          <div>
            <strong>USABLE CAPACITY</strong>
            <span>{fmtNum(destination.usableCapacity)}</span>
          </div>
          <div>
            <strong>ROAD ACCESS</strong>
            <span>{destination.roadAccess || "EVIDENCE UNAVAILABLE"}</span>
          </div>
        </div>'''

if '<section className="p-4 bg-slate-950/80 border-y border-slate-300">' in content:
    content = content.replace(old, new)
    print("Minimal div structure replaced")
else:
    print("Minimal div pattern not found - showing context")
    if '<div>' in content:
        idx = content.find('<div>')
        print(content[idx:idx+300])

with open('components/dashboard/command-dashboard.tsx', 'w') as f:
    f.write(content)