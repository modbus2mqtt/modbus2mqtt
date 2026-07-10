import Debug from 'debug'
import { Observable, Subject } from 'rxjs'
import { SpecificationStatus } from '../shared/specification/index.js'
import { IfileSpecification } from './ifilespecification.js'
import { ConfigSpecification } from './configspec.js'
import { IpullRequest } from './m2mGithubValidate.js'
import { LogLevelEnum, Logger } from './log.js'
// runtime-only cycle: poll() calls the class delegate so tests can spy on M2mSpecification.closeContribution
import { M2mSpecification } from './m2mspecification.js'

const log = new Logger('m2mSpecification')
const debug = Debug('m2mspecification')

export interface Icontribution {
  pullRequest: number
  monitor: Subject<IpullRequest>
  pollCount: number
  interval?: NodeJS.Timeout
  spec: IfileSpecification
  nextCheck?: string
  /** escalation table in ms; the effective threshold is value/100 poll ticks */
  pollIntervals: number[]
  pollIntervalIndex: number
  pollIntervalIndexCount: number
}

/** all currently polled contributions, keyed by specification filename */
export const ghContributions = new Map<string, Icontribution>()

const pollingTimeout = 15 * 1000
const defaultPollIntervals = [5000, 30000, 30000, 60000, 60000, 60000, 5000 * 60, 5000 * 60 * 60, 1000 * 60 * 60 * 24]
let inCloseContribution: boolean = false

export function startPolling(specfilename: string, error: (e: unknown) => void): Observable<IpullRequest> | undefined {
  debug('startPolling')
  const spec = ConfigSpecification.getSpecificationByFilename(specfilename)
  const contribution = ghContributions.get(specfilename)
  if (contribution == undefined && spec && spec.pullNumber) {
    log.log(LogLevelEnum.info, 'startPolling for pull Number ' + spec.pullNumber)
    const c: Icontribution = {
      pullRequest: spec.pullNumber,
      monitor: new Subject<IpullRequest>(),
      pollCount: 0,
      spec,
      pollIntervals: [...defaultPollIntervals],
      pollIntervalIndex: 0,
      pollIntervalIndexCount: 0,
      interval: setInterval(() => {
        poll(spec.filename, error)
      }, pollingTimeout),
    }
    ghContributions.set(spec.filename, c)
    return c.monitor
  }
  return undefined
}

export function getNextCheck(specfilename: string): string {
  const c = ghContributions.get(specfilename)
  if (c && c.nextCheck) return c.nextCheck
  return ''
}

export function msToTime(ms: number): string {
  const seconds: number = ms / 1000
  const minutes: number = ms / (1000 * 60)
  const hours: number = ms / (1000 * 60 * 60)
  const days: number = ms / (1000 * 60 * 60 * 24)
  if (seconds < 60) return seconds.toFixed(1) + ' Sec'
  else if (minutes < 60) return minutes.toFixed(1) + ' Min'
  else if (hours < 24) return hours.toFixed(1) + ' Hrs'
  else return days.toFixed(1) + ' Days'
}

/** stops all timers and clears the contribution state (test cleanup / shutdown) */
export function stopAllPolling(): void {
  ghContributions.forEach((c) => {
    if (c.interval) clearInterval(c.interval)
  })
  ghContributions.clear()
  inCloseContribution = false
}

function poll(specfilename: string, error: (e: unknown) => void): void {
  const contribution = ghContributions.get(specfilename)
  const spec = contribution?.spec as IfileSpecification
  if (
    ConfigSpecification.githubPersonalToken == undefined ||
    spec.status != SpecificationStatus.contributed ||
    spec.pullNumber == undefined
  ) {
    // polling can never succeed anymore: stop the interval instead of ticking forever
    if (contribution) {
      if (contribution.interval) clearInterval(contribution.interval)
      ghContributions.delete(specfilename)
      contribution.monitor.complete()
    }
    return
  }

  if (contribution == undefined) {
    const msg = 'Unexpected undefined contribution'
    log.log(LogLevelEnum.error, msg)
    error(new Error(msg))
  } else {
    if (contribution.pollCount > contribution.pollIntervals[contribution.pollIntervalIndex] / 100) contribution.pollCount = 0
    else {
      const interval = contribution.pollIntervals[contribution.pollIntervalIndex] / 100
      const nextCheckTotalMs = (interval - contribution.pollCount) * 100
      contribution.nextCheck = msToTime(nextCheckTotalMs)
    }
    if (contribution.pollCount == 0) {
      // Set pollIntervalIndex (interval duration)
      // 10 * every 5 second, 10 * every 5 minutes, 10 * every 5 hours, then once a day
      if (contribution.pollIntervalIndexCount++ >= 10 && contribution.pollIntervalIndex < contribution.pollIntervals.length - 1) {
        contribution.pollIntervalIndex++
        contribution.pollIntervalIndexCount = 0
      }
      if (!inCloseContribution) {
        inCloseContribution = true
        M2mSpecification.closeContribution(spec)
          .then((pullStatus) => {
            debug('contribution closed for pull Number ' + spec.pullNumber)
            if (contribution) {
              contribution.monitor.next(pullStatus)
              if (pullStatus.closed || pullStatus.merged) {
                clearInterval(contribution.interval)
                ghContributions.delete(spec.filename)
                contribution.monitor.complete()
              }
            }
          })
          .catch(error)
          .finally(() => {
            inCloseContribution = false
          })
      }
    }
    contribution.pollCount++
  }
}
