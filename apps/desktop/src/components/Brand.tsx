import { useId } from "react"
import { MARK_O_PATH, MARK_WAVE_PATH, WORDMARK_PATH, WORDMARK_VIEWBOX } from "./brand-paths.ts"

/** The full MathOS logo. It takes the text colour, so it is black in the light theme and white in the dark one. */
export function Wordmark({ height = 24, className }: { height?: number; className?: string }) {
  const [, , w, h] = WORDMARK_VIEWBOX.split(" ").map(Number)
  return (
    <svg className={className} height={height} width={Math.round((height * w!) / h!)} viewBox={WORDMARK_VIEWBOX} fill="currentColor" role="img" aria-label="MathOS">
      <path fillRule="evenodd" d={WORDMARK_PATH} />
    </svg>
  )
}

/** The compact mark on its own, for places too small for the full logo (the collapsed sidebar, icons). */
export function MarkGlyph({ size = 24 }: { size?: number }) {
  const mask = `mark-cut-${useId().replace(/:/g, "")}`
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
      {/* The curve passes in front of the O with a small gap, as in the logo. */}
      <mask id={mask}><rect width="32" height="32" fill="#fff" /><path d={MARK_WAVE_PATH} fill="none" stroke="#000" strokeWidth="2.7" /></mask>
      <path mask={`url(#${mask})`} fillRule="evenodd" d={MARK_O_PATH} />
      <path d={MARK_WAVE_PATH} fill="none" stroke="currentColor" strokeWidth="1.05" strokeLinecap="round" />
      <rect x="15.5" y="1.8" width="1" height="28.4" rx=".5" />
      <circle cx="16" cy="16" r="1.85" />
    </svg>
  )
}
