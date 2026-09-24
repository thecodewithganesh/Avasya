#!/usr/bin/env python3
with open('components/dashboard/command-dashboard.tsx', 'r') as f:
    content = f.read()

old = """{destination ? (
        <div className="mt-3 flex items-end justify-between gap-3">
          <div>
            <div className="metric text-3xl font-semibold text-accent">{entityCode(destination.name, destination.id)}</div>
            <h3 className="mt-1 text-[14px] font-semibold text-[var(--color-fg)]">{destination.name}</h3>
          </div>
          <span className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.12em] text-safe"><Check size={13} aria-hidden="true" />{recommendation?.capacityStatus ?? destination.status}</span>
        </div>
      ) : ("""

new = """{destination ? (
        <div className="mt-3 flex items-end justify-between gap-3">
          <div>
            <div className="metric text-3xl font-semibold text-accent">{entityCode(destination.name, destination.id)}</div>
            <h3 className="mt-1 text-[14px] font-semibold text-[var(--color-fg)]">{destination.name}</h3>
          </div>
          <div className="flex items-end gap-2">
            <span className="text-[10px] font-semibold tracking-[0.12em] text-safe"><Check size={13} aria-hidden="true" />{recommendation?.capacityStatus ?? destination.status}</span>
          </div>
        </div>
      ) : ("""

if old in content:
    content = content.replace(old, new)
    print("Fixed!")
else:
    print("Pattern not found")

with open('components/dashboard/command-dashboard.tsx', 'w') as f:
    f.write(content)