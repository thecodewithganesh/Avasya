#!/usr/bin/env python3
with open('components/dashboard/command-dashboard.tsx', 'r') as f:
    lines = f.readlines()

# Replace lines 174-176 (0-indexed 173-175) with fixed structure
# Line 174:         <div className="mt-3 flex items-end justify-between gap-3">
# Line 175:           <div><div className="metric text-3xl font-semibold text-accent">{entityCode(destination.name, destination.id)}</div><h3 className="mt-1 text-[14px] font-semibold text-[var(--color-fg)]">{destination.name}</h3></div>
# Line 176:           <span className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.12em] text-safe"><Check size={13} aria-hidden="true" />{recommendation?.capacityStatus ?? destination.status}</span>

# New structure:
# Line 174:         <div className="mt-3 flex items-end justify-between gap-3">
# Line 175:           <div>
# Line 176:             <div className="metric text-3xl font-semibold text-accent">{entityCode(destination.name, destination.id)}</div>
# Line 177:             <h3 className="mt-1 text-[14px] font-semibold text-[var(--color-fg)]">{destination.name}</h3>
# Line 178:           </div>
# Line 179:           <div className="flex items-end gap-2">
# Line 180:             <span className="text-[10px] font-semibold tracking-[0.12em] text-safe"><Check size={13} aria-hidden="true" />{recommendation?.capacityStatus ?? destination.status}</span>
# Line 181:           </div>
# Line 182:         </div>

# We'll replace lines 173-176 (indices 173-176) and insert new lines

# First, remove the old line 175 content and replace with new structure
# Keep line 174 as is, replace 175-176, add new lines, keep 177

new_lines = [
    '          <div>\n',  # new line after 174
    '            <div className="metric text-3xl font-semibold text-accent">{entityCode(destination.name, destination.id)}</div>\n',
    '            <h3 className="mt-1 text-[14px] font-semibold text-[var(--color-fg)]">{destination.name}</h3>\n',
    '          </div>\n',  # closes the inner div
    '          <div className="flex items-end gap-2">\n',  # new flex div
    '            <span className="text-[10px] font-semibold tracking-[0.12em] text-safe"><Check size={13} aria-hidden="true" />{recommendation?.capacityStatus ?? destination.status}</span>\n',  # new span
    '          </div>\n',  # closes the flex div
]

# Replace lines 174-176 (indices 173-175) with the new structure
# Keep line 173 (index 172) as separator, insert new lines after it
# Actually, let me just replace indices 173-176 (the old 175-176 content)

# Old lines at indices 173-176:
# 173: '      {destination ? (\n'
# 174: '        <div className="mt-3 flex items-end justify-between gap-3">\n'
# 175: '          <div><div className="metric text-3xl font-semibold text-accent">{entityCode(destination.name, destination.id)}</div><h3 className="mt-1 text-[14px] font-semibold text-[var(--color-fg)]">{destination.name}</h3></div>\n'
# 176: '          <span className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.12em] text-safe"><Check size={13} aria-hidden="true" />{recommendation?.capacityStatus ?? destination.status}</span>\n'

# New lines to insert after line 174:
# 175: '          <div>\n'
# 176: '            <div className="metric text-3xl font-semibold text-accent">{entityCode(destination.name, destination.id)}</div>\n'
# 177: '            <h3 className="mt-1 text-[14px] font-semibold text-[var(--color-fg)]">{destination.name}</h3>\n'
# 178: '          </div>\n'
# 179: '          <div className="flex items-end gap-2">\n'
# 180: '            <span className="text-[10px] font-semibold tracking-[0.12em] text-safe"><Check size={13} aria-hidden="true" />{recommendation?.capacityStatus ?? destination.status}</span>\n'
# 181: '          </div>\n'

# So I need to replace lines 175-176 (indices 174-175) and insert new lines

# Let me just rebuild the whole file section

# Actually, simpler: just replace the specific old string with new
# The old exact string from line 175 (index 174):
old_line175 = '          <div><div className="metric text-3xl font-semibold text-accent">{entityCode(destination.name, destination.id)}</div><h3 className="mt-1 text-[14px] font-semibold text-[var(--color-fg)]">{destination.name}</h3></div>\n'

new_line175 = '          <div>\n            <div className="metric text-3xl font-semibold text-accent">{entityCode(destination.name, destination.id)}</div>\n            <h3 className="mt-1 text-[14px] font-semibold text-[var(--color-fg)]">{destination.name}</h3>\n          </div>\n'

# And old line 176 (index 175):
old_line176 = '          <span className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.12em] text-safe"><Check size={13} aria-hidden="true" />{recommendation?.capacityStatus ?? destination.status}</span>\n'

new_line176 = '          <div className="flex items-end gap-2">\n            <span className="text-[10px] font-semibold tracking-[0.12em] text-safe"><Check size={13} aria-hidden="true" />{recommendation?.capacityStatus ?? destination.status}</span>\n          </div>\n'

with open('components/dashboard/command-dashboard.tsx', 'r') as f:
    content = f.read()

if old_line175 in content:
    content = content.replace(old_line175, new_line175)
    print("Fixed line 175")
else:
    print("Line 175 pattern not found")

if old_line176 in content:
    content = content.replace(old_line176, new_line176)
    print("Fixed line 176")
else:
    print("Line 176 pattern not found")

with open('components/dashboard/command-dashboard.tsx', 'w') as f:
    f.write(content)