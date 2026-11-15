# Lunar Landing Site Navigator

Our entry for the NASA Space Apps Challenge 2026, challenge "Lunar Landing Site Navigator".

## The product

Pick a landing Site near the lunar south pole and a Window, and the app tells you whether the lander has the Sun and the Earth, for how long, and when and why they go away. At the pole the Sun skims the horizon (about ±1.5°) and circles it, so a single ridge decides whether the solar panels work. IM-2 Athena landed a few hundred metres off target in 2025, tipped over inside a crater about 20 m across with its panels facing away from the Sun, and lost the mission in under 13 hours. That crater is smaller than our finest DEM, and our engine sees the spot sunlit the whole time: no ridge hid the Sun. Near the pole a detail that small decides a mission. That is the story the app tells.

It opens already answering a ready Query (Connecting Ridge 001, using the current UTC day, Observer height 2 m) and shows:

- the 360° Horizon mask unrolled, with the Sun's and the Earth's paths over it and a draggable Cursor;
- a timeline of the Window with sunlit, Earth visible and shadow bands;
- a Countdown to the next Sunset and Earthset, each naming its Occluder ("behind a ridge 14 km to the south-west");
- a plain sentence first, then the metrics: Sun-and-Earth time, LCIP, LCSP, sunlit hours, Earth-visible hours, mean Sun fraction;
- a Proof page with every validation, its tolerance, its result and the script behind it.

Portuguese and English, no login, the whole Query lives in the link. The full spec is the requirement; the terms are in `GLOSSARY.md` and are used exactly as written there, in code and UI.

## Where we can stand out

The competition is strong: many teams computed the horizon over the DEM and had a demo online. Feature count is not the goal. What is still ours:

- one question, asked very clearly, for a teacher as much as for a mission planner;
- the 130 Artemis Sites of Wueller et al. 2026 as a ready, citable base;
- the DEM uncertainty per Site shown as a band on the numbers (ADR 0003);
- validation against JPL Horizons and real landers (Blue Ghost 1, Chandrayaan-3, IM-2), presented in one clear slide;
- the presentation (20% of the grade): a simple story, a 30 s video, a public link.

The supporting study is represented by the scientific references and validation data in `docs/`, `validation/` and `fixtures/`.

## Where things are

| What | Where |
|---|---|
| This app | The repository root |
| Research and study | The scientific references and validation data in `docs/`, `validation/` and `fixtures/` |
| Spec and requirements | `contract/openapi.yaml`, `docs/adr/` and the product documentation |
| Vocabulary | `GLOSSARY.md` |
| Decisions | `docs/adr/` |
| API contract | `contract/openapi.yaml` |

## Stack and layout

| Path | Contents |
|---|---|
| `contract/` | `openapi.yaml` (OpenAPI 3.1), the single source of truth between backend and frontend |
| `backend/` | Python + FastAPI, spiceypy, rasterio. All computation happens here (ADR 0002) |
| `frontend/` | Vite + React + TypeScript, static build, types generated from the contract |
| `validation/` | Accuracy tests with tolerances against reference data |
| `fixtures/` | Small kernels and DEM windows for tests (the DEM windows come from a release asset, see `fixtures/README.md`) |
| `deploy/`, `.github/` | Compose stack, Caddy, data fetch script, CI and deploy |

Large data (full DEMs, SPICE kernels) lives on the VPS only.

## How we work

- Every piece of work has one clear requirement and one focused change. Main is protected: green checks and a squash merge.
- Contract first: the frontend builds against a Prism mock of `contract/openapi.yaml`, the backend is tested against the same file with schemathesis. A contract change needs Luiz's OK.
- Frontend requirements follow the specification: layout, copy in PT and EN, and states are kept aligned with the contract and product documentation.
- Browser-facing changes should be checked at desktop and mobile widths before release.
- Evidence or it didn't happen: "tests pass" means the command and its output, or the CI run.
- Every bug gets a regression test. Any bug, defect or problem we find, in review, in CI or in the running app, gets a test that fails on the code before the fix and goes in with the fix. The test says what broke and when. Backend ones live in `backend/tests/test_regressions.py`. They drive the public API and check the answer against something the code did not compute the same way.
- Mutation testing is available as a separate workflow because the full run is expensive. `backend/mutation-baseline.json` records the configured floor.
- Science is not tuned. Never change a tolerance, a reference value or a test to make a check pass; report it to Luiz.
- Commits follow Conventional Commits in English. Code and comments are in English; project communication is in Portuguese.

## Parallel work

The agent Luiz is talking to is the coordinator. It does not implement the issues itself.

