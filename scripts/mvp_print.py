"""Inline helpers for scripts/run_mvp_checks.cmd.

Each subcommand reads one AVASYA API response from stdin (or a JSON file given
as argv[1]) and prints a compact, judge-readable summary. Kept in a real
Python file because CMD strips % signs and mangles quotes in inline -c code.
"""
from __future__ import annotations

import json
import sys

_REMAINING_ARGS: list[str] = []


def _load() -> dict:
    # main() strips the subcommand before dispatching; a remaining argv item is
    # a JSON file path. Without one, read the piped API response from stdin.
    # sys.argv still holds the original list, so use the module-level remaining
    # args set by main().
    if _REMAINING_ARGS:
        with open(_REMAINING_ARGS[0], encoding="utf-8") as handle:
            return json.load(handle)
    return json.load(sys.stdin)


def risk() -> None:
    r = _load()
    c, n, w = r["contributions"], r["normalized_values"], r["weights"]
    print(f"RISK SCORE: {r['overall_risk_score']}  ->  {r['risk_level']}   (model: {r['model_version']})")
    print()
    print("  factor                norm  weight  contribution")
    for k in ["hazard_exposure", "population", "vulnerability", "historical_events", "road_accessibility"]:
        bar = "#" * int(n[k] // 10)
        print(f"   {k:<20}{n[k]:>6.1f}   {w[k]:>4.0%}   {bar} +{c[k]}")
    print()
    for lim in r["reasons"]["limitations"]:
        print("  limitation:", lim)


def recommendation() -> None:
    r = _load()
    d = r["details"]["capacity"]
    print(f"  rec #{r['id']}: {r['summary']}")
    print(f"    usable {d['usable_capacity']} | required {d['required_capacity']} | gap {d['capacity_gap']:+d} | eligibility {r['details']['eligibility']}")


def zones() -> None:
    r = _load()
    print(f"  zones served: {len(r['features'])} | coast_available: {r['coast_available']} | coast_clamped: {r['coast_clamped_count']}")
    print("  hazard       band     radius  clamped  provenance")
    for f in r["features"]:
        p = f["properties"]
        print(f"  {p['hazard_type']:<12} {p['band']:<8} {p['radius_m']:>5.0f}m  {str(p['coast_clamped']):<8} {p['data_origin']}")
    print("  traffic-risk locations inside RED/YELLOW zones:")
    for t in r["traffic_locations"]:
        print(f"    {t['kind']}: {t['name']} | pop {t['population']} | band {t['band']} | hazard {t['hazard_type']}")


def claims() -> None:
    r = _load()
    print("  claim                claimed   AVASYA DB   verdict")
    for c in r.get("claims", []):
        print(f"  {str(c.get('field','')):<20} {str(c.get('claimed_value')):>9} {str(c.get('avasya_value')):>10}   {c.get('status')}")


def detail(**_ignored) -> None:
    r = _load()
    print(json.dumps(r, indent=2)[:1200])


if __name__ == "__main__":
    argv = list(sys.argv[1:])
    cmd = "detail"
    if argv and not argv[0].endswith(".json"):
        cmd = argv.pop(0)
    _REMAINING_ARGS.extend(argv)
    globals().get(cmd, detail)(*_REMAINING_ARGS)
