"""Command-line interface for a JSON transportation decision-support payload."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from .alerts import build_alert
from .models import Destination, Habitation, RoadSegment
from .optimizer import TransportOptimizer


def _load_payload(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, dict):
        raise ValueError("Input JSON must be an object.")
    return payload


def _tuple(value: Any) -> tuple[str, ...]:
    return tuple(str(item) for item in (value or []))


def optimize_from_payload(payload: dict[str, Any]) -> dict[str, Any]:
    habitation = Habitation(**payload["habitation"])
    destinations = [Destination(**row) for row in payload.get("destinations", [])]
    segments = [
        RoadSegment(
            **{**row, "hazard_types": _tuple(row.get("hazard_types"))}
        )
        for row in payload.get("road_segments", [])
    ]
    result = TransportOptimizer(segments).optimize(
        habitation,
        destinations,
        evacuees=payload.get("evacuees"),
        alternative_limit=int(payload.get("alternative_limit", 3)),
    )
    response: dict[str, Any] = {"transportation": result.to_dict()}
    alerts = []
    for row in payload.get("alerts", []):
        alerts.append(build_alert(**row).to_dict())
    response["avasya_decision_support_alerts"] = alerts
    return response


def main() -> None:
    parser = argparse.ArgumentParser(description="Freebuff transportation decision support")
    parser.add_argument("input", type=Path, help="Path to an input JSON payload")
    parser.add_argument("-o", "--output", type=Path, help="Optional output JSON path")
    args = parser.parse_args()
    result = json.dumps(optimize_from_payload(_load_payload(args.input)), indent=2)
    if args.output:
        args.output.write_text(result + "\n", encoding="utf-8")
    else:
        print(result)


if __name__ == "__main__":
    main()
