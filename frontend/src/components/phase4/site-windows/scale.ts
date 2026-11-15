// The calendar's colour scale: the share of a Window with the Sun and the Earth together, in five
// steps of 20 %. It changes lightness only (one hue, dark to light), so it reads the same for every
// kind of colour blindness and in greyscale; scale.test.ts checks neighbours stay apart under
// protan, deutan and tritan simulation. Colour is never alone: every day also carries its number
// in its label and in the readout, and the legend gives each step its range.

/** Dark to light, OKLCH lightness 0.31 to 0.91 at hue ~250 (see scale.test.ts). */
export const STEPS = ['#203147', '#385a81', '#5388b9', '#7fb8e6', '#c4e7ff'] as const

/** Text that sits on a step: light on the two dark ones, dark on the rest. */
export const INK = ['#e9e7e2', '#e9e7e2', '#08090a', '#08090a', '#08090a'] as const

/** Which step a share (0 to 1) falls in: [0, 0.2) is 0, ..., [0.8, 1] is 4. */
export function stepOf(share: number): number {
  return Math.min(STEPS.length - 1, Math.max(0, Math.floor(share * STEPS.length)))
}

/** Lower and upper edge of a step, in percent. */
export function stepRange(step: number): [number, number] {
  return [step * 20, (step + 1) * 20]
}

/** The glyphs for the best, typical and worst Window, the same on the cards, the calendar and the curve. */
export const MARKS = { best: '▲', typical: '●', worst: '▼' } as const
