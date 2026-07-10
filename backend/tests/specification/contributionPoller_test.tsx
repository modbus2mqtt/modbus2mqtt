import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { SpecificationStatus } from '../../src/shared/specification/index.js'
import { ConfigSpecification, IfileSpecification, M2mSpecification } from '../../src/specification/index.js'
import { ghContributions, stopAllPolling } from '../../src/specification/contributionPoller.js'
import { IpullRequest } from '../../src/specification/m2mGithubValidate.js'
import { configDir } from './configsbase.js'
import { specFixture } from './specFixtures.js'

const contributions = () => ghContributions

function storeContributedSpec(filename: string, pullNumber?: number): IfileSpecification {
  const s = structuredClone(specFixture)
  s.filename = filename
  s.status = SpecificationStatus.contributed
  s.pullNumber = pullNumber
  const idx = ConfigSpecification['specifications'].findIndex((sp: IfileSpecification) => sp.filename == filename)
  if (idx >= 0) ConfigSpecification['specifications'].splice(idx, 1)
  ConfigSpecification['specifications'].push(s)
  return s
}

const openPr = (pullNumber: number): IpullRequest => ({ merged: false, closed: false, pullNumber })

beforeAll(() => {
  ConfigSpecification['configDir'] = configDir
  new ConfigSpecification().readYaml()
  ConfigSpecification.githubPersonalToken = 'fake-token'
})

beforeEach(() => {
  vi.useFakeTimers()
  ConfigSpecification.githubPersonalToken = 'fake-token'
})

afterEach(() => {
  stopAllPolling()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('startPolling', () => {
  it('returns an observable for a contributed spec with pull number', () => {
    storeContributedSpec('poll-a', 5)
    const o = M2mSpecification.startPolling('poll-a', () => {})
    expect(o).toBeDefined()
    expect(contributions().has('poll-a')).toBeTruthy()
  })

  it('returns undefined when already polling or without pull number', () => {
    storeContributedSpec('poll-b', 5)
    expect(M2mSpecification.startPolling('poll-b', () => {})).toBeDefined()
    expect(M2mSpecification.startPolling('poll-b', () => {})).toBeUndefined()

    storeContributedSpec('poll-c', undefined)
    expect(M2mSpecification.startPolling('poll-c', () => {})).toBeUndefined()
  })

  it('polls every 15s: closeContribution on the first tick, nextCheck countdown afterwards', async () => {
    storeContributedSpec('poll-d', 5)
    const close = vi.spyOn(M2mSpecification, 'closeContribution').mockResolvedValue(openPr(5))
    M2mSpecification.startPolling('poll-d', () => {})

    await vi.advanceTimersByTimeAsync(15000)
    expect(close).toHaveBeenCalledTimes(1)

    // second tick: pollCount 1 < interval threshold -> only the countdown is updated
    await vi.advanceTimersByTimeAsync(15000)
    expect(close).toHaveBeenCalledTimes(1)
    // ghPollInterval[0]=5000 -> threshold 50; (50 - 1) * 100ms = 4.9 Sec (current arithmetic, pinned)
    expect(M2mSpecification.getNextCheck('poll-d')).toBe('4.9 Sec')
  })

  it('merged pull request completes the observable and cleans up', async () => {
    storeContributedSpec('poll-e', 6)
    vi.spyOn(M2mSpecification, 'closeContribution').mockResolvedValue({ merged: true, closed: false, pullNumber: 6 })
    const results: IpullRequest[] = []
    let completed = false
    M2mSpecification.startPolling('poll-e', () => {})!.subscribe({
      next: (pr) => results.push(pr),
      complete: () => (completed = true),
    })
    await vi.advanceTimersByTimeAsync(15000)
    expect(results).toEqual([{ merged: true, closed: false, pullNumber: 6 }])
    expect(completed).toBeTruthy()
    expect(contributions().has('poll-e')).toBeFalsy()
    // no further polling after completion
    await vi.advanceTimersByTimeAsync(60000)
    expect(results.length).toBe(1)
  })

  it('stops polling and completes when the token disappears', async () => {
    storeContributedSpec('poll-j', 11)
    const close = vi.spyOn(M2mSpecification, 'closeContribution').mockResolvedValue(openPr(11))
    let completed = false
    M2mSpecification.startPolling('poll-j', () => {})!.subscribe({ complete: () => (completed = true) })
    ConfigSpecification.githubPersonalToken = undefined as unknown as string
    await vi.advanceTimersByTimeAsync(15000)
    expect(contributions().has('poll-j')).toBeFalsy()
    expect(completed).toBeTruthy()
    expect(close).not.toHaveBeenCalled()
  })

  it('persistent closeContribution errors keep retrying (transient failures should recover)', async () => {
    storeContributedSpec('poll-f', 7)
    const close = vi.spyOn(M2mSpecification, 'closeContribution').mockRejectedValue(new Error('network down'))
    const errors: unknown[] = []
    M2mSpecification.startPolling('poll-f', (e) => errors.push(e))
    await vi.advanceTimersByTimeAsync(15000)
    expect(errors.length).toBe(1)
    expect(contributions().has('poll-f')).toBeTruthy()
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('inCloseContribution gate: a pending closeContribution blocks other contributions', async () => {
    storeContributedSpec('poll-g', 8)
    storeContributedSpec('poll-h', 9)
    let resolveFirst: (pr: IpullRequest) => void = () => {}
    const close = vi
      .spyOn(M2mSpecification, 'closeContribution')
      .mockImplementation(() => new Promise<IpullRequest>((resolve) => (resolveFirst = resolve)))
    M2mSpecification.startPolling('poll-g', () => {})
    M2mSpecification.startPolling('poll-h', () => {})
    await vi.advanceTimersByTimeAsync(15000)
    // both intervals fired, but the global flag admits only one closeContribution
    expect(close).toHaveBeenCalledTimes(1)
    resolveFirst(openPr(8))
  })

  it('escalates the polling interval after 10 rounds', async () => {
    const spec = storeContributedSpec('poll-i', 10)
    vi.spyOn(M2mSpecification, 'closeContribution').mockResolvedValue(openPr(10))
    M2mSpecification.startPolling('poll-i', () => {})
    const contribution = contributions().get('poll-i')!
    // shorten the escalation thresholds so rounds wrap quickly (same trick as the old test)
    contribution.pollIntervals = [100, 200, 300]
    expect(contribution.pollIntervalIndex).toBe(0)
    // threshold interval[0]/100 = 1 -> every other tick is a closeContribution round
    for (let i = 0; i < 25; i++) await vi.advanceTimersByTimeAsync(15000)
    expect(contribution.pollIntervalIndex).toBeGreaterThan(0)
    expect(spec.status).toBe(SpecificationStatus.contributed)
  })
})

describe('getNextCheck', () => {
  it('returns empty string for unknown specs', () => {
    expect(M2mSpecification.getNextCheck('does-not-exist')).toBe('')
  })
})

describe('msToTime', () => {
  it.each([
    [59999, '60.0 Sec'],
    [60000, '1.0 Min'],
    [3599999, '60.0 Min'],
    [3600000, '1.0 Hrs'],
    [86399999, '24.0 Hrs'],
    [86400000, '1.0 Days'],
    [0, '0.0 Sec'],
  ])('%i ms -> %s', (ms, expected) => {
    expect(M2mSpecification.msToTime(ms)).toBe(expected)
  })
})
