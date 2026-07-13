import { Slave, PollModes, ModbusTasks, ModbusErrorStates } from '../shared/server/index.js'
import Debug from 'debug'
import { LogLevelEnum, Logger } from '../specification/index.js'
import { Bus } from './bus.js'
import { Config } from './config.js'
import { Modbus } from './modbus.js'
import { ItopicAndPayloads, MqttDiscover } from './mqttdiscover.js'
import { MqttConnector } from './mqttconnector.js'
import { HttpPush } from './httpPush.js'
import { CronSchedule } from './cronSchedule.js'
import { countSlaveRequest, recordSlaveError } from './slaveStatus.js'

const debug = Debug('mqttpoller')
const defaultPollCount = 50 // 5 seconds
// A configuration problem keeps a slave mute until someone fixes it, so it is re-recorded at this
// interval: the error list drops entries older than an hour.
const configErrorReportInterval = 15 * 60 * 1000 // 15 minutes
const log = new Logger('mqttpoller')
interface IslavePollInfo {
  count: number
  processing: boolean
  lastFiredMinute?: number // epoch minute of the last cron-triggered poll (cron-scheduled slaves only)
}
export class MqttPoller {
  interval: NodeJS.Timeout | undefined
  private lastMessage: string = ''
  private slavePollInfo: Map<number, IslavePollInfo> = new Map<number, IslavePollInfo>()
  private warnedNoSpecSlaves: Set<number> = new Set<number>()
  private warnedBadCron: Set<number> = new Set<number>()
  // When the last "this slave cannot be polled" was recorded, per slave. A configuration problem
  // does not fix itself, so it is re-recorded regularly: the error list drops entries after an hour,
  // and a slave that has been mute for a day should still say so.
  private lastConfigErrorReport: Map<number, number> = new Map<number, number>()

  constructor(private connector: MqttConnector) {}

