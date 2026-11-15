// The Earthrise of index.html (the requirement): it ticks its steps with what has really arrived and,
// once the app waits for nothing more, hands over to it. Nothing here is a timer: the only signals
// are what the app itself puts on the page.

export type StepState = 'waiting' | 'loading' | 'done'
export type Step = 'terrain' | 'sun' | 'earth'

/** What the page shows of the app's progress. */
export interface Seen {
  /** The first answer is on screen: it carries the Sun's and the Earth's paths. */
  answered: boolean
  /** The 3D code has arrived and the globe is on the page, waiting for its images. */
  globe: boolean
  /** The Moon has its colour and relief (or the globe gave up waiting for them). */
  dressed: boolean
  /** A visible StageLoading: the app is still waiting for something on the stage. */
  waiting: boolean
}

/**
 * The terrain is the 3D code and the Moon's images; the Sun's and the Earth's paths come in the
 * first answer. Once the code runs the answer is on its way, so those two are already loading.
 */
export function stepsFor(seen: Seen): Record<Step, StepState> {
  const paths: StepState = seen.answered ? 'done' : 'loading'
  return {
    terrain: seen.dressed ? 'done' : seen.globe ? 'loading' : 'waiting',
    sun: paths,
    earth: paths,
  }
}

/**
 * The app has nothing left to wait for on the stage: the Moon is dressed, or what it shows instead
 * (an error, the note of a browser that cannot draw, the ground, the Proof page) is ready.
 * No minimum time: with a warm cache this is true at once.
 */
export function readyToHandOver(seen: Seen): boolean {
  return !seen.waiting
}

export function look(root: ParentNode): Seen {
  const waiting = [...root.querySelectorAll('.stage__loading')].some((element) => !element.closest('[hidden]'))
  return {
    answered: root.querySelector('main.answer .say') !== null,
    globe: root.querySelector('.globe') !== null,
    dressed: root.querySelector('.globe[data-dressed="true"]') !== null,
    waiting,
  }
}

/** How long the fade of index.html takes at most, in case its transitionend never comes. */
const LEAVE_MS = 1600

function paint(scene: HTMLElement, steps: Record<Step, StepState>): void {
  for (const item of scene.querySelectorAll<HTMLElement>('[data-step]')) {
    const state = steps[item.dataset.step as Step]
    if (state && item.dataset.state !== state) item.dataset.state = state
  }
}

function handOver(scene: HTMLElement): void {
  const gone = () => scene.remove()
  scene.addEventListener('transitionend', (event) => {
    if (event.target === scene && event.propertyName === 'opacity') gone()
  })
  window.setTimeout(gone, LEAVE_MS)
  scene.dataset.state = 'leaving'
}

let watching = false

/**
 * Starts watching the app, once: called by every StageLoading, which the app shows from its first
 * render. Does nothing when the Earthrise is already gone.
 */
export function watchEarthrise(): void {
  if (watching) return
  const scene = document.getElementById('earthrise')
  const root = document.getElementById('root')
  if (!scene || !root || scene.dataset.state === 'leaving') return
  watching = true

  // React swaps one wait for the next in a single commit, but the condition must hold for two
  // frames, so a passing moment between two waits never ends the Earthrise early.
  let frame = 0
  const update = () => {
    const seen = look(root)
    paint(scene, stepsFor(seen))
    if (!readyToHandOver(seen)) {
      window.cancelAnimationFrame(frame)
      frame = 0
      return
    }
    if (frame) return
    frame = window.requestAnimationFrame(() => {
      frame = window.requestAnimationFrame(() => {
        frame = 0
        const now = look(root)
        paint(scene, stepsFor(now))
        if (!readyToHandOver(now)) return
        observer.disconnect()
        handOver(scene)
      })
    })
  }
  const observer = new MutationObserver(update)
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-dressed', 'hidden'] })
  update()
}
