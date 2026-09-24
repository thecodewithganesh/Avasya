#!/usr/bin/env python3
with open('components/dashboard/command-dashboard.tsx', 'r') as f:
    content = f.read()

# Replace the problematic span with a ternary operator
old = '''<span>{destination.roadAccess || "EVIDENCE UNAVAILABLE"}</span>'''

new = '''<span>{destination.roadAccess ? destination.roadAccess : "EVIDENCE UNAVAILABLE"}</span>'''

if old in content:
    content = content.replace(old, new)
    print("Replaced with ternary operator")
else:
    print("Pattern not found")

with open('components/dashboard/command-dashboard.tsx', 'w') as f:
    f.write(content)