  // poll gets triggered every 0.1 second
  // Depending on the pollinterval of the slaves it triggers publication of the current state of the slave
  private poll(bus: Bus): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.connector.isConnected()) {
        resolve()
        return
      }
      const needPolls: Slave[] = []
      const now = new Date()

      bus.getSlaves().forEach((slave) => {
        if (slave.pollMode != undefined && ![PollModes.noPoll, PollModes.trigger].includes(slave.pollMode)) {
          const sl = new Slave(bus.getId(), slave, Config.getConfiguration().mqttbasetopic)
          let pc: IslavePollInfo | undefined = this.slavePollInfo.get(sl.getSlaveId())
          if (pc == undefined) pc = { count: 0, processing: false }

          // A cron schedule (e.g. "0 * * * *" = every full hour) takes precedence over pollInterval.
          // It fires once per matching minute (deduplicated via lastFiredMinute); otherwise the slave
          // is polled on the fixed 100ms tick counter.
          let triggerNow = false
          const schedule = slave.pollSchedule
          if (schedule != undefined && schedule.trim().length > 0) {
            // An invalid expression is logged once and the slave is NOT polled (rather than falling
            // back to the short default interval, which would e.g. spam an HTTP push endpoint).
            const cron = this.getCronSchedule(schedule, sl)
            if (cron) {
              const minute = Math.floor(now.getTime() / 60000)
              triggerNow = pc.lastFiredMinute !== minute && cron.matches(now)
              if (triggerNow) pc.lastFiredMinute = minute
            }
          } else {
            if (pc.count >= (slave.pollInterval != undefined ? slave.pollInterval / 100 : defaultPollCount)) pc.count = 0
            triggerNow = pc.count == 0
            pc.count = pc.count + 1
          }

          if (triggerNow && !pc.processing) {
            const s = new Slave(bus.getId(), slave, Config.getConfiguration().mqttbasetopic)
            if (slave.specification) {
              pc.processing = true
              needPolls.push(s)
            } else {
              // The slave cannot be polled: either it has no specification at all, or its
              // specification failed to load (a broken yaml is logged once at startup and skipped).
              // Either way the slave silently stops publishing - which used to be visible in a single
              // log line only. Record it, so its card says why it went quiet.
              this.reportNotPollable(s, slave.specificationid)
            }
          }
          this.slavePollInfo.set(sl.getSlaveId(), pc)
        }
      })
      if (needPolls.length > 0) {
        // The slave is kept alongside its messages: publish happens after all slaves have been read,
        // so a publish error must still be attributed to the slave it belongs to.
        const tAndP: { slave: Slave; message: ItopicAndPayloads }[] = []
        let pollDeviceCount = 0
        let devicesToPoll = 0
        needPolls.forEach((bs) => {
          // Trigger state only if it's configured to do so
          const spMode = bs.getPollMode()
          if (
            spMode == undefined ||
            [PollModes.intervall, PollModes.intervallAndTrigger, PollModes.intervallHttpPushNoMqtt].includes(spMode)
          ) {
            if (bus) {
              devicesToPoll++
              const slave = bus.getSlaveBySlaveId(bs.getSlaveId())!
              Modbus.getModbusSpecification(ModbusTasks.poll, bus.getModbusAPI(), slave, bs.getSpecificationId(), (e) => {
                {
                  const msg = e instanceof Error ? e.message : String(e)
                  log.log(LogLevelEnum.error, 'reading spec failed' + msg)
                }
                const si = this.slavePollInfo.get(bs.getSlaveId())
                if (si) this.slavePollInfo.set(bs.getSlaveId(), { ...si, processing: false })
                pollDeviceCount++
                if (pollDeviceCount == devicesToPoll) {
                  resolve()
                }
              }).subscribe({
                next: (spec) => {
                  if (bs.shouldPublishMqtt()) {
                    tAndP.push({
                      slave: bs,
                      message: { topic: bs.getStateTopic(), payload: bs.getStatePayload(spec.entities), entityid: 0 },
                    })
                    tAndP.push({
                      slave: bs,
                      message: { topic: bs.getAvailabilityTopic(), payload: 'online', entityid: 0 },
                    })
                  }
                  // HTTP push (runs alongside MQTT, or standalone in HTTP-push-only mode).
                  // Pass the poll tick time so the {{ pollDate }} URL placeholder reflects the
                  // scheduled poll time rather than the (possibly later) push completion instant.
                  if (bs.hasHttpPush()) {
                    HttpPush.pushState(bs, spec, now).catch((e) =>
                      debug('httpPush failed: ' + (e instanceof Error ? e.message : String(e)))
                    )
                  }
                  // Device-variable entities (serial_number, sw_version, hw_version, UoM)
                  // only have mqttValue after the Modbus read — republish discovery if it
                  // changed so HA sees the real values instead of empty device fields.
                  try {
                    MqttDiscover.getInstance().republishDiscoveryIfChanged(bs)
                  } catch (e) {
                    debug('republishDiscoveryIfChanged failed: ' + (e instanceof Error ? e.message : String(e)))
                  }
                  // Reset processing flag immediately for this device
                  const si = this.slavePollInfo.get(bs.getSlaveId())
                  if (si) this.slavePollInfo.set(bs.getSlaveId(), { ...si, processing: false })
                  pollDeviceCount++
                  if (pollDeviceCount == devicesToPoll) {
                    this.connector.getMqttClient((mqttClient) => {
                      debug('poll: publishing')
                      tAndP.forEach((entry) => {
                        // Without the callback a publish failure (broker gone, queue full) was lost
                        // entirely. It is now visible in the slave's Status & Errors panel.
                        mqttClient.publish(entry.message.topic, entry.message.payload, (err) => {
                          if (err)
                            recordSlaveError(
                              entry.slave,
                              ModbusTasks.mqttPublish,
                              ModbusErrorStates.connection,
                              err.message + ' topic: ' + entry.message.topic
                            )
                          else countSlaveRequest(entry.slave, ModbusTasks.mqttPublish)
                        })
                      })
                      resolve()
                    })
                  }
                },
                error: (err) => {
                  log.log(LogLevelEnum.error, 'subscribe error: ' + err.message)
                  const si = this.slavePollInfo.get(bs.getSlaveId())
                  if (si) this.slavePollInfo.set(bs.getSlaveId(), { ...si, processing: false })
                  pollDeviceCount++
                  if (pollDeviceCount == devicesToPoll) {
                    resolve()
                  }
                },
              })
            }
          } else {
            // Device doesn't match poll mode, reset processing flag
            const si = this.slavePollInfo.get(bs.getSlaveId())
            if (si) this.slavePollInfo.set(bs.getSlaveId(), { ...si, processing: false })
          }
        })
        // If no devices actually need polling after mode check, resolve immediately
        if (devicesToPoll == 0) {
          resolve()
        }
      } else resolve()
    })
  }

  // A slave whose specification is missing or unloadable is never published. The log says so once at
  // startup; this puts it into the slave's Status & Errors, where someone looking for the missing
  // values will actually find it.
  private reportNotPollable(slave: Slave, specificationid: string | undefined): void {
    const slaveid = slave.getSlaveId()
    const message =
      specificationid != undefined
        ? 'Specification "' + specificationid + '" could not be loaded. The slave is not polled.'
        : 'No specification assigned. The slave is not polled.'
    if (specificationid != undefined && !this.warnedNoSpecSlaves.has(slaveid)) {
      log.log(LogLevelEnum.error, 'No specification found for slave ' + slaveid + ' specid: ' + specificationid)
      this.warnedNoSpecSlaves.add(slaveid)
    }
    this.reportConfigError(slave, message)
  }

  // Throttled: the poll ticks every 100ms, and an unpollable slave would otherwise flood its own
  // error list and push the real modbus errors out of it.
  private reportConfigError(slave: Slave, message: string): void {
    const slaveid = slave.getSlaveId()
    const last = this.lastConfigErrorReport.get(slaveid)
    const now = Date.now()
    if (last != undefined && now - last < configErrorReportInterval) return
    this.lastConfigErrorReport.set(slaveid, now)
    recordSlaveError(slave, ModbusTasks.poll, ModbusErrorStates.configuration, message)
  }

  // Parses a slave's cron expression, or returns undefined when it is invalid (logged once per
  // slave). The caller skips polling on undefined so a typo does not trigger unintended polls.
  private getCronSchedule(expression: string, slave: Slave): CronSchedule | undefined {
    const slaveId = slave.getSlaveId()
    try {
      const cron = CronSchedule.parse(expression)
      this.warnedBadCron.delete(slaveId)
      return cron
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!this.warnedBadCron.has(slaveId)) {
        log.log(LogLevelEnum.error, 'Invalid pollSchedule for slave ' + slaveId + ', skipping poll: ' + msg)
        this.warnedBadCron.add(slaveId)
      }
      // Same as a missing specification: the slave is never polled and would go quiet without a word.
      this.reportConfigError(slave, 'Invalid poll schedule "' + expression + '": ' + msg + '. The slave is not polled.')
      return undefined
    }
  }

  startPolling(bus: Bus) {
    if (this.interval == undefined) {
      this.interval = setInterval(() => {
        this.poll(bus)
          .then(() => {})
          .catch(this.error)
      }, 100)
    }
  }

  stopPolling(): void {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = undefined
    }
  }
  private error(msg: Error | string): void {
    const message = "MQTT: Can't connect to " + Config.getConfiguration().mqttconnect.mqttserverurl + ' ' + msg.toString()
    if (message !== this.lastMessage) log.log(LogLevelEnum.error, message)
    this.lastMessage = message
  }
}
