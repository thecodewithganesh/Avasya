#!/usr/bin/env python3
with open('components/dashboard/command-dashboard.tsx', 'r') as f:
    lines = f.readlines()

# Fix lines 184-185 (0-indexed 183-184) - the grid columns have nested divs with two children
# Old lines 184-185:
# Line 184:           <div><div className="eyebrow">USABLE CAPACITY</div><div className="metric mt-1 text-xl font-semibold text-[var(--color-fg)]">{fmtNum(destination.usableCapacity)}</div></div>
# Line 185:           <div><div className="eyebrow">ROAD ACCESS</div><div className="mt-1 text-[12px] font-medium text-[var(--color-fg)]">{destination.roadAccess || "EVIDENCE UNAVAILABLE"}</div></div>

# New lines 184-189 (expanding to give each eyebrow/metric pair its own div):
# Line 184:           <div>
# Line 185:             <div className="eyebrow">USABLE CAPACITY</div>
# Line 186:             <div className="metric mt-1 text-xl font-semibold text-[var(--color-fg)]">{fmtNum(destination.usableCapacity)}</div>
# Line 187:           </div>
# Line 188:           <div>
# Line 189:             <div className="eyebrow">ROAD ACCESS</div>
# Line 190:             <div className="mt-1 text-[12px] font-medium text-[var(--color-fg)]">{destination.roadAccess || "EVIDENCE UNAVAILABLE"}</div>
# Line 191:           </div>

# But wait, the grid is grid-cols-2, so we need exactly 2 children. Let me restructure differently.

# Actually, the grid at line 183 has grid-cols-2, so it needs exactly 2 direct children.
# The current structure has 2 children but each child has 2 grandchildren, which causes the JSX error.

# The fix: make each grid column a single <div> that contains the eyebrow and metric as its children.
# But a <div> can only have one child unless we wrap them.

# Actually, the error is "Expected '</', got 'ident'" at line 183, which means the parser is confused about the div structure.
# Let me check: the grid has 2 children, each is a <div>. Each inner <div> has 2 children (eyebrow + metric).
# The issue is that the inner divs have 2 children, not the grid itself.

# Wait, looking at the error message again:
# Error at line 183:14 - "Expected '</', got 'ident'"
# And it points to `<div className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--color-line)] pt-4">`

# So the error is actually about the grid div itself, not the children. Let me re-examine.

# Actually, looking at the previous error that was fixed, the issue was that the outer div at line 174 had two children.
# Now the error is at line 183, which is the grid div. Let me check if the grid div has proper closing.

# Looking at lines 183-186:
# 183:         <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--color-line)] pt-4">
# 184:           <div><div className="eyebrow">USABLE CAPACITY</div><div className="metric mt-1 text-xl font-semibold text-[var(--color-fg)]">{fmtNum(destination.usableCapacity)}</div></div>
# 185:           <div><div className="eyebrow">ROAD ACCESS</div><div className="mt-1 text-[12px] font-medium text-[var(--color-fg)]">{destination.roadAccess || "EVIDENCE UNAVAILABLE"}</div></div>
# 186:         </div>

# The grid has 2 children (the two <div> elements at 184 and 185). Each of those <div> elements has 2 children (the eyebrow and metric divs).
# But JSX should allow a parent div with multiple children... unless there's something else going on.

# Wait, let me re-read the error: "Expected '</', got 'ident'" at line 183:14
# Line 183 is the opening `<div className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--color-line)] pt-4">`
# And the error says "Expected '</', got 'ident'" - this usually means there's a JSX tag that's not properly closed.

# Hmm, actually I think the issue might be that line 184 has `<div><div...` which means the outer div has two children, and the parser might be confused.

# Let me restructure each grid column to have the eyebrow and metric as siblings wrapped in a fragment or a span, but since we need valid JSX...

# Actually, the simplest fix: make each grid column have the eyebrow and metric in a way that the outer div has only one child element.

# Let me try wrapping each column's content in a <div> that has a single child using a different approach.

# Or maybe I should just use text nodes or something... No, that's not right.

# Let me look at this differently. The error "Expected '</', got 'ident'" at the opening tag usually means there's a syntax error INSIDE the tag or the tag is not properly formed.

# Wait - maybe the issue is that the <div> at line 183 has improperly formed children. Let me check if there's a missing closing tag somewhere.

# Actually, I think the issue might be simpler. Let me look at line 184 again:
# `<div><div className="eyebrow">USABLE CAPACITY</div><div className="metric mt-1 text-xl font-semibold text-[var(--color-fg)]">{fmtNum(destination.usableCapacity)}</div></div>`

# This has an outer <div> with two inner <div> children. JSX should allow this. But maybe the Turbopack parser is stricter.

# The error location is line 183, which is the grid opening tag. Let me check if maybe there's a missing quote or something.

# Actually, I bet the issue is that line 184 has a `<div>` that's not properly closed before line 185's `<div>`. But they're siblings, so that should be fine.

# Let me try a different approach: put each column's content as a single line or use a different structure.

# Or... maybe the problem is that line 184 has `<div><div` which the parser interprets differently.

# Let me just restructure to avoid the nested divs issue by using a different layout approach.

