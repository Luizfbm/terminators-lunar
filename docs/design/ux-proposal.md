# UX proposal: one place to choose where you are, and a South Pole worth looking at

Written 15/11/2026, on `ui/delicate-pass`. This is a proposal, not code: nothing here is implemented yet, because the panels branch (#151) is changing `App.tsx` right now.

**Larissa's rule still holds.** Her menu, her landing panel, her vehicle picker and her level 3 screens stay as she made them. Everything below is proposed *around* them. Where an idea would touch one of her components, it is listed as a decision for Luiz, not as a change.

**How this was seen.** Our app is `ui/delicate-pass` running at `http://localhost:5310`, against the mock API on port 4810. I looked at it at 1440×900 and at 390×844 in the built-in browser. The competitors are the live sites listed in `~/dev/Luna-Investigation/docs/` (`sites-concorrentes.md`, `estudo-concorrentes-2026-11-14.md`), opened at 1440×900 on 15/11/2026. Screenshots are in `docs/design/img/`: our app in `01`–`09`, competitors in `c-*`.

> The mock answers every `/visibility` with the same example (Connecting Ridge CR01, 20–30 Nov). So after landing on a free point, the landing panel showed CR01 and 20–30 Nov while the link said `lat=-89.143`, `start=2026-11-16`, `hours=336`. I put that down to the mock, not to the app. Re-check it against the real API before calling it a bug.

---

## 1. The answer in one screen

| Question | Answer |
|---|---|
| Does the bottom switcher "From orbit / Map / From the ground" still make sense? | **No.** Two of its three buttons repeat Larissa's levels 1 and 2. Two controls that do the same thing, in two styles and two places, make people ask which one is "real". |
| Where does "From the ground" live? | **It is not a place, it is a way of looking at the Site you landed on.** It belongs to the landed Site: one "Stand here / Look from above" toggle that only exists after landing, and a "Stand here" action in the Site's hover card. It is not a fourth level, and it is not level 3. |
| One navigation model | **Larissa's menu is the only place where you choose the level** (Moon, South Pole, Level 3). A thin **breadcrumb** at the top says where you are and walks back: `Moon › South Pole › Connecting Ridge CR01 › Standing here`. The **landed Site** carries its own two camera states. The bottom pill goes away. |
| The old answer card | Not redesigned (#151 removes it). Everything below assumes Larissa's landing panel is the presentation at levels 1 and 2. |
| South Pole level | Make it **explain itself and come alive with the Cursor**: an orientation card, a legend, the Sun and the Earth on a compass ring round the map, the map lit by the Cursor's Sun, named landmarks, Region labels instead of bare counts, and (with a data decision) an illumination / permanent-shadow layer. |

---

## 2. What I saw in our app, step by step

| # | Step | Screenshot | What works | What is wrong |
|---|---|---|---|---|
| 1 | Opening, level 1 (orbit) | `img/01-level1-orbit.jpg` | Already answers a Query; the menu is a clear anchor; the strip shows Sun, Earth and the Short shadow hatch. | The Countdown card in the top right repeats what the strip says (removed by #151). The bottom pill "From orbit" is pressed *and* the menu's "Explore the Moon" is pressed: two indicators for one state. Nothing says *what to do next*. |
| 2 | "South Pole in detail" (level 2, map) | `img/02-level2-map.jpg` | The real terrain, the meridian and latitude labels (0°, 90° E, 85° S, 80° S). | The only guide is a 12 px grey sentence half hidden under the menu ("Click a Region to see its Sites, click any point to land there, or double-click…"). With the mock, two Region markers show as "1" in a circle next to "CR" and "MMO": nothing says that the number is a count of Sites, that "CR" is Connecting Ridge, or what the faint circle at 84° S is. The map is lit by a fixed light, so it does not show the Sun circling the horizon, which is the whole story of the pole. No landmarks named (Shackleton, de Gerlache, Malapert). No scale. |
| 3 | Clicking a Region | `img/03-level2-region.jpg` | The flight in is smooth; "All regions" leads back out. | The bright and dark ground reads as illumination but is only shading; no legend. The Region's other Sites show as unlabelled dots until hovered. |
| 4 | One click on the ground | `img/04-vehicle-picker.jpg` | Larissa's vehicle picker is the most beautiful screen of the app. | A **single click** opens a modal, so a click meant to look round becomes a landing. "Choose" stays disabled until an end date is typed, and nothing says why. The dates are in local time; the rest of the app is in UTC. |
| 5 | After "Choose" | `img/05-after-landing-ground.jpg` | Larissa's landing panel is the right place for the answer; the Battery row joins the strip. | The app **jumps straight to the ground view** with no transition explaining it. The top-left label reads "Level 3 · Explore", but this is *not* level 3: two different things share one name. The Hazard box sits in the middle of the sky, over the horizon the view exists to show. Behind the panel, the old answer card still shows (fixed by #151). |
| 6 | "← Back" | (no image) | Back goes to the map. | The point I landed on is **not marked** on the map afterwards: only CR01's ring shows. |
| 7 | Menu "Level 3 · Explore" | `img/06-level3-select.jpg`, `img/07-level3-prepare.jpg` | Clear title, clear limits ("Landing centres 87.5°–90° S"). | "Click inside the blue boundary", but the boundary was off screen in the zoomed Region. The prepare dialog asks for the **Rover and the dates again**, already given in the vehicle picker two steps before. |
| 8 | Phone, 390 px | `img/08-phone-orbit.jpg`, `img/09-phone-menu.jpg` | No sideways scroll (scrollWidth 390). The menu folds into a button. | The view pill is pushed below the fold; the strip takes about a quarter of the screen; the Countdown card sits between the Moon and the strip. |

**Doors that are closed in the default layout.** Larissa's layout hides the header, as Luiz decided on 15/11. With it go *Guide*, *About*, *Printable brief*, *PT/EN* and the link to the **Proof page**. Only *Ask* survives, moved into the strip. So in the default layout, a judge has no visible way to the validation. That is our strongest Validity argument, and it is two clicks away only in `?layout=classic`. Several features we built are also unreachable from the default layout: compare, slip, landing day, classroom sheet, landing dispersion ("miss"), DSN. See §6.

---

## 3. The navigation model

### 3.1 Principles

1. **One chooser.** Larissa's menu chooses the level. Nothing else on the screen changes the level.
2. **One indicator.** The breadcrumb at the top centre says where you are. The pressed menu button says the same in her style. Nothing else repeats it.
3. **Views belong to things.** "From the ground" is a way of looking at a landed Site. It shows up where that Site is (its hover card, and a toggle once landed), not as a global mode.
4. **The landing is the hinge.** Before landing you explore (levels 1 and 2). After landing, Larissa's landing panel answers, and the Site can be looked at from above or from the ground. Level 3 is the deeper dive into the 10×10 km around it.

### 3.2 The map of places

```
Larissa's menu (the only chooser)            Breadcrumb (where you are, click to go back)
---------------------------------            ---------------------------------------------
Explore the Moon        = level 1  ───────►  Moon
South Pole in detail    = level 2  ───────►  Moon › South Pole  [› Connecting Ridge]   (Region zoom)
Level 3 · Explore       = level 3  ───────►  Moon › South Pole › CR01 › 10 × 10 km

After a landing, at level 1 or 2:
  landed Site ── "Look from above" ⇄ "Stand here" ──►  Moon › South Pole › CR01 › Standing here
```

- **Bottom pill:** removed. In its place, once a Site is landed, sits a two-state toggle with the same look as the pill (it is already in Larissa's style after the delicate pass): **Above · Stand here**. Before landing, nothing is there.
- **"Stand here"** is also in the Site's hover card at level 2 (§5.7). That makes it findable before landing as a *preview*: it lands with the default vehicle, or asks for one. That is a decision for Luiz (D3).
- **The ground view's top-left label** stops saying "Level 3 · Explore" and says what it is: the breadcrumb `… › CR01 › Standing here`, with "← Back to above" as the first crumb's action.
- **Level 3** stays exactly Larissa's flow. The only proposal is behavioural (D5): pre-fill her prepare dialog with the Rover and the dates already chosen, so it does not ask twice.

**Why not a fourth menu item "On the ground"?** It would put the ground view in the right place (the one chooser), but it changes Larissa's menu (D2). It would also show a mode that makes no sense before landing.

**Why not move it inside level 3?** Level 3 is a 10×10 km area with a rover. The ground view is the 360° horizon at one point, the core of our answer. Folding the core answer into the deepest level hides it.

Inspiration: one view selector in one place, `View: Globe / South pole / Lander view` in **steppex** (https://steppex.vercel.app, `img/c-steppex.jpg`). A top segmented `Map / Surface / Compare` in **Lunar South Pole Mission Planner** (https://lunar-mission-planner-alpha.vercel.app, `img/c-mission-planner.jpg`). "Stand here in 3D" offered *from the Site* in **Peak of Eternal Light** (https://peak-of-eternal-light.pages.dev) and **Sunchaser** ("Stand here and look around", https://sunchaserapp.vercel.app).

---

## 4. Screen by screen

### Level 1, Moon (orbit)
- Remove the bottom pill (§3). **S.**
- Add the breadcrumb `Moon`, top centre, Orbitron 12 px, in the glass of her menu. **S.**
- One quiet "next step" line under the breadcrumb, shown until the first click: *"Choose South Pole in detail, or click the Moon to land anywhere."* Inspired by the "or pick a site" next to "Show me (1 minute)" in **Mission Planner**. **S.**
- Larissa's landing panel takes the right side (#151). Nothing else goes there.

### Level 2, South Pole (map)
See §5, the main section.

### After landing (levels 1 and 2)
- **Do not jump to the ground automatically.** Fly the camera to the Site, drop a landed marker that stays when you go back (fixes step 6), and show the **Above · Stand here** toggle. The landing panel opens as it does today. **M.**
- First time only, a one-line hint attached to the toggle: *"See the horizon this lander sees →"*. **S.**
- The vehicle picker opens on **"Land here"** in the bubble, not on any single click on the ground. That is how the bubble already works at level 1; level 2 should match. A single click selects and shows the readout, and the bubble's "Land" confirms. **S** (behaviour only, her picker unchanged).
- When "Choose" is disabled, say why in one line under it ("Pick an end date"), or default the end date to start + 14 d (D4). **S.**

### Ground ("Stand here")
- Breadcrumb instead of "Level 3 · Explore". **S.**
- Move the Hazard box out of the sky: a collapsed chip "Hazard: not vetoed ⓘ" bottom left, next to the compass, opening on click. The horizon stays clear. **S.**
- Keep "Why does one small hill matter so much?" (the IM-2 story); it is the best link in the app.

### Level 3
- Unchanged look (Larissa's). D5 proposes passing the Rover and dates through. When "Click inside the blue boundary" is shown, fly the camera so the boundary is in view. **S** (behaviour).

### Phone (390 px)
- Without the pill, the stage gains its row. The breadcrumb takes the top bar beside the menu button. **S.**
- The strip collapses to the Sun, Earth and Both rows plus the Cursor line. Ticks and legend open on tap. Inspired by the compact floating bar of **Sunchaser**. **M.**
- Larissa's landing panel stays as she made it. Check that her `--landing-panel-bottom` still clears the shorter strip.

---

## 5. The South Pole level: from dry to self-explaining

Order by value for the 30 s video and for a teacher. Every item names its inspiration.

| # | Idea | What the user gets | Inspiration (URL, screenshot) | Effort | Needs |
|---|---|---|---|---|---|
| 5.1 | **Orientation card on arrival**, once per visit, dismissible: *"You are looking straight down at the Moon's south pole. Here the Sun never climbs more than about 1.5°: it circles the horizon once a month, so one ridge decides whether a lander has power. Click a Region to see its Sites."* Plus "Show me (1 min)" for 5.12. | Answers "what am I looking at" in one read. | Mission Planner, "Here the Sun never climbs high" card (https://lunar-mission-planner-alpha.vercel.app, `img/c-mission-planner.jpg`); LunaWindow 3-step "How it works" (https://lunawindow.vercel.app, `img/c-lunawindow-howitworks.jpg`) | S | Copy in English (#147) |
| 5.2 | **Legend chip**, bottom left of the map, always there, collapsed to one line: `● Site  ◯ Region (n Sites)  ┄ 84° S  ☀ Sun  ◉ Earth`. Expands to "How to read the map". | Answers "what do the circle, dots, Regions and numbers mean". | Penumbra, map legend and "How to read the map" (https://penumbra-lunar.pages.dev, `img/c-penumbra.jpg`); LUNARIS sunlight legend (https://tothelunar.netlify.app/lunaris, `img/c-lunaris-sunlight-layer.jpg`) | S | |
| 5.3 | **Sun and Earth on a compass ring.** A thin ring round the map with azimuth ticks, and the Sun and the Earth as small glyphs on it at their azimuth *for the Cursor*. They move as the strip is scrubbed. | Shows the story of the pole (the Sun goes round, not up) without a word. | Long Shadows, Sun dot on the azimuth ring of the polar map (https://hvozdzvera.github.io/long-shadows/, `img/c-longshadows-cover.jpg`, `img/c-longshadows-sun-turns.jpg`) | M | Sun and Earth azimuth at the Cursor (already in `/visibility` for the chosen Site) |
| 5.4 | **Map lit by the Cursor's Sun.** The directional light of the map scene follows the Sun's azimuth at about 1.5° elevation, so shadows swing round as you scrub. Labelled "Lighting illustrative; the numbers come from the Horizon mask". | The pole becomes alive; ridges light and craters fill with shadow. The best 5 s of the video. | Long Shadows (same images); Sunchaser's terrain lit by real Sun (https://sunchaserapp.vercel.app) | M | Visual only, no computation change |
| 5.5 | **Named landmarks**, quiet Orbitron labels: Shackleton, de Gerlache, Haworth, Malapert, Nobile, Faustini, Slater, Shoemaker, Sverdrup. | Teachers and judges recognise places they have read about; Occluders named in the answer ("behind the rim of Shackleton") can be found on the map. | Long Shadows (named craters on the map); LunaWindow landmarks layer | S | Static list with IAU coordinates |
| 5.6 | **Region markers become labelled pills**: `Connecting Ridge · 14` instead of a "1" in a circle next to "CR". The Region area drawn as a soft dashed circle sized by its spread. | Answers "what is CR, what is the number". | LUNARIS dashed region circles with names (`img/c-lunaris-sunlight-layer.jpg`); Long Shadows dashed regions | S | `/regions` already has names |
| 5.7 | **Hover card on a Site**: name, source (Wueller 2026), and the actions "Land here" and "Stand here". With D6, also small Sun and Earth bars for the Window. | Answers "what can I click, what happens next". | Mission Planner site list with Sun and Earth bars and status icons (`img/c-mission-planner.jpg`) | S (without bars), M (with bars) | Bars need D6 |
| 5.8 | **IM-2 Athena on the map**, a marked point with one line: *"IM-2 tipped over in a 20 m crater here, smaller than this map can see."* Click lands there with the IM-2 Query. | Our story on the map, not only on the cover. | Long Shadows "Replay a real landing"; Penumbra "IM-2's site" chip | S | The IM-2 link already exists (`IM2_LANDING`) |
| 5.9 | **Average illumination layer and permanent shadow (PSR) layer** from NASA PGDA product 69, switchable, with a 0–100% legend. | The pole's ridges of near-constant light and its cold traps at a glance; teachers love it; planners expect it. | LUNARIS (tothelunar) "NASA map layer: Sunlight average / Earth visibility average / slope" (`img/c-lunaris-sunlight-layer.jpg`); SELENE-3D "Ice / PSR" filter | L | **D7**: data on the VPS, tiles, attribution |
| 5.10 | **"The south pole right now"**: one line over the map, *"At the Cursor: 87 of 130 Sites have the Sun, 4 see the Earth"*. Site dots tinted lit or dark at the Cursor. | Turns the map into an answer, and scrubbing becomes a show. | LUNARIS quasacode "The south pole right now" (https://lunaris.quasacode.com/en/); 404 agents dots turning green or red with time (study, 14/11) | L | **D6**: a batch endpoint (contract change) |
| 5.11 | **Scale bar and "0° up"** in the corner. | Planners need distance; a 20 m crater versus a 10 km scale tells the IM-2 story. | Mission Planner "200 km" scale | S | |
| 5.12 | **60–90 s guided tour**, 4 coach marks: the pole, a Region, land, Stand here. | One path through the app for a judge in a hurry. | Sunchaser "90-second guided tour"; Long Shadows "60-second tour"; Penumbra coach marks "1/3 · Next" (`img/c-penumbra.jpg`) | M | **D1**, because Luiz removed the guide from the default layout |

**What not to copy:** SELENE-3D's wall of toggles, file inputs and overlapping panels (https://sparkling-gecko-a794e1.netlify.app, `img/c-selene3d-clutter.jpg`). Every item above is quiet by default and opens on demand.

---

## 6. The flow end to end, seen by a teacher and by a mission planner

| Stage | Teacher | Mission planner | Proposal |
|---|---|---|---|
| Open | Needs one sentence that frames the problem. The cover and guide are off in the default layout (Luiz, 15/11). | Wants to see the Site and the Window at once. | 4 "next step" line (S); 5.1 at level 2 (S). |
| Choose a place | Needs names they know (Shackleton) and what a Region is. | Needs the 130 Wueller Sites, their source, and how they compare. | 5.5, 5.6, 5.7. **Compare** exists (`phase4/compare`) but has no door in the default layout. A "Compare" action in the Site hover card (M). |
| Land | A single click opening a modal is a surprise. | Wants the vehicle and the Window set, with sensible defaults. | Land from the bubble (S); default end date (D4). |
| Read the answer | The plain sentence first (CLAUDE.md). Larissa's panel has the numbers; check after #151 that the sentence survives. | Sun-and-Earth time, LCIP/LCSP, battery, longest night. | **Add a "Both" row to the strip** (Sun and Earth together), our headline metric, which three competitors draw as a third row (steppex, Mission Planner, LunaWindow) (S). |
| Change the date | "What if we land a week later?" is the best classroom question. | Launch slip is daily work. | **Slip chips** `+1 d +1 wk +1 mo` beside the strip's date; `phase4/slip` exists without a door (S–M). Inspired by LunaWindow "SLIP +1 d +1 wk +3 wk +1 mo" (`img/c-lunawindow.jpg`) and Mission Planner "Delay +3d +7d +14d +30d". |
| Go to the ground | The horizon is the "aha". It must not be covered. | The Occluder named and pointed at. | §4 Ground. |
| Level 3 | A rover is a game; fine. | Hazard and route matter; asked twice for the same inputs. | D5 pre-fill. |
| Trust it | — | **Proof** is our Validity card, with no door in the default layout. | **D8**: a small "How we know" link, top right in the glass, opening the Proof page (S). |
| Take it home | The classroom sheet (`phase4/classroom`) and the printable brief exist with no door. | The brief is what a planner forwards. | A "Share / Print" action in the landing panel's footer, if Larissa agrees (D2), or next to the breadcrumb (S). |

**Redundant:** the bottom view pill (vs the menu); "Level 3 · Explore" on the ground view (vs the real level 3); the Rover and dates asked twice (picker, then level 3); the Countdown card (vs the landing panel and the strip, gone with #151).

**Confusing:** a single click landing at level 2; "Choose" disabled with no reason; local time in the picker against UTC everywhere else; "CR 1" Region markers; the faint 84° S circle with no name; the Hazard box over the sky.

**Missing:** a door to Proof; a "Both" row; slip chips; named landmarks; a legend; a landed marker that stays.

---

## 7. What to remove

1. The bottom view switcher "From orbit / Map / From the ground" (its three jobs go to the menu, the breadcrumb and the landed-Site toggle).
2. The "Level 3 · Explore" label on the ground view.
3. The automatic jump to the ground view after "Choose".
4. The 12 px instruction sentence under the menu at level 2 (replaced by 5.1 and 5.2).
5. The Hazard box in the middle of the sky (moves to a chip).

---

## 8. Effort summary

| Item | Effort | Blocked by |
|---|---|---|
| Remove pill, add breadcrumb, landed-Site toggle | M | #151 merged (touches `App.tsx`) |
| No auto-jump to ground, landed marker stays | M | #151 |
| Land from the bubble at level 2; "Choose" says why | S | D4 |
| Orientation card (5.1), legend (5.2), scale (5.11) | S | — |
| Landmarks (5.5), Region pills (5.6), hover card (5.7), IM-2 on the map (5.8) | S each | — |
| Sun and Earth on the compass ring (5.3), map lit by the Cursor's Sun (5.4) | M each | — |
| "Both" row in the strip | S | — |
| Slip chips, Compare door, Proof door, Share/Print door | S–M each | D8, D2 |
| Hazard chip on the ground view | S | — |
| Guided tour (5.12) | M | D1 |
| Illumination / PSR layer (5.9) | L | D7 |
| Site status at the Cursor, "the pole right now" (5.10) | L | D6 (contract) |
| Pre-fill level 3 from the picker | S | D5 |
| Phone: compact strip | M | — |

A sensible first batch (one day, no contract change, parallel-safe once #151 lands) has four parts. 5.1, 5.2, 5.5, 5.6 and 5.11 touch the map overlay files. The "Both" row touches the strip. The breadcrumb, pill removal and landed toggle touch `App.tsx` and the stage. The Hazard chip touches the ground view. Then 5.3 and 5.4 together, for the video.

---

## 9. Decisions for Luiz

- **D1. Tour or no tour.** You took the guide out of the default layout. Do we bring back a *short* 60–90 s coach-mark tour (5.12) that only starts on "Show me"? Or keep the default layout guide-free and rely on 5.1 and 5.2?
- **D2. May we add one entry to Larissa's menu or panel?** For example "Stand here" in the menu, or "Share / Print" in the landing panel footer. The proposal works without it (toggle on the stage, actions by the breadcrumb), but she should be asked.
- **D3. "Stand here" before landing.** Should the Site hover card offer "Stand here" as a preview with a default vehicle? Or only after the vehicle is chosen?
- **D4. Default end date in the vehicle picker** (start + 14 d)? Or keep it blank and only explain why "Choose" is disabled?
- **D5. Level 3 pre-filled** with the Rover and dates from the picker? This is a behaviour change in Larissa's flow, not in her look.
- **D6. Batch Sun and Earth state for all Sites at a time** (or per Window). It is a **contract change**: one endpoint returning, for the 130 Sites, Sun fraction and Earth visible at the Cursor, or the shares over the Window. It unlocks 5.7 bars and 5.10.
- **D7. Illumination and PSR layer** from NASA PGDA product 69 on the VPS: data fetch, tile size, attribution. It is a **deploy and data change**.
- **D8. A door to the Proof page** in the default layout (a small "How we know" link). Without it, the Validity story is invisible to judges.
- **D9. Remove the bottom view pill** as proposed (§3)? It changes muscle memory, and an e2e spec (`identity.spec.ts`) asserts it.

---

## 10. Simplicity first (update, 15/11/2026, about 22:05 BRT, seen on https://lunar.luizfbm.win)

Luiz's goal, now the rule for everything above: **someone who knows nothing about the Moon gets the whole experience without help.** One idea per screen, plain words, one obvious next step, no jargon on screen. Re-read through that lens, the proposal changes like this.

- **Cut from the first pass:** 5.9 (illumination and PSR layer), 5.10 ("the pole right now"), the slip chips and the Compare door. They are good for a planner and noise for a child. They move to "Advanced" (pattern P5 below).
- **Keep and move up:** 5.1 (one-sentence orientation card), the breadcrumb, removing the bottom pill, and 5.3 with 5.4 (the Sun going round). That last pair is the single picture that explains the pole without words.
- **Rename on screen** (the GLOSSARY terms stay in code; on screen they get plain words or a one-line explanation, which is **decision D10**):
  - "Window" becomes "your dates";
  - "Cursor" becomes "the moment you are looking at";
  - "Horizon mask" becomes "the hills around the lander";
  - "Occluder" becomes "what hides it";
  - LCIP, LCSP, DEM, P90, Multiresolution and "vetoed" only appear in an Advanced view;
  - coordinates come after the name and the plain sentence, never first.

### Patterns from the competitors, on intuition only

| # | Pattern | Where | What it looks like |
|---|---|---|---|
| P1 | **One sentence, one button.** The first thing you see says why the pole is special in words a child understands, with one primary action and one quiet alternative. | Lunar South Pole Mission Planner, https://lunar-mission-planner-alpha.vercel.app ("Here the Sun never climbs high." with "Show me (1 minute)" or "pick a site", `img/c-mission-planner.jpg`) | A small card: 3 lines, 1 button |
| P2 | **Three numbers a child can feel** instead of tables: "1.6° highest Sun", "358 m shadow of a 10 m mast", "29.5 d one turn of the Sun". | Long Shadows, https://hvozdzvera.github.io/long-shadows/ (`img/c-longshadows-cover.jpg`) | Big number, three-word caption |
| P3 | **"How it works" in 3 steps**: pick a site, pick a date, read your result, plus "There is no limit of tries". It lowers the fear of clicking. | LunaWindow, https://lunawindow.vercel.app (`img/c-lunawindow-howitworks.jpg`) | One modal on demand, never forced |
| P4 | **Ready-made questions as buttons** instead of empty fields: "IM-2's site", "Best region on this date", "Land 2 days early". | Penumbra, https://penumbra-lunar.pages.dev (`img/c-penumbra.jpg`) | 3 chips over the map |
| P5 | **Plain by default, exact on demand**: a Standard/Advanced (or Simple/Expert) switch. Plain words first; the tables, P90s and coordinates live behind it. | Long Shadows ("Standard / Advanced"); steppex, https://steppex.vercel.app ("Simple / Expert", `img/c-steppex.jpg`); Mission Planner ("Mission planner" toggle) | One switch, top right |

### Level 3: inconsistencies against the tokens of `ui-direction.md`

Seen in production and in these files on `main` (db9a9f3): `frontend/src/components/exploration/exploration.css`, `hazard/inspector/inspector.css`, `hazard/safety/safety.css` and `rover/rover.css`.

| # | Where | Today | Tokens say | Changes Larissa's layout? |
|---|---|---|---|---|
| L1 | `.exploration-eyebrow` ("LEVEL 3 · SOUTH POLAR CORE", "LEVEL 3 · ON THE SURFACE") | Archivo 10 px, weight 700, tracking 0.14em, cyan `#6aafc9` | Orbitron (`--label-font`) 500, `--label`, `--label-track`, `--dim` | No |
| L2 | `.exploration-select` card | A blue-teal palette of its own: background `#101a20f2`, border `#36515e`, 16 px radius, 14 px text | `--glass`, `--glass-edge`, `--radius-panel` (10 px), `--small` or `--body` | No (colours and radius only) |
| L3 | Buttons in the select card and the inspector | Pale cyan fill `#d7f2fa`, 7 px radius; "Land & explore" in navy `#183845` | Stone, like the menu: `--stone`, black text, bevel, `--radius-control` | No |
| L4 | Inputs | White fields `#fff` with dark text inside a dark card | `--field` and `--edge`, as in the rest of the app | No |
| L5 | `.landing-inspector` dialog ("Your 10 × 10 km landing area") | **Light theme** (`#f3f5f6`, dark text, 18 px radius): the only light screen in the app | Dark glass | **Yes**, it is Larissa's dialog: **decision D11** |
| L6 | `hazard/inspector` | `--mono` for labels as well as values; neon green `#5dff9b`, reds `#f8443a` and `#9a3a35`, blue `#3f7f9a` | Mono for numbers only. The only meaning colours are Sun amber, Earth blue and `--error`; a muted green would need a new token | No |
| L7 | `hazard/safety` ("Hazard not vetoed", Normal navigation / Multiresolution P90) | Mono, a HUD-style box over the sky, jargon | Archivo, plain words, a collapsed chip (§4, Ground) | Chip placement: D11 |
| L8 | `rover/rover.css` | `--mono` on four label blocks (around lines 110, 180, 210, 240); serif headings | Mono for numbers only; Orbitron labels; serif only for statements | No |
| L9 | `terrain-curtain` (the 80 m / 20 m comparison) | Background `#18232b`, text `#bdd4df`, cyan accent `#91cde7` | `--glass`, `--dim`, accent `--stone` or `--mark` | No |

### (a) Quick wins for tonight (about 15 min for one person, copy and CSS only, low risk)

Each item names the test that has to change in the same commit, where there is one.

1. **A plain explanation in the landing panel.** In `frontend/src/components/landing/panelStrings.ts`, replace `en['landingPanel.noteSite']` with *"Sun: part of the Sun is above the hills around the lander. Earth: the Earth is above them, so the lander can talk to home."* Replace `en['landingPanel.note']` with *"Sun: part of the Sun is above the hills around the lander. Earth: the Earth is above them, so the lander can talk to home. Link means only that the Earth is in view; a real call also needs a dish on Earth pointed at the Moon."* No test asserts either string.
2. **Panel title** (`panelStrings.ts`): `'landingPanel.label': 'Landing information'` becomes `'Your landing'`. No test asserts it.
3. **Panel hint** (`panelStrings.ts`): `'landingPanel.hint': 'Choose a period to move the Cursor to its start.'` becomes `'Tap a period to jump there on the timeline.'` No test asserts it.
4. **Strip legend** (`frontend/src/i18n/messages.ts`, key `strip.shortShadow`): `'Hatched: Short shadow (under {hours} h)'` becomes `'Striped: a short shadow, under {hours} h'`. Change `e2e/default-query.spec.ts:56` to `'Striped: a short shadow, under 12 h'` in the same commit.
5. **Level 3 eyebrow in the house font** (`frontend/src/components/exploration/exploration.css`, line 2): `.exploration-eyebrow{font-family:var(--label-font);font-size:var(--label);letter-spacing:var(--label-track);font-weight:500;color:var(--dim)}`. No layout change and no test.
6. **Level 3 select card on the house glass** (same file, line 1). In `.exploration-select`, swap `border:1px solid #36515e` for `border:1px solid var(--glass-edge)`, `border-radius:16px` for `border-radius:var(--radius-panel)`, and `background:#101a20f2` for `background:rgba(48,48,48,.92)`. Colours and radius only. Check that axe stays green.

**Do not touch tonight** anything these tests assert:
- `uncertainty.spec.ts` and `uncertainty.test.ts`: the "height error" lines;
- `safety.test.ts`: "Hazard not vetoed";
- `level3.spec.ts`: "Choose your landing area" and "Inspect 10 × 10 km";
- `transitions.spec.ts`: "From the ground".

They are all simplicity wins, but each one needs its tests rewritten.

### (b) If it does not ship: what to say and show in the pitch and the video

- Open with our version of P2: *"At the Moon's south pole the Sun never climbs higher than your hand held flat. It goes round the sky once a month. A hill the size of a house can switch a lander off."* Then the globe turns to the pole.
- Say the whole product in one line: *"Pick a spot, pick your dates, and we tell you when your lander has sunlight and can call home, and which hill takes them away."*
- Show three clicks only: South Pole in detail, a spot, "Land". Then Larissa's vehicle picker. Then the panel's two sentences, read aloud.
- Show the strip being dragged while the Sun goes down behind a named ridge. That is the "aha"; keep numbers off screen while it plays.
- End on IM-2: *"Athena landed a few hundred metres off target and lost its mission in 13 hours. That crater is smaller than any map we have. Near the pole, small things decide a mission."*
- Leave level 3, the hazard box and the Advanced numbers out of the 30 s video. Keep them for the "for engineers" slide.

### (c) The rest, ranked by impact on simplicity

1. **Plain words on screen per D10** (Window, Cursor, Horizon mask, Occluder), with their tests. M.
2. **P1 orientation card at levels 1 and 2** (§5.1): one sentence and one button. S.
3. **Remove the bottom pill, add the breadcrumb and the landed-Site toggle** (§3). M.
4. **P5 Simple/Advanced switch.** Coordinates, P90, Multiresolution, "height error", LCIP/LCSP and the hazard box all go behind Advanced. M.
5. **The Sun going round the compass ring and lighting the map** (5.3, 5.4). M.
6. **Land only from the bubble, a default end date, no auto-jump to the ground** (§4). S–M.
7. **P4 ready-made questions** over the map: "Where IM-2 tipped over", "The sunniest ridge", "Land a week later". S.
8. **Level 3 token alignment L1–L9** beyond the quick wins, and **D11** for the light dialog. M.
9. **P3 "How it works" in 3 steps**, on demand (D1). S.
10. Everything else in §5–6 (layers, the pole right now, Compare, slip chips), behind Advanced. L.

### New decisions

- **D10. Plain words on screen** for the GLOSSARY terms (Window, Cursor, Horizon mask, Occluder). CLAUDE.md asks for the glossary terms exactly as written in the UI; simplicity asks for plain words. Proposal: plain words on screen, glossary terms in code and in Advanced.
- **D11. Level 3 dialogs in the dark glass** like the rest of the app, and the hazard box as a chip. Both change Larissa's level 3 screens.
