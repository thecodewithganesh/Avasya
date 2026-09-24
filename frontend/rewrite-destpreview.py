#!/usr/bin/env python3
import re

with open('components/dashboard/command-dashboard.tsx', 'r') as f:
    content = f.read()

# Find and replace the entire DestinationPreview function
start_marker = "/** Destination preview card */"
end_marker = "function DecisionReasons"

start_idx = content.find(start_marker)
if start_idx >= 0:
    end_idx = content.find(end_marker, start_idx + 100)
    if end_idx >= 0:
        # Extract old function
        old_func = content[start_idx:end_idx]
        
        # New function - simple structure avoiding JSX nesting issues
        new_func = '''/*** Destination preview card */
function DestinationPreview({ destination, recommendation }: { destination?: Destination; recommendation?: Recommendation }) {
  return (
    <section className="panel glass p-5 rounded-xl">
      <div className="flex items-center justify-between gap-3">
        <div className="eyebrow text-accent">RECOMMENDED DESTINATION</div>
        {destination && <DataProvenanceBadge provenance={destination.dataOrigin} />}
      </div>
      {destination ? (
        <div className="mt-3 text-sm">
          <div>
            <div className="font-medium text-accent">{entityCode(destination.name, destination.id)}</div>
            <div>{destination.name}</div>
          </div>
          <div>
            <div className="text-accent">USABLE CAPACITY</div>
            <div>{fmtNum(destination.usableCapacity)}</div>
          </div>
          <div>
            <div className="text-accent">ROAD ACCESS</div>
            <div>{destination.roadAccess || "EVIDENCE UNAVAILABLE"}</div>
          </div>
        </div>
      ) : (
        <div className="mt-4 text-sm">Destination evidence unavailable for the selected case.</div>
      )}
    </section>
  );
}'''
        
        new_content = content[:start_idx] + new_func + content[end_idx:]
        with open('components/dashboard/command-dashboard.tsx', 'w') as f:
            f.write(new_content)
        print("DestinationPreview function replaced successfully!")
    else:
        print("Could not find end marker")
else:
    print("Could not find start marker")