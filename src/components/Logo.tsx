/**
 * Logo — the Filament mark.
 * Operator-decision: no rotating logos. Filament is the canonical mark.
 *
 * For places that want the full bone-on-ink wordmark, prefer
 * <img src="/logos/neolog-wordmark-bone.svg" /> for a single asset render.
 */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <span className="mark" style={{ width: size, height: size, color: 'currentColor' }} aria-label="Neolog">
      <svg viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M 3 11 Q 7 4, 11 11 T 19 11"
          stroke="currentColor"
          strokeWidth="1.6"
          fill="none"
          strokeLinecap="round"
        />
        <circle cx="3" cy="11" r="1.8" fill="currentColor" />
        <circle cx="19" cy="11" r="1.8" fill="currentColor" />
      </svg>
    </span>
  )
}
