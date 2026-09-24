#!/usr/bin/env python3
with open('components/dashboard/command-dashboard.tsx', 'r') as f:
    content = f.read()

# Replace the entire DestinationPreview function's JSX structure
# Use a simpler approach with <section> tags and no nested div issues

# The problem: parent <div> with two children causes Turbopack error
# Solution: use <section> or restructure to avoid the issue

# Actually, let me try a completely different approach: use <dl> <dt> <dd> definition list
# Or use <ul> <li> list items
# Or use simple <p> tags

# Let me try using definition list structure which is semantic and avoids div nesting issues

old = '''<div className="mt-4 space-y-3 border-b border-slate-200 pt-4 pb-2">
          <div className="text-sm">
            <div className="font-medium text-slate-600">USABLE CAPACITY</div>
            <div className="font-medium text-slate-900">{fmtNum(destination.usableCapacity)}</div>
          </div>
          <div>
            <div className="font-medium text-slate-600">ROAD ACCESS</div>
            <div className="text-slate-500 text-xs">{destination.roadAccess || "EVIDENCE UNAVAILABLE"}</div>
          </div>
        </div>'''

# Use <dl> definition list instead
new = '''<div className="mt-4 space-y-3 border-b border-slate-200 pt-4 pb-2">
          <dl className="grid grid-cols-2 gap-2">
            <dt className="font-medium text-slate-600">USABLE CAPACITY</dt>
            <dd className="font-medium text-slate-900">{fmtNum(destination.usableCapacity)}</dd>
            <dt className="font-medium text-slate-600">ROAD ACCESS</dt>
            <dd className="text-slate-500 text-xs">{destination.roadAccess || "EVIDENCE UNAVAILABLE"}</dd>
          </dl>
        </div>'''

if '<div className="mt-4 space-y-3 border-b border-slate-200 pt-4 pb-2">' in content:
    content = content.replace(old, new)
    print("Definition list structure replaced")
else:
    print("Definition list pattern not found - showing context")
    if '<div className="mt-4 space-y-3' in content:
        idx = content.find('<div className="mt-4 space-y-3')
        print(content[idx:idx+300])

with open('components/dashboard/command-dashboard.tsx', 'w') as f:
    f.write(content)