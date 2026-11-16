import { useEffect, useRef, useState, type InputHTMLAttributes, type Ref } from 'react'
import { americanDate, parseAmericanDate } from './americanDate'

/** A text field avoids the browser/OS reordering datetime-local into DD/MM/YYYY. */
export function AmericanDateInput({ value, onChange, withTime = true, ref, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: string; onChange: (value: string) => void; withTime?: boolean; ref?: Ref<HTMLInputElement>
}) {
  const [text, setText] = useState(() => americanDate(value, withTime))
  const emitted = useRef(value)
  useEffect(() => {
    if (value !== emitted.current) { emitted.current = value; setText(americanDate(value, withTime)) }
  }, [value, withTime])
  return <input {...props} ref={ref} type="text" lang="en-US" autoComplete="off"
    placeholder={withTime ? 'MM/DD/YYYY hh:mm AM/PM' : 'MM/DD/YYYY'}
    aria-invalid={text !== '' && parseAmericanDate(text, withTime) === '' || props['aria-invalid'] || undefined}
    value={text} onChange={event => {
      const next = event.target.value
      setText(next)
      emitted.current = parseAmericanDate(next, withTime)
      onChange(emitted.current)
    }} />
}
