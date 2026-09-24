#!/usr/bin/env python3
with open('components/dashboard/command-dashboard.tsx', 'r') as f:
    content = f.read()

# Replace the entire DestinationPreview function's JSX with a super simple structure
# That avoids any potential Turbopack parsing issues

old = '''<div className="mt-4 space-y-3 border-b border-slate-200 pt-4 pb-2">
          <dl className="grid grid-cols-2 gap-2">
            <dt className="font-medium text-slate-600">USABLE CAPACITY</dt>
            <dd className="font-medium text-slate-900">{fmtNum(destination.usableCapacity)}</dd>
            <dt className="font-medium text-slate-600">ROAD ACCESS</dt>
            <dd className="text-slate-500 text-xs">{destination.roadAccess || "EVIDENCE UNAVAILABLE"}</dd>
          </dl>
        </div>'''

new = '''<section className="p-4 bg-slate-950/80 border-y border-slate-300">
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

if '<div className="mt-4 space-y-3 border-b border-slate-200 pt-4 pb-2">' in content:
    content = content.replace(old, new)
    print("Simple section structure replaced")
else:
    print("Simple section pattern not found - showing context")
    if '<section className="p-4' in content:
        idx = content.find('<section className="p-4')
        print(content[idx:idx+300])
    else:
        print("No section found either")
        idx = content.find('{destination ? (')
        if idx >= 0:
            print(content[idx:idx+500])

with open('components/dashboard/command-dashboard.tsx', 'w') as f:
    f.write(content)