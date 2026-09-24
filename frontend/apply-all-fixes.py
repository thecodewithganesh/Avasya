with open('components/dashboard/command-dashboard.tsx', 'r') as f:
    content = f.read()

# Fix 1: Line 175 - wrap the two inner children in a proper div
old1 = '''          <div><div className="metric text-3xl font-semibold text-accent">{entityCode(destination.name, destination.id)}</div><h3 className="mt-1 text-[14px] font-semibold text-[var(--color-fg)]">{destination.name}</h3></div>'''
new1 = '''          <div>
            <div className="metric text-3xl font-semibold text-accent">{entityCode(destination.name, destination.id)}</div>
            <h3 className="mt-1 text-[14px] font-semibold text-[var(--color-fg)]">{destination.name}</h3>
          </div>'''

if old1 in content:
    content = content.replace(old1, new1)
    print("Fix 1 applied")
else:
    print("Fix 1 pattern not found")

# Fix 2: Line 179 - USABLE CAPACITY div has two children
old2 = '''          <div><div className="eyebrow">USABLE CAPACITY</div><div className="metric mt-1 text-xl font-semibold text-[var(--color-fg)]">{fmtNum(destination.usableCapacity)}</div></div>'''
new2 = '''          <div>
            <div className="eyebrow">USABLE CAPACITY</div>
            <div className="metric mt-1 text-xl font-semibold text-[var(--color-fg)]">{fmtNum(destination.usableCapacity)}</div>
          </div>'''

if old2 in content:
    content = content.replace(old2, new2)
    print("Fix 2 applied")
else:
    print("Fix 2 pattern not found")

# Fix 3: Line 180 - ROAD ACCESS div has two children
old3 = '''          <div><div className="eyebrow">ROAD ACCESS</div><div className="mt-1 text-[12px] font-medium text-[var(--color-fg)]">{destination.roadAccess || "EVIDENCE UNAVAILABLE"}</div></div>'''
new3 = '''          <div>
            <div className="eyebrow">ROAD ACCESS</div>
            <div className="mt-1 text-[12px] font-medium text-[var(--color-fg)]">{destination.roadAccess || "EVIDENCE UNAVAILABLE"}</div>
          </div>'''

if old3 in content:
    content = content.replace(old3, new3)
    print("Fix 3 applied")
else:
    print("Fix 3 pattern not found")

# Fix 4: The outer div at line 174 has two children (the div from fix1 and the span)
# Need to wrap the span in a way that the outer div has only one child
# The structure now has: outer div > inner div (with metric+h3) + span
# But the outer div needs only one child. We need to wrap both in a container.
# Actually, let me check the current structure after fixes 1-3

with open('components/dashboard/command-dashboard.tsx', 'r') as f:
    lines = f.readlines()
    # Check line 174 area
    for i in range(172, 182):
        print(f'{i+1}: {repr(lines[i])}')

# The outer div at line 174: <div className="mt-3 flex items-end justify-between gap-3">
# After fix1, line 175 becomes: <div><div>...</div><h3>...</h3></div>
# And line 176-177 has the metric and h3
# And line 178 closes the div
# And line 179 has the span
# So the outer div has TWO children: the div (line 175-178) and the span (line 179)
# We need to wrap the span inside the outer div's flex layout

# Actually, looking at the flex layout "items-end justify-between gap-3",
# we want the metric+h3 on one side and the status check on the other.
# The flex layout should work if we just have the two elements as children.
# But JSX requires the parent to have only ONE child unless wrapped in a fragment or another element.

# Let me restructure: put both children inside a div that uses the flex layout
old4 = '''      {destination ? (
        <div className="mt-3 flex items-end justify-between gap-3">
          <div>
            <div className="metric text-3xl font-semibold text-accent">{entityCode(destination.name, destination.id)}</div>
            <h3 className="mt-1 text-[14px] font-semibold text-[var(--color-fg)]">{destination.name}</h3>
          </div>
          <span className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.12em] text-safe"><Check size={13} aria-hidden="true" />{recommendation?.capacityStatus ?? destination.status}</span>
        </div>
      ) : ('''

new4 = '''      {destination ? (
        <div className="mt-3 flex items-end justify-between gap-3">
          <div>
            <div className="metric text-3xl font-semibold text-accent">{entityCode(destination.name, destination.id)}</div>
            <h3 className="mt-1 text-[14px] font-semibold text-[var(--color-fg)]">{destination.name}</h3>
          </div>
          <div className="flex items-end gap-2">
            <span className="text-[10px] font-semibold tracking-[0.12em] text-safe"><Check size={13} aria-hidden="true" />{recommendation?.capacityStatus ?? destination.status}</span>
          </div>
        </div>
      ) : ('''

if old4 in content:
    content = content.replace(old4, new4)
    print("Fix 4 applied")
else:
    print("Fix 4 pattern not found - checking alternative")

# Check if there's still an issue
with open('components/dashboard/command-dashboard.tsx', 'r') as f:
    lines = f.readlines()
    for i in range(172, 185):
        print(f'{i+1}: {repr(lines[i])}')
"