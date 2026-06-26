// Minimal Unix-style cron schedule matcher with 5 fields:
//   minute(0-59) hour(0-23) day-of-month(1-31) month(1-12) day-of-week(0-6, 0|7 = Sunday)
//
// Supported per field: '*', lists 'a,b,c', ranges 'a-b', steps '*/n' and 'a-b/n' (and 'a/n' = a..max/n).
// Month and day-of-week also accept 3-letter names (jan..dec, sun..sat, case-insensitive).
// When BOTH day-of-month and day-of-week are restricted (not '*'), the schedule matches if EITHER
// matches — this is the standard Vixie-cron behaviour.
//
// Resolution is one minute, which is what cron itself offers (e.g. "0 * * * *" = every full hour).
// Parsed schedules are cached by expression string so the poller can re-resolve cheaply each tick.

const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}
const DOW_NAMES: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
}

export class CronSchedule {
  private static cache = new Map<string, CronSchedule>()

  private constructor(
    private readonly minutes: Set<number>,
    private readonly hours: Set<number>,
    private readonly daysOfMonth: Set<number>,
    private readonly months: Set<number>,
    private readonly daysOfWeek: Set<number>,
    private readonly domRestricted: boolean,
    private readonly dowRestricted: boolean
  ) {}

  // Parses an expression, throwing on invalid input. Results are cached by expression string.
  static parse(expression: string): CronSchedule {
    const cached = CronSchedule.cache.get(expression)
    if (cached) return cached
    const fields = expression.trim().split(/\s+/)
    if (fields.length !== 5)
      throw new Error('cron expression must have 5 fields (minute hour day-of-month month day-of-week): "' + expression + '"')
    const minutes = CronSchedule.parseField(fields[0], 0, 59)
    const hours = CronSchedule.parseField(fields[1], 0, 23)
    const daysOfMonth = CronSchedule.parseField(fields[2], 1, 31)
    const months = CronSchedule.parseField(fields[3], 1, 12, MONTH_NAMES)
    const daysOfWeek = CronSchedule.parseField(fields[4], 0, 7, DOW_NAMES)
    if (daysOfWeek.delete(7)) daysOfWeek.add(0) // normalize Sunday
    const schedule = new CronSchedule(minutes, hours, daysOfMonth, months, daysOfWeek, fields[2] !== '*', fields[4] !== '*')
    CronSchedule.cache.set(expression, schedule)
    return schedule
  }

  // Whether the given local time matches this schedule (to minute resolution).
  matches(date: Date): boolean {
    if (!this.minutes.has(date.getMinutes())) return false
    if (!this.hours.has(date.getHours())) return false
    if (!this.months.has(date.getMonth() + 1)) return false
    const domMatch = this.daysOfMonth.has(date.getDate())
    const dowMatch = this.daysOfWeek.has(date.getDay())
    if (this.domRestricted && this.dowRestricted) return domMatch || dowMatch
    if (this.domRestricted) return domMatch
    if (this.dowRestricted) return dowMatch
    return true
  }

  private static parseField(field: string, min: number, max: number, names?: Record<string, number>): Set<number> {
    const result = new Set<number>()
    for (const part of field.split(',')) {
      if (part.length === 0) throw new Error('empty cron field segment in "' + field + '"')
      let range = part
      let step = 1
      const slash = part.indexOf('/')
      if (slash >= 0) {
        range = part.slice(0, slash)
        step = Number(part.slice(slash + 1))
        if (!Number.isInteger(step) || step <= 0) throw new Error('invalid step in cron field "' + field + '"')
      }
      let lo: number
      let hi: number
      if (range === '*') {
        lo = min
        hi = max
      } else {
        const dash = range.indexOf('-')
        if (dash > 0) {
          lo = CronSchedule.parseValue(range.slice(0, dash), names)
          hi = CronSchedule.parseValue(range.slice(dash + 1), names)
        } else {
          lo = CronSchedule.parseValue(range, names)
          hi = slash >= 0 ? max : lo // 'a/n' means a..max stepped by n
        }
      }
      if (lo < min || hi > max || lo > hi) throw new Error('cron field "' + field + '" out of range ' + min + '-' + max)
      for (let v = lo; v <= hi; v += step) result.add(v)
    }
    return result
  }

  private static parseValue(token: string, names?: Record<string, number>): number {
    if (names) {
      const named = names[token.toLowerCase()]
      if (named != undefined) return named
    }
    const value = Number(token)
    if (!Number.isInteger(value)) throw new Error('invalid cron value "' + token + '"')
    return value
  }
}
