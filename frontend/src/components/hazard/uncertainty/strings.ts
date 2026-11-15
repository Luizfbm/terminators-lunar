// The line the uncertainty panel adds under a Sunset or an Earthset, in English and Portuguese.
// Glossary terms as written in GLOSSARY.md: Landing ellipse.
export const en = {
  'measured.minority': 'Only {share} of the ground inside the Landing ellipse was measured by the laser; the rest is interpolated.',
  'measured.majority': '{share} of the ground inside the Landing ellipse was measured by the laser; the rest is interpolated.',
} as const

export type MeasuredKey = keyof typeof en

export const pt: Record<MeasuredKey, string> = {
  'measured.minority': 'Só {share} do chão dentro da elipse de pouso foi medido pelo laser; o resto é interpolado.',
  'measured.majority': '{share} do chão dentro da elipse de pouso foi medido pelo laser; o resto é interpolado.',
}
