# UI direction: one quiet visual language, taken from Larissa's menu

Written 15/11/2026. Scope: the look of the app (CSS, tokens, the marks drawn on the globe). Nothing here changes a computation, a string, a layout decision or a behaviour.

## The rule that comes first

**Whatever Larissa designed is the reference and stays exactly as she made it.** That covers the grey side menu on the left of the globe ("Explore the Moon", "South Pole in detail", "Initial position", "Dark side", ..., "Planets"), her landing panel, her vehicle picker and the level 3 screens. We do not restyle her components, not even lightly with the tokens. The tokens below are *read off her look*, so the rest of the app comes to match her, never the other way round. (Luiz, 15/11/2026.)

Where we are free to refine: the N and S pole letters, the marks on the globe (Site dots, the circle round the pole, the Equator, labels, the "Land" bubble), and the pieces that do not match her yet: the bottom timeline and the view switcher.

## What is wrong today

Seen on https://lunar.luizfbm.win at 1366 px and 390 px on 15/11/2026:

- Larissa's menu speaks one language: a smoky grey glass panel, warm stone buttons with a bevel, Orbitron in small letter-spaced type. Nothing else on the screen speaks it.
- The pole letter "S" is a 22 px bold white glyph with a heavy black outline, sitting right on the Site. It is the loudest thing on the Moon.
- The circle round the pole and the Site dots are saturated (pure white dots on a black base, `#5ef2c8` teal); the Equator is a ring of `#ffd400` yellow dots that reads as a second Sun path.
- The "Land" bubble is a white pill with black Orbitron on a bright orange pulsing dot: a sticker on top of the scene.
- The timeline is a full-width flat band with hard 12 px rectangles in saturated amber and blue, a white Cursor bar and dates in mono: a spreadsheet under a planetarium.
- The view switcher is a generic dark segmented control in Archivo, a third style next to the menu and the timeline.

## What the best competitors do (seen 15/11/2026, built-in browser, 1366 px)

Picked from `Luna-Investigation/docs/sites-concorrentes.md` and `estudo-concorrentes-2026-11-14.md` by their Presentation notes and the study's "reference" calls.

| Site | What works | What we take |
|---|---|---|
| **Sunchaser** https://sunchaserapp.vercel.app (the study's reference) | Inter UI, Space Grotesk heads, JetBrains Mono for numbers. Every overlay is one family: "glass" panels with a 1 px border at 13% of the text colour, 14 px radius, an inset 1 px top highlight and a long soft drop shadow. Site labels on the globe are small 13 px pills (`rgba(10,12,16,.78)`, 1 px border at 45% of the layer colour, 999 px radius). The timeline floats as a glass bar; its bands are about 6 px tall, rounded, and the amber and blue fade at the ends; the Cursor is a small round knob, not a bar. Motion: one easing `cubic-bezier(.2,.7,.2,1)`, 240 ms. | The floating timeline with thin rounded bands and a knob; one panel recipe for every overlay; labels as quiet pills tinted by their layer; one easing. |
| **POLAR WINDOW** https://polarwindow.ahbab.tech | Archivo variable, title 72 px / 600 / −2 px; eyebrows 11 px / 600 / uppercase / 1.54 px tracking in a cool grey; body 16–19 px at `#9aa5b1`. Few sizes, lots of air. Its design doc's motion rules: an indicator slides between options; 160 ms touch, 240 ms swap. | Small uppercase letter-spaced eyebrow labels as the third voice; a sliding, not jumping, "chosen" state; three or four sizes only. |
| **Lunar Landing Site Navigator (birgit-ct)** https://birgit-ct.github.io/lunar-landing-site-navigator/ (Presentation 5) | Manrope body, Unbounded heads. Borders at 9% white, fills at 3% white, chosen card with a 1.5 px light edge. The Site on the globe is a thin dashed reticle round small soft dots; names in a small light sans with no outline. | Marks drawn with hairlines, not filled shapes; low-alpha white edges instead of black outlines. |
| **Peak of Eternal Light** https://peak-of-eternal-light.pages.dev (Influence 5) | Saira condensed, 12 px / 600 / 1.25–1.9 px tracking for every label; a strict HUD of hairline frames. Timeline rows with tiny row names and the months under. | Confirms the small-tracked label voice for the timeline rows. The HUD frames are not for us: too technical for the teacher. |

