import type { components } from '../../../api/schema'

export type AssistantMessage = components['schemas']['AssistantMessage']
export type AssistantQuery = components['schemas']['AssistantQuery']
export type AssistantRequest = components['schemas']['AssistantRequest']
export type AssistantSource = components['schemas']['AssistantSource']
export type AssistantReply = components['schemas']['AssistantReply']

/** One question and, once it came back, its reply. The whole list lives in the tab only. */
export interface Turn {
  question: string
  reply: AssistantReply
}

/**
 * What happened to the question in flight. `busy` is the 503 the route sends when the engine or
 * the per-IP cap is full; it carries `Retry-After`. Over the day's budget the route answers in
 * offline mode instead, so that is a reply, not a state.
 */
export type AskStatus =
  | { status: 'idle' }
  | { status: 'waiting'; question: string }
  | { status: 'busy'; question: string; retryAfterSeconds: number }
  | { status: 'error'; question: string; code: string }

/** The contract caps a conversation at 20 messages: 10 questions and their answers. */
export const MAX_TURNS = 10
export const MAX_QUESTION_LENGTH = 2000
