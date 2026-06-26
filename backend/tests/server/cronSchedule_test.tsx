import { expect, test } from 'vitest'
import { CronSchedule } from '../../src/server/cronSchedule.js'

test('"0 * * * *" matches every full hour only', () => {
  const c = CronSchedule.parse('0 * * * *')
  expect(c.matches(new Date(2026, 5, 26, 14, 0))).toBe(true)
  expect(c.matches(new Date(2026, 5, 26, 0, 0))).toBe(true)
  expect(c.matches(new Date(2026, 5, 26, 14, 1))).toBe(false)
  expect(c.matches(new Date(2026, 5, 26, 14, 30))).toBe(false)
})

test('"* * * * *" matches any minute', () => {
  const c = CronSchedule.parse('* * * * *')
  expect(c.matches(new Date(2026, 0, 1, 0, 0))).toBe(true)
  expect(c.matches(new Date(2026, 11, 31, 23, 59))).toBe(true)
})

test('minute step "*/15 * * * *"', () => {
  const c = CronSchedule.parse('*/15 * * * *')
  const cases: [number, boolean][] = [
    [0, true], [15, true], [30, true], [45, true], [1, false], [7, false], [46, false],
  ]
  for (const [m, ok] of cases) expect(c.matches(new Date(2026, 5, 26, 10, m))).toBe(ok)
})

test('hour list and range "0 8-10,18 * * *"', () => {
  const c = CronSchedule.parse('0 8-10,18 * * *')
  const cases: [number, boolean][] = [[8, true], [9, true], [10, true], [18, true], [11, false], [0, false]]
  for (const [h, ok] of cases) expect(c.matches(new Date(2026, 5, 26, h, 0))).toBe(ok)
  expect(c.matches(new Date(2026, 5, 26, 8, 30))).toBe(false) // minute must still be 0
})

test('"a/n" means a..max stepped by n', () => {
  const c = CronSchedule.parse('5/20 * * * *') // 5, 25, 45
  for (const [m, ok] of [[5, true], [25, true], [45, true], [0, false], [15, false]] as [number, boolean][])
    expect(c.matches(new Date(2026, 5, 26, 10, m))).toBe(ok)
})

test('month and day-of-week names', () => {
  const d = new Date(2026, 5, 26, 6, 0) // June 26 2026, 06:00
  const names = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  const dow = names[d.getDay()]
  expect(CronSchedule.parse('0 6 * jun ' + dow).matches(d)).toBe(true)
  expect(CronSchedule.parse('0 6 * jul ' + dow).matches(d)).toBe(false) // wrong month
  expect(CronSchedule.parse('0 6 * jun ' + names[(d.getDay() + 1) % 7]).matches(d)).toBe(false) // wrong dow
})

test('day-of-month OR day-of-week when both are restricted (Vixie semantics)', () => {
  const c = CronSchedule.parse('0 0 1 * mon') // midnight on the 1st OR any Monday
  expect(c.matches(new Date(2026, 5, 1, 0, 0))).toBe(true) // the 1st

  const monday = new Date(2026, 5, 2, 0, 0)
  while (monday.getDay() !== 1 || monday.getDate() === 1) monday.setDate(monday.getDate() + 1)
  expect(c.matches(monday)).toBe(true) // a Monday that is not the 1st

  const neither = new Date(2026, 5, 2, 0, 0)
  while (neither.getDate() === 1 || neither.getDay() === 1) neither.setDate(neither.getDate() + 1)
  expect(c.matches(neither)).toBe(false)
})

test('Sunday accepted as both 0 and 7', () => {
  const sunday = new Date(2026, 5, 1, 0, 0)
  while (sunday.getDay() !== 0) sunday.setDate(sunday.getDate() + 1)
  expect(CronSchedule.parse('0 0 * * 0').matches(sunday)).toBe(true)
  expect(CronSchedule.parse('0 0 * * 7').matches(sunday)).toBe(true)
})

test('invalid expressions throw', () => {
  expect(() => CronSchedule.parse('* * * *')).toThrow() // 4 fields
  expect(() => CronSchedule.parse('60 * * * *')).toThrow() // minute > 59
  expect(() => CronSchedule.parse('* 24 * * *')).toThrow() // hour > 23
  expect(() => CronSchedule.parse('* * * * 8')).toThrow() // dow > 7
  expect(() => CronSchedule.parse('* * 0 * *')).toThrow() // day-of-month < 1
  expect(() => CronSchedule.parse('*/0 * * * *')).toThrow() // zero step
  expect(() => CronSchedule.parse('x * * * *')).toThrow() // not a number
})