Common thread among the best: one panel recipe, hairline borders in low-alpha white, small letter-spaced labels, thin rounded data bands, nothing with a black outline.

## The direction

Larissa's menu already has that quality, in her own warm key: grey smoky glass, warm stone, Orbitron. We extend it.

1. **Three voices, no more.** Orbitron (her face) for small labels on the scene and on controls: uppercase-free, 500, letter-spaced 0.06–0.08 em. Archivo for reading. IBM Plex Mono for numbers and dates. Instrument Serif stays for the statements (the e2e suite pins it).
2. **One panel recipe**, hers: `rgba(60,60,60,.72)` with `blur(4px)`, a hairline `rgba(255,255,255,.16)` edge, a soft `0 6px 24px rgba(0,0,0,.5)` shadow, small radii (3 px on buttons, 8–10 px on panels).
3. **Warm stone as the neutral accent.** Her `#857b6c` stone (and its pressed `#464139`) is the chosen state everywhere else too, not a cold dark grey.
4. **Marks on the Moon are hairlines and small soft dots**, never bold glyphs or black outlines. The Sun's amber and the Earth's blue stay the only saturated colours (CLAUDE.md: they mean something).

## Tokens

All in `frontend/src/index.css` `:root`. Existing tokens keep their names and values where tests pin them (`--bg`, `--fg`, `--dim`, `--sun`, `--earth`, `--track`, `--hatch`, `--error`; see `src/styles/contrast.test.ts`).

### Type

| Token | Value | Use |
|---|---|---|
| `--label-font` | `Orbitron, system-ui, sans-serif` | Larissa's face: labels on the scene, view switcher, timeline row names |
| `--label` | `0.75rem` (12 px, the size of her menu labels at 1366 px) | the one label size (10 px for the crowded mission names on the globe) |
| `--label-track` | `0.08em` | tracking for every Orbitron label |
| `--small` | `0.8125rem` (13 px), unchanged | secondary text, dates |
| `--body` | `1rem`, unchanged | reading |
| `--display` | unchanged | the serif statements |

Four sizes: 12, 13, 16, display. Body Archivo, numbers IBM Plex Mono (both already loaded from Google Fonts in `index.html`). Orbitron 500/600 comes from `@fontsource/orbitron`; Larissa's `GlobeMenu.tsx` imports it, and `main.tsx` now imports it too, so the labels have it even where her menu is not mounted.

### Colour

| Token | Value | From |
|---|---|---|
| `--glass` | `rgba(60, 60, 60, 0.72)` | Larissa's menu panel |
| `--glass-blur` | `blur(4px)` | Larissa's menu panel |
| `--glass-edge` | `rgba(255, 255, 255, 0.16)` | her button edge |
| `--glass-rule` | `rgba(255, 255, 255, 0.28)` | her menu rule |
| `--glass-shadow` | `0 6px 24px rgba(0, 0, 0, 0.5)` | her menu panel |
| `--stone` | `#857b6c` | her button |
| `--stone-hover` | `#908676` | her hover |
| `--stone-deep` | `#464139` | her pressed button |
| `--stone-ink` | `#bdbdbd` | her pressed text (5.4:1 on `--stone-deep`) |
| `--mark` | `#ece6da` | warm white for hairlines and names on the Moon (her stone family, lifted) |
| `--sun` `#f5bd3a`, `--earth` `#9cc0ff` | unchanged | the only two colours that mean something |
| `--track` `#62636b`, `--hatch` `#c4c5cb` | unchanged | 3:1 rules of the strip |

