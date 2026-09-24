import type { Habitation, SpatialEvidence } from "@/types/api";
import EvidenceStatus from "@/components/ui/evidence-status";

function defaultEvidence(habitation: Habitation): SpatialEvidence[] {
  const factorNames = new Set((habitation.factors ?? []).map((factor) => factor.name.toLowerCase()));
  const warningText = habitation.warnings.find((warning) => /habitation|district|granularity/i.test(warning));
  return [
    {
      key: "hazard-exposure",
      label: "Hazard exposure",
      availability: factorNames.has("hazard exposure") ? "AVAILABLE" : "UNAVAILABLE",
      granularity: factorNames.has("hazard exposure") ? "HABITATION" : "UNKNOWN",
      provenance: factorNames.has("hazard exposure") ? habitation.dataOrigin : "UNAVAILABLE",
      note: factorNames.has("hazard exposure") ? null : "No habitation-level hazard exposure evidence was supplied.",
    },
    {
      key: "vulnerability",
      label: "Vulnerability",
      availability: factorNames.has("vulnerability") ? "AVAILABLE" : "UNAVAILABLE",
      granularity: factorNames.has("vulnerability") ? "HABITATION" : "UNKNOWN",
      provenance: factorNames.has("vulnerability") ? habitation.dataOrigin : "UNAVAILABLE",
      note: factorNames.has("vulnerability") ? null : "Vulnerability evidence is not available at habitation level.",
    },
    {
      key: "historical-events",
      label: "Historical events",
      availability: factorNames.has("historical disasters") && !warningText ? "AVAILABLE" : "UNAVAILABLE",
      granularity: warningText ? "DISTRICT" : factorNames.has("historical disasters") ? "HABITATION" : "UNKNOWN",
      provenance: warningText ? habitation.dataOrigin : factorNames.has("historical disasters") ? habitation.dataOrigin : "UNAVAILABLE",
      note: warningText ? "Evidence exists outside habitation granularity and is not treated as habitation-specific." : "No habitation-level historical event linkage was supplied.",
    },
    {
      key: "road-accessibility",
      label: "Road accessibility",
      availability: factorNames.has("road accessibility") ? "AVAILABLE" : "UNAVAILABLE",
      granularity: factorNames.has("road accessibility") ? "HABITATION" : "UNKNOWN",
      provenance: factorNames.has("road accessibility") ? habitation.dataOrigin : "UNAVAILABLE",
      note: factorNames.has("road accessibility") ? null : "Road evidence is not available at habitation level.",
    },
  ];
}

export default function SpatialEvidencePanel({ habitation }: { habitation: Habitation }) {
  const evidence = habitation.spatialEvidence ?? defaultEvidence(habitation);
  return (
    <section className="panel p-5">
      <div className="eyebrow">SPATIAL EVIDENCE</div>
      <h2 className="mt-1.5 font-display text-[17px] font-semibold text-[var(--color-fg)]">What the GIS record supports</h2>
      <p className="mt-2 text-[12px] leading-5 text-[var(--color-fg-3)]">Missing habitation-level evidence is not interpreted as absence of risk.</p>
      <div className="mt-3">
        {evidence.map(({ key, ...item }) => <EvidenceStatus key={key} {...item} />)}
      </div>
    </section>
  );
}