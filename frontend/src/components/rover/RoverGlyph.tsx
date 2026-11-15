import type { Rover } from './types'

/** The tallest mast we draw; taller ones are clipped to it so the glyph keeps its frame. */
const MAST_SCALE_M = 2.6

/**
 * A small drawing of a rover from its own numbers, not a model of it: the body grows with the
 * mass, the mast is as tall as the catalogue says, the panels show when it has any, and a canister
 * shows when it carries an RTG. Decorative.
 */
export function RoverGlyph({ rover }: { rover: Rover }) {
  const mast = Math.min(rover.mast_height_m, MAST_SCALE_M) / MAST_SCALE_M
  const body = 22 + 14 * Math.min(1, Math.log10(Math.max(rover.mass_kg, 1)) / 3)
  const mastTop = 32 - mast * 26
  const bodyLeft = 60 - body
  return (
    <svg className="rover-glyph" viewBox="0 0 120 72" aria-hidden="true" focusable="false">
      <line x1="4" y1="64" x2="116" y2="64" className="rover-glyph__ground" />
      {rover.solar_w > 0 ? <rect x={bodyLeft - 4} y="30" width={body * 2 + 8} height="4" rx="1" className="rover-glyph__panel" /> : null}
      <rect x={bodyLeft} y="34" width={body * 2} height="16" rx="3" className="rover-glyph__body" />
      {rover.rtg_w > 0 ? <rect x={60 + body - 2} y="38" width="12" height="7" rx="2" className="rover-glyph__rtg" /> : null}
      <line x1="60" y1="34" x2="60" y2={mastTop} className="rover-glyph__mast" />
      <circle cx="60" cy={mastTop} r="3" className="rover-glyph__head" />
      {[-0.7, 0, 0.7].map((at) => (
        <circle key={at} cx={60 + at * body} cy="56" r="7" className="rover-glyph__wheel" />
      ))}
    </svg>
  )
}