On the globe (Three.js colours, `Globe.tsx` / `domain/markers.ts`):

| Mark | Before | After |
|---|---|---|
| Site dot | `#5ef2c8` teal, 7 px, thick black ring | `#b9d3c4` soft sage, 6 px, thin dark ring (luminance stays > 150, pinned by `markers.test.ts`) |
| Mission dot | white, 7 px | white, 7 px (pinned) with the same thin ring |
| Equator | `#ffd400` dots over a black base | **unchanged**: Larissa's mark (#60) |
| Circle round the pole | white 2 px dots over a 4 px black base | warm white `#ece6da` at 0.6 over a 3 px base at 0.25 |
| Pole dot | white | warm white at 0.75 |

### Shape, space, motion

| Token | Value |
|---|---|
| `--radius-control` | `3px` (her buttons) |
| `--radius-panel` | `10px` (her panel at `--s` 1) |
| `--radius-pill` | `999px` |
| `--ease` | `cubic-bezier(0.2, 0.7, 0.2, 1)` |
| `--t-fast` / `--t-swap` | `160ms` / `240ms` |

## Component changes

None of these touches Larissa's files (`GlobeMenu.tsx`, the `.globe-menu*` rules, her landing panel, vehicle picker, level 3) or any string.

1. **Pole letters** (`.globe__poles`, `POLE_LETTER_*` in `Globe.tsx`): about half the size, Orbitron 500 instead of bold Archivo, warm white at 0.85, no black outline (a soft 1 px dark halo through `paint-order` at low alpha only), the stem a 0.5 px hairline at 0.45. Placement logic (`poleMark`, `letterClear`) unchanged.
2. **Marks on the Moon** (`Globe.tsx` `markDots` calls, `dotTexture`, `domain/markers.ts`): colours and opacities as in the table; the Site dot's dark ring thinner and half-transparent. The Equator is Larissa's and stays.
3. **Chosen Site ring** (`.globe__chosen`): 1.5 px warm-white ring with a soft glow instead of a 2 px ring and a hard dark double shadow; still amber while lit.
4. **Labels on the globe** (`.globe__pin`, `.globe-mark__name`, `.globe__planets span`, `.globe__name`): Orbitron 500 at the label size with tracking, warm white, a soft shadow instead of the stacked black halos.
5. **"Land" bubble** (`.globe-land__*`): the bubble becomes a small glass pill in her recipe (grey glass, hairline edge, warm-white Orbitron), the tail in the same glass; the dot is warm white with a stone ring and a slower, fainter pulse.
6. **View switcher** (`.views`): her panel recipe; buttons in Orbitron at the label size; the chosen one in her stone, with the bevel of her buttons, so it reads as part of the menu.
7. **Timeline** (`.strip*`): the strip becomes a glass bar like her panel; row names in Orbitron labels; bands 8 px tall with rounded ends; the Cursor a thin warm-white line with a small round knob; ticks in the 11 px label voice; the play button a stone circle with her bevel. `--track`, `--sun`, `--earth`, `--hatch` keep their values (contrast test).
8. **Tokens** added to `:root` and used by the above. Existing tokens untouched.

## Checks that pin the look (do not break)

- `src/styles/contrast.test.ts`: `--bg`, `--track`, `--sun`, `--earth`, `--hatch`, `--fg`, `--dim`, `--error` values and ratios.
- `src/domain/markers.test.ts`: missions white, Sites another colour with luminance > 150, sizes 6–12 px.
- `e2e/identity.spec.ts`: `.views` has a solid border; chosen and unchosen view buttons have different fills; statements in Instrument Serif, numbers in IBM Plex Mono.
- `e2e/globe-menu.spec.ts`: Larissa's menu colours, radius and Orbitron (we do not touch it).
- `e2e/globe-planets.spec.ts`: a pole letter never covers the Sun or the Earth (geometry unchanged).
- axe (WCAG AA) in the e2e suite: every text colour above is ≥ 4.5:1 on its background.
