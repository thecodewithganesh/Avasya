import { AlertTriangle, Check, MapPinned } from "lucide-react";

type LayerKey = "habitations" | "hazard-zones" | "high-risk" | "historical-events" | "roads" | "destinations";
type Layer = { key: LayerKey; label: string; status: "ACTIVE" | "INACTIVE" | "UNAVAILABLE"; checked: boolean; onChange?: (checked: boolean) => void; note?: string };

export default function MapLayerControl({ onHabitationsChange, habitationsVisible = true, onDestinationsChange, destinationsVisible = false, destinationsAvailable = false }: { onHabitationsChange?: (visible: boolean) => void; habitationsVisible?: boolean; onDestinationsChange?: (visible: boolean) => void; destinationsVisible?: boolean; destinationsAvailable?: boolean }) {
  const layers: Layer[] = [
    { key: "habitations", label: "Habitations", status: habitationsVisible ? "ACTIVE" : "INACTIVE", checked: habitationsVisible, onChange: onHabitationsChange },
    { key: "hazard-zones", label: "Hazard zones", status: "UNAVAILABLE", checked: false, note: "Backend spatial layer required" },
    { key: "high-risk", label: "High-risk areas", status: "ACTIVE", checked: true, note: "Marker styling" },
    { key: "historical-events", label: "Historical events", status: "UNAVAILABLE", checked: false, note: "Backend spatial layer required" },
    { key: "roads", label: "Road accessibility", status: "UNAVAILABLE", checked: false, note: "Backend spatial layer required" },
    destinationsAvailable
      ? { key: "destinations", label: "Relocation destinations", status: destinationsVisible ? "ACTIVE" : "INACTIVE", checked: destinationsVisible, onChange: onDestinationsChange, note: "Persisted coordinates" }
      : { key: "destinations", label: "Relocation destinations", status: "UNAVAILABLE", checked: false, note: "Coordinates unavailable" },
  ];
  return (
    <section className="panel p-4">
      <div className="flex items-center gap-2"><MapPinned size={14} className="text-accent" aria-hidden="true" /><div className="eyebrow">MAP LAYERS</div></div>
      <div className="mt-3 space-y-2">
        {layers.map((layer) => <label key={layer.key} className={`flex items-start gap-2.5 text-[11px] ${layer.onChange ? "cursor-pointer text-[var(--color-fg-2)]" : "text-[var(--color-fg-3)]"}`}>
          {layer.onChange ? <input aria-label={`${layer.label} layer`} type="checkbox" checked={layer.checked} onChange={(event) => layer.onChange?.(event.target.checked)} className="mt-0.5 accent-[var(--color-accent)]" /> : <span className="mt-0.5 flex h-4 w-4 items-center justify-center" aria-hidden="true">{layer.status === "ACTIVE" ? <Check size={12} className="text-safe" /> : <AlertTriangle size={11} className="text-medium" />}</span>}
          <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span>{layer.label}</span><span className={`font-display text-[9px] font-semibold tracking-[0.1em] ${layer.status === "ACTIVE" ? "text-safe" : layer.status === "INACTIVE" ? "text-[var(--color-fg-3)]" : "text-medium"}`}>{layer.status}</span></span>{layer.note && <span className="mt-0.5 block text-[10px] text-[var(--color-fg-3)]">{layer.note}</span>}</span>
        </label>)}
      </div>
    </section>
  );
}