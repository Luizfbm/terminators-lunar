import { useState, type InputHTMLAttributes, type Ref } from 'react'
import { draftOf, parseAmericanDate, syncDraft } from './americanDate'

/** A text field avoids the browser/OS reordering datetime-local into DD/MM/YYYY. */
export function AmericanDateInput({ value, onChange, onBlur, withTime = true, ref, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: string; onChange: (value: string) => void; withTime?: boolean; ref?: Ref<HTMLInputElement>
}) {
  const [stored, setDraft] = useState(() => draftOf(value, withTime))
  const draft = syncDraft(stored, value, withTime)
  if (draft !== stored) setDraft(draft)
  const text = draft.text
  return <input {...props} ref={ref} type="text" lang="en-US" autoComplete="off"
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
}
