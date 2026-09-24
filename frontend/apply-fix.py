with open('components/dashboard/command-dashboard.tsx', 'r') as f:
    content = f.read()

# Fix 1: DestinationPreview - wrap the inner div+span in a containing div so the outer div has one child
# The problem: <div className="mt-3 flex items-end justify-between gap-3"> has two children
# Fix: Make the flex items use a wrapper div

old1 = '''      {destination ? (
        <div className="mt-3 flex items-end justify-between gap-3">
          <div>
            <div className="metric text-3xl font-semibold text-accent">{entityCode(destination.name, destination.id)}</div>
            <h3 className="mt-1 text-[14px] font-semibold text-[var(--color-fg)]">{destination.name}</h3>
          </div>
          <span className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.12em] text-safe"><Check size={13} aria-hidden="true" />{recommendation?.capacityStatus ?? destination.status}</span>
        </div>
      ) : ('''

new1 = '''      {destination ? (
        <div className="mt-3 flex items-end justify-between gap-3">
          <div className="flex flex-col gap-2">
            <div>
              <div className="metric text-3xl font-semibold text-accent">{entityCode(destination.name, destination.id)}</div>
              <h3 className="mt-1 text-[14px] font-semibold text-[var(--color-fg)]">{destination.name}</h3>
            </div>
            <span className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.12em] text-safe"><Check size={13} aria-hidden="true" />{recommendation?.capacityStatus ?? destination.status}</span>
          </div>
        </div>
      ) : ('''

if old1 in content:
    content = content.replace(old1, new1)
    print("Fix 1 applied")
else:
    print("Fix 1 pattern not found")

with open('components/dashboard/command-dashboard.tsx', 'w') as f:
    f.write(content)