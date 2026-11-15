// The strings of the nearby Site line, in English and Portuguese. Glossary terms as written in
// GLOSSARY.md (Site, Window); the Portuguese says "Local" and "Janela", as the rest of the app does.
// The distance and the compass direction come from the app's own catalogue (`distance.km`, `direction.*`).
export const en = {
  line: 'Nearby, {site} ({distance} to the {direction}) has the Sun and the Earth for {both} in this Window, against {own} here.',
} as const

export const pt: Record<keyof typeof en, string> = {
  line: 'Perto daqui, {site} (a {distance}, para o {direction}) tem Sol e Terra por {both} nesta Janela, contra {own} aqui.',
}
