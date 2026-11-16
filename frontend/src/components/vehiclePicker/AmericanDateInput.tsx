import { useRef, useState, type InputHTMLAttributes, type Ref } from 'react'
import { draftOf, parseAmericanDate, syncDraft } from './americanDate'

/** A text field avoids the browser/OS reordering datetime-local into DD/MM/YYYY; the calendar button opens the browser's own picker. */
export function AmericanDateInput({ value, onChange, onBlur, withTime = true, ref, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: string; onChange: (value: string) => void; withTime?: boolean; ref?: Ref<HTMLInputElement>
}) {
  const [stored, setDraft] = useState(() => draftOf(value, withTime))
  const draft = syncDraft(stored, value, withTime)
  if (draft !== stored) setDraft(draft)
  const text = draft.text
  const native = useRef<HTMLInputElement>(null)
  return <span style={{ display: 'flex', gap: 4, position: 'relative', minWidth: 0 }}>
    <input {...props} ref={ref} type="text" lang="en-US" autoComplete="off"
      style={{ flex: 1, minWidth: 0 }}
      placeholder={withTime ? 'MM/DD/YYYY hh:mm AM/PM' : 'MM/DD/YYYY'}
      aria-invalid={text !== '' && parseAmericanDate(text, withTime) === '' || props['aria-invalid'] || undefined}
      value={text} onChange={event => {
        const next = event.target.value
        setDraft({ ...draft, text: next })
        onChange(parseAmericanDate(next, withTime))
      }}
      onBlur={event => {
        // Leaving the field with a date the parent did not take shows the date that is in use again.
        if (parseAmericanDate(text, withTime) !== value) setDraft(draftOf(value, withTime))
        onBlur?.(event)
      }} />
    {/* The browser's calendar: its value has the same layout as ours, so a pick goes straight to the parent. */}
    <input ref={native} type={withTime ? 'datetime-local' : 'date'} value={value} tabIndex={-1} aria-hidden="true"
      min={props.min} max={props.max}
      onChange={event => { if (event.target.value) onChange(event.target.value) }}
      style={{ position: 'absolute', right: 0, bottom: 0, width: 1, height: 1, opacity: 0, pointerEvents: 'none', border: 0, padding: 0 }} />
    <button type="button" aria-label="Pick from a calendar" title="Pick from a calendar"
      onClick={() => { try { native.current?.showPicker() } catch { native.current?.focus() } }}
      style={{ flex: 'none', padding: '0 9px', border: '1px solid #8b94a5', borderRadius: 6, background: '#fff', color: '#1b2433', cursor: 'pointer', font: '14px system-ui, sans-serif' }}>📅</button>
  </span>
}
