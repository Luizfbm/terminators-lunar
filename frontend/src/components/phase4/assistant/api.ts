// The request behind the assistant (the requirement): POST /assistant, as `api/client.ts` reads the
// other routes. Pure helpers first, so the tests can drive them without a browser.
import { API_BASE_URL, ApiError, type VisibilityResult } from '../../../api/client'
import { MAX_QUESTION_LENGTH, type AssistantMessage, type AssistantQuery, type AssistantReply, type AssistantRequest, type Turn } from './types'

/** What the server sends with a 503 when it does not say, the engine queue's own wait. */
export const DEFAULT_RETRY_SECONDS = 10

/** A 503: the engine is full or this address asked too often. Carries the wait in seconds. */
export class BusyError extends ApiError {
  readonly retryAfterSeconds: number

  constructor(retryAfterSeconds: number) {
    super('busy')
    this.name = 'BusyError'
    this.retryAfterSeconds = retryAfterSeconds
  }
}

/** The Query on screen as the assistant takes it: a Curated Site by its code, a custom one by its point. */
export function assistantQuery(query: VisibilityResult['query']): AssistantQuery {
  const { site } = query
  const where =
    site.source === 'custom' ? { latitude_deg: site.latitude_deg, longitude_deg: site.longitude_deg } : { site_id: site.id }
  return { ...where, start: query.start, duration_hours: query.duration_hours, observer_height_m: query.observer_height_m }
}

/** The conversation so far and the new question, oldest first, each message within the contract's length. */
export function assistantRequest(
  turns: readonly Turn[],
  question: string,
  lang: 'en' | 'pt',
  query: VisibilityResult['query'] | null,
): AssistantRequest {
  const messages: AssistantMessage[] = turns.flatMap((turn): AssistantMessage[] => [
    { role: 'user', content: turn.question.slice(0, MAX_QUESTION_LENGTH) },
    { role: 'assistant', content: turn.reply.answer.slice(0, MAX_QUESTION_LENGTH) },
  ])
  messages.push({ role: 'user', content: question.slice(0, MAX_QUESTION_LENGTH) })
  return query ? { messages, lang, query: assistantQuery(query) } : { messages, lang }
}

/**
 * Seconds to wait after a 503. `Retry-After` first; a browser on another origin may not be let
 * read it, so then the wait the problem's `detail` names ("ask again in 12 s"), then the default.
 */
export function retryAfter(header: string | null, detail: unknown): number {
  const fromHeader = Number(header)
  if (header !== null && Number.isFinite(fromHeader) && fromHeader > 0) return Math.ceil(fromHeader)
  const named = typeof detail === 'string' ? /(\d+)\s*s\b/.exec(detail) : null
  if (named) return Math.max(1, Number(named[1]))
  return DEFAULT_RETRY_SECONDS
}

export async function askAssistant(request: AssistantRequest, signal: AbortSignal): Promise<AssistantReply> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/assistant`, {
      method: 'POST',
      signal,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })
  } catch (cause) {
    if (signal.aborted) throw cause
    throw new ApiError('network')
  }
  if (response.ok) return (await response.json()) as AssistantReply
  let problem: { code?: unknown; detail?: unknown } = {}
  try {
    problem = (await response.json()) as typeof problem
  } catch {
    // Not a problem document; the status says enough.
  }
  if (response.status === 503) throw new BusyError(retryAfter(response.headers.get('Retry-After'), problem.detail))
  throw new ApiError(typeof problem.code === 'string' ? problem.code : 'unknown')
}
