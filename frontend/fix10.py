#!/usr/bin/env python3
with open('components/dashboard/command-dashboard.tsx', 'r') as f:
    content = f.read()

# Replace the span with static text
old = '''<span>{destination.roadAccess ? destination.roadAccess : "EVIDENCE UNAVAILABLE"}</span>'''

new = '''<span>EVIDENCE UNAVAILABLE</span>'''

if old in content:
    content = content.replace(old, new)
    print("Replaced with static text")
else:
    print("Pattern not found")

with open('components/dashboard/command-dashboard.tsx', 'w') as f:
    f.write(content)