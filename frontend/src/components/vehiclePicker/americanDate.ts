/** Explicit American presentation; the stored value remains an ISO local date/time. */
export function americanDate(value: string, withTime = true): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(value)
  if (!match) return ''
  const [, year, month, day, hour, minute] = match
  const date = `${month}/${day}/${year}`
  if (!withTime) return date
  if (hour === undefined) return ''
  const h = Number(hour)
  return `${date} ${String(h % 12 || 12).padStart(2, '0')}:${minute} ${h < 12 ? 'AM' : 'PM'}`
}

export function parseAmericanDate(text: string, withTime = true): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})\s*(AM|PM))?$/i.exec(text.trim())
  if (!match) return ''
  const [, month, day, year, hour, minute, period] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) return ''
  const iso = `${year}-${month}-${day}`
  if (!withTime) return hour === undefined ? iso : ''
  if (hour === undefined || Number(hour) < 1 || Number(hour) > 12 || Number(minute) > 59) return ''
  const h = Number(hour) % 12 + (period.toUpperCase() === 'PM' ? 12 : 0)
  return `${iso}T${String(h).padStart(2, '0')}:${minute}`
}

export function localZone(): string {
  return Intl.DateTimeFormat('en-US').resolvedOptions().timeZone
}
