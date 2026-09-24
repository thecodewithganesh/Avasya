import { useId } from "react";
import type { CSSProperties } from "react";

/**
 * AVASYA brand mark — the official hexagon badge.
 *
 * Navy hexagon shelter: white mountains with a summit diamond, two houses and
 * a tree on the safe horizon, banded teal/green/blue waves below — community
 * sheltered above the flood. Matches the official AVASYA logo artwork.
 *
 * Gradient IDs are namespaced per instance — duplicated SVG paint-server IDs
 * across multiple marks on one page silently break fills.
 */
export function AvasyaMark({
  size = 26,
  mono = false,
  className = "",
}: {
  size?: number;
  mono?: boolean;
  className?: string;
}) {
  const uid = useId().replace(/[:]/g, "");
  const tealId = `av-teal-${uid}`;
  const greenId = `av-green-${uid}`;
  const blueId = `av-blue-${uid}`;
  const hexId = `av-hex-${uid}`;
  const style: CSSProperties = { width: size, height: size };

  const navy = "#16355E";
  const fill = (id: string, monoColor: string) => (mono ? monoColor : `url(#${id})`);

  return (
    <svg viewBox="0 0 64 64" fill="none" style={style} className={className} aria-hidden="true" focusable="false">
      {!mono && (
        <defs>
          <linearGradient id={tealId} x1="0" y1="0" x2="64" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#2FA98C" />
            <stop offset="1" stopColor="#3BBFA0" />
          </linearGradient>
          <linearGradient id={greenId} x1="0" y1="0" x2="64" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#7FBF3F" />
            <stop offset="1" stopColor="#9ACD50" />
          </linearGradient>
          <linearGradient id={blueId} x1="0" y1="0" x2="64" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#2E7BF6" />
            <stop offset="1" stopColor="#4A9BF8" />
          </linearGradient>
          <clipPath id={hexId}>
            <path d="M32 2.5 58 17.25 V46.75 L32 61.5 6 46.75 V17.25 Z" />
          </clipPath>
        </defs>
      )}

      {/* Navy hexagon badge */}
      <path
        d="M32 2.5 58 17.25 V46.75 L32 61.5 6 46.75 V17.25 Z"
        fill={mono ? "#F5F7FA" : navy}
        stroke={mono ? "#F5F7FA" : navy}
        strokeWidth={3}
        strokeLinejoin="round"
      />

      <g clipPath={mono ? undefined : `url(#${hexId})`}>
        {/* Waves: teal lines, green band, blue flood */}
        <path
          d="M2 46 Q10 42.4 18 46 T34 46 T50 46 T66 46"
          fill="none"
          stroke={fill(tealId, "#F5F7FA")}
          strokeWidth={1.8}
          strokeLinecap="round"
        />
        <path
          d="M2 50.5 Q10 46.9 18 50.5 T34 50.5 T50 50.5 T66 50.5"
          fill="none"
          stroke={fill(tealId, "#F5F7FA")}
          strokeWidth={1.8}
          strokeLinecap="round"
        />
        <path d="M2 55.5 Q10 51.5 18 55.5 T34 55.5 T50 55.5 T66 55.5 V64 H2 Z" fill={fill(greenId, "#F5F7FA")} />
        <path d="M2 59.5 Q10 55.5 18 59.5 T34 59.5 T50 59.5 T66 59.5 V64 H2 Z" fill={fill(blueId, "#F5F7FA")} opacity={mono ? 0.75 : 1} />

        {/* Houses + tree */}
        <g fill={mono ? navy : "#FFFFFF"}>
          <path d="M16.5 32.5 23.25 26.5 30 32.5 H28.5 V42 H18 V32.5 Z" />
          <rect x={22} y={36.8} width={2.5} height={5.2} fill={mono ? "#F5F7FA" : navy} />
          <path d="M34 32.5 40.75 26.5 47.5 32.5 H46 V42 H35.5 V32.5 Z" />
          <rect x={39.5} y={36.8} width={2.5} height={5.2} fill={mono ? "#F5F7FA" : navy} />
          <circle cx={32} cy={33.6} r={2.7} />
          <rect x={31.2} y={35.8} width={1.6} height={5} rx={0.8} />
        </g>

        {/* Mountains + summit diamond */}
        <g fill={mono ? navy : "#FFFFFF"}>
          <path d="M8 29 21.5 11.5 35 29 Z" />
          <path d="M27 29 38.5 14 50 29 Z" />
          <path d="M21.5 7.6 24.6 10.7 21.5 13.8 18.4 10.7 Z" />
        </g>
      </g>
    </svg>
  );
}

/** Wordmark + descriptor lockup for sidebar and login. */
export function AvasyaLogo({
  compact = false,
  className = "",
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <AvasyaMark size={compact ? 22 : 28} />
      <span className="leading-none">
        <span className="block font-display text-[15px] font-bold tracking-[0.26em] text-[var(--color-fg)]">
          AVASYA
        </span>
        {!compact && (
          <span className="mt-1 block text-[8px] font-semibold tracking-[0.22em] text-[var(--color-fg-3)]">
            PEOPLE FIRST. ALWAYS.
          </span>
        )}
      </span>
    </span>
  );
}