- The coordinator splits the work into GitHub issues that are well separated and can run at the same time: each one touches its own files, needs no other open issue's result, and says what done looks like.
- Each issue goes to its own agent, Claude Sonnet 5.5 at high effort, on its own branch. The agent runs only the checks agents may run (see "CI gates"), opens a pull request that closes the issue, and reports back what it changed, the commands it ran with their output, and the CI run of its pull request.
- An agent never starts the app, never deploys and never touches the VPS.
- The coordinator checks the report against the diff, waits for both halves of CI to be green on the head (`mac-gates` from the Mac runner, `contract` and `schemathesis` from the VPS) and merges the pull request (squash).
- With everything green on `main`, the coordinator deploys to the VPS straight away, without asking Luiz first. Anything red stops the deploy.
- Work that cannot be split (one step needs the previous one's result) stays with the coordinator.

### Batching related pull requests

The Mac runner takes one run at a time, and any change under `frontend/` runs the full e2e (about 15 min). So when several finished pieces would run the same groups, the coordinator merges them as one pull request instead of one each:

- Batch only pieces that run the same CI groups (all frontend, or all backend) and touch different files, where none needs another's result.
- At most 3 or 4 pieces, one commit per issue, each commit closing its issue, so a failure points at one commit and that commit can be dropped while the rest merge.
- Never batch a contract change, a CI change or a deploy change with anything else.
- Backend-only and docs-only pieces don't need batching: they skip the e2e and finish in minutes.
- If a batch goes red, drop the failing commit, open its own pull request, and merge the rest. Never retry the run until it passes.

## CI gates

Every change merges only with every check green. The checks are split in two halves (decided by Luiz on 15/11/2026: the VPS runners were too slow for the heavy checks, 45 minutes from a push to green, so everything heavy moved to the Mac and the push-to-green time is about 15 minutes):

- **Heavy, on Luiz's Mac**, `scripts/ci-mac.sh`, started automatically by `.github/workflows/mac.yml` on every pull request into `main` and every push to `main`, through a self-hosted runner (`[self-hosted, macOS, lunar-mac]`) that is Luiz's Mac. On a pull request it runs only the groups the change can break (`backend/` or `validation/`: backend; `frontend/`: frontend; `contract/`, `.github/`, `scripts/`, `fixtures/` or a root file: both; docs only: neither), and a push to `main` runs both. The e2e is never cut by file. It runs two groups at the same time: the backend (ruff, ruff format, mypy, pytest with unit, integration and regression tests together, the validation suite) and the frontend (eslint, tsc, vitest, the generated-types check and the full Playwright e2e against the Prism mock, 6 workers, `LUNAR_E2E_WORKERS` changes it, on its own ports 4710 and 4773). The tests tagged `@timing` assert how long something took, so they run alone with one worker after both groups finish. No retries: a test is never re-run until it passes. It reports the commit status `mac-gates` on GitHub with the failing steps named, and the log of the failing group is printed in the run. You can also run it by hand, on a clean checkout of the head.
- **Light, on the VPS**, `.github/workflows/ci.yml` on our two runners (`deploy/runner/`, label `lunar-vps`): the contract lint and schemathesis against the contract, on every pull request into `main` and every push to `main`. The same workflow also runs the full Playwright e2e there (two shards, one worker each, software WebGL, about 40 minutes) every night at 06:00 UTC and on demand (`workflow_dispatch`), as a second opinion on the Mac's run. It does not block a merge.

Agents never run Playwright, schemathesis, the validation suite or a whole suite. Before a push they run only lint, typecheck and the unit tests of what they touched (`npx vitest run <files>`, `uv run pytest <one file>`). A new test that asserts elapsed time is tagged `@timing` (`test(title, { tag: '@timing' }, fn)`).

A pull request merges with the VPS run and `mac-gates` both green on its head. No check is skipped, retried until it passes or marked as allowed to fail. Mutation testing is not one of these gates: it runs by hand. The frontend gets regression tests with its first change, and mutation testing (Stryker) the same way as the backend.

## Deploy

Docker Compose on the VPS behind a Cloudflare Tunnel and an internal Caddy. `lunar.luizfbm.win` serves the frontend, `lunar-api.luizfbm.win` the backend (one subdomain level, so the free Cloudflare certificate covers it). Deploys are manual: after both halves of CI are green on `main`, the coordinator deploys by SSH (`deploy/compose.yaml` on the VPS), with the same steps and smoke test as `.github/workflows/deploy.yml`, which only runs by hand. VPS details stay out of this repo. The `ai-memory` tunnel on the same machine is not ours to touch.

## When to ask Luiz

A contract change, a deploy change, making the repo public, or a product decision the spec doesn't settle should be raised with Luiz.

## Agent skills

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
