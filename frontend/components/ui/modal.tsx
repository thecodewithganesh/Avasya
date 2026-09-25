"use client";

import React, { useEffect } from "react";
import { X } from "lucide-react";

/** Shared modal shell — dark surface, thin border, restrained 200ms transition. */
export default function Modal({
  title,
  eyebrow = "OFFICER DECISION",
  onClose,
  children,
}: {
  title: string;
  eyebrow?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panelRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const panel = panelRef.current;
    // Move focus into the dialog so Escape/Tab behave predictably; restore on close.
    const previous = document.activeElement as HTMLElement | null;
    panel?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [onClose]);

  return (
    <div className="overlay-in fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-scrim)] p-4" role="presentation">
      <div
        ref={panelRef}
        tabIndex={-1}
        className="modal-in panel w-full max-w-lg overflow-y-auto rounded-[var(--radius-pop)] p-6 outline-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby="avasya-modal-title"
        onKeyDownCapture={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="eyebrow">{eyebrow}</div>
            <h2 id="avasya-modal-title" className="mt-2 font-display text-lg font-semibold text-[var(--color-fg)]">
              {title}
            </h2>
          </div>
          <button onClick={onClose} aria-label="Close dialog" className="btn-ghost rounded-[5px] p-1.5">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
