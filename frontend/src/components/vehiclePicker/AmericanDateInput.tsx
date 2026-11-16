import { useState, type InputHTMLAttributes, type Ref } from 'react'
import { americanDate, parseAmericanDate } from './americanDate'

/** A text field avoids the browser/OS reordering datetime-local into DD/MM/YYYY. */
export function AmericanDateInput({ value, onChange, withTime = true, ref, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: string; onChange: (value: string) => void; withTime?: boolean; ref?: Ref<HTMLInputElement>
}) {
  const [draft, setDraft] = useState(() => ({ source: value, withTime, text: americanDate(value, withTime) }))
  if (value !== draft.source || withTime !== draft.withTime) {
    setDraft({ source: value, withTime, text: americanDate(value, withTime) })
  }
  const text = draft.text
  return <input {...props} ref={ref} type="text" lang="en-US" autoComplete="off"
    placeholder={withTime ? 'MM/DD/YYYY hh:mm AM/PM' : 'MM/DD/YYYY'}
    aria-invalid={text !== '' && parseAmericanDate(text, withTime) === '' || props['aria-invalid'] || undefined}
    value={text} onChange={event => {
      const next = event.target.value
      const source = parseAmericanDate(next, withTime)
      setDraft({ source, withTime, text: next })
      onChange(source)
    }} />
}