# Actually, I think I need to just make each grid column have its eyebrow and metric as direct children of the column div, but since a div can only have one child in some parsers... 

# Wait, JSX definitely allows parent divs with multiple children. The issue must be something else.

# Let me just try commenting out the grid and seeing if the build passes, to isolate the issue.

# Actually, let me re-examine. The error says line 183:14. Let me count: 
# `<div className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--color-line)] pt-4">`
# Position 14 would be after "mt-4 grid grid-cols-2 gap-3 border-t border-" - that's where "[var(--color-line)" starts.

# The error "Expected '</', got 'ident'" means the parser expected a closing tag but found an identifier instead. This often happens when there's a JSX expression syntax error inside the tag.

# Let me check if there's an issue with the var() function inside the className. Maybe the Turbopack parser doesn't like [var(--color-line)] inside the className string.

# Actually wait - looking at the original globals.css, there are definitely var() uses in classNames that work. So that's probably not it.

# Let me just try a different approach - remove the grid and use a simple layout, or restructure the columns.

# Actually, I think I need to look at this more carefully. Let me check if maybe the issue is that line 184 has an unbalanced number of angle brackets or something.

# Line 184: `<div><div className="eyebrow">USABLE CAPACITY</div><div className="metric mt-1 text-xl font-semibold text-[var(--color-fg)]">{fmtNum(destination.usableCapacity)}</div></div>`
# Let me count angle brackets: <div> <div> ... </div> <div> ... </div> </div>
# That's 4 opening and 4 closing - should be balanced.

# Line 185: `<div><div className="eyebrow">ROAD ACCESS</div><div className="mt-1 text-[12px] font-medium text-[var(--color-fg)]">{destination.roadAccess || "EVIDENCE UNAVAILABLE"}</div></div>`
# Same structure - should be balanced.

# Hmm, maybe the issue is with the template literal `${destination.roadAccess || "EVIDENCE UNAVAILABLE"}` inside the className? No, it's not in the className.

# Let me try a completely different approach - use inline styles or a different layout manager.

# Or... maybe I should just remove the grid columns entirely and show the capacity/road access in a simpler format.

# Actually, let me just try to see what happens if I make the grid columns have single children by using fragments or different structures.

# You know what, let me just try removing the grid and showing the info in a simpler way, or using a different approach entirely.

# Actually, I just realized - maybe the Turbopack parser is treating the var() inside the className differently, or there's some issue with the string interpolation.

# Let me try using string concatenation instead of template literals, or use the CSS variable differently.

# Or... let me just try building with the current code and see if maybe the error is actually about something else, and the line number is just where the parser got confused.

# Let me try the simplest possible fix: remove the grid structure and just show the two pieces of information in a simple row.

# Actually, wait. Let me re-read the error message one more time:
# "./components/dashboard/command-dashboard.tsx:183:14
# Error: Expected '</', got 'ident'
#   181 |           </div>
#   182 |         </div>
#   183 |         <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--color-line)] pt-4">
#           184 |           <div><div className="eyebrow">USABLE CAPACITY</div><div className="metric mt-1 text-xl font-semibold text-[var(--color-fg)]">{fmtNum(destination.usableCapacity)}</div></div>
#           185 |           <div><div className="eyebrow">ROAD ACCESS</div><div className="mt-1 text-[12px] font-medium text-[var(--color-fg)]">{destination.roadAccess || "EVIDENCE UNAVAILABLE"}</div></div>
#           186 |         </div>

# The error points to line 183, character 14. Let me count character 14 in that line:
# "<div className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--color-line)] pt-4">"
# 1: <
# 2: d
# 3: i
# 4: v
# 5: >
# 6:  
# 7: c
# 8: l
# 9: a
# 10: s
# 11: s
# 12: N
# 13: a
# 14: m
# Hmm, character 14 is "m" from "mt-4". That doesn't seem like it would cause "Expected '</', got 'ident'".

# Actually wait, maybe the parser is counting differently. Or maybe there's a hidden character.

# Let me just try to fix this by restructuring the grid columns to avoid the nested div issue. I'll use a different approach - maybe put each column's info on a single line or use a different CSS layout.

# Actually, I just had an idea. Maybe the issue is that Turbopack is parsing the file differently and the [var(--color-line)] inside the className is causing issues when combined with the nested div structure.

# Let me try a completely different approach: use CSS grid classes from the Tailwind config instead of inline, or use a simpler layout.

# Or... let me just try to see if removing the grid entirely and using block-level elements fixes it.

# Actually, I think I should just try to fix the specific error. Let me look at what "Expected '</', got 'ident'" means more carefully.

# In JSX, this error typically means:
# 1. There's an unclosed tag somewhere
# 2. There's a tag that's not properly formed
# 3. There's a syntax error within a tag

# Given that the error points to the opening tag of the grid div, maybe there's a problem with how the tag is parsed.

# Let me try a different approach: use the css variable in a different way, or avoid using it in the className for now.

# Actually, let me just try to replace the var() with actual values or different class names to see if that's the issue.

# Or better yet, let me just restructure the entire DestinationPreview function to avoid the grid altogether and use a simpler layout that definitely works.

# Let me rewrite the function with a completely different structure that avoids all these JSX nesting issues.