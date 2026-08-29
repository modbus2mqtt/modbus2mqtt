import {
  ImodbusAddress,
  ModbusTasks,
  ModbusErrorStates,
  IRTUConnection,
  ITCPConnection,
  IModbusConnection,
  ImodbusStatusForSlave,
  DEFAULT_SERIAL_DATABITS,
  DEFAULT_SERIAL_PARITY,
  DEFAULT_SERIAL_STOPBITS,
} from '../shared/server/index.js'
import { ImodbusValues, Logger, LogLevelEnum } from '../specification/index.js'
import { ModbusRegisterType } from '../shared/specification/index.js'
import { Mutex } from 'async-mutex'
import ModbusRTU from 'modbus-serial'
import type { ModbusRTULike } from 'modbus-serial'
import { ReadCoilResult, ReadRegisterResult } from './modbusTypes.js'
import { IModbusResultWithDuration } from './bus.js'
import { Config } from './config.js'
import { IexecuteOptions, ModbusRTUProcessor } from './modbusRTUprocessor.js'
import { IModbusAPI } from './modbusWorker.js'
import { submitGetHoldingRegisterRequest } from './submitRequestMock.js'
import { ModbusRTUWorker } from './modbusRTUworker.js'
import { IQueueOptions, ModbusRTUQueue } from './modbusRTUqueue.js'
import Debug from 'debug'

const log = new Logger('bus')
const debug = Debug('modbusapi')
const debugMClient = Debug('modbusapi:mclient')
interface ErrorWithErrnoAndDuration extends Error {
  errno?: string
  duration?: number
}

export interface IconsumerModbusAPI {
  getName(): string
  writeModbusRegister: (
    slaveId: number,
    address: number,
    registerType: ModbusRegisterType,
    data: number[],
    options: IQueueOptions
  ) => Promise<void>
  readModbusRegister: (slaveId: number, addresses: Set<ImodbusAddress>, options: IexecuteOptions) => Promise<ImodbusValues>
  addSlaveError: (slaveid: number, task: ModbusTasks, state: ModbusErrorStates, message: string, detail?: string) => void
  countRequest: (slaveid: number, task: ModbusTasks) => void
}
export interface IModbusConfiguration {
  getId: () => number
  getName: () => string
  getSlaveTimeoutBySlaveId: (slaveid: number) => number
  getMaxRegistersPerRequestBySlaveId: (slaveid: number) => number
  getModbusConnection: () => IModbusConnection
}

export class ModbusAPI implements IModbusAPI, IconsumerModbusAPI {
  private modbusClient: ModbusRTULike | undefined
  private modbusClientTimedOut: boolean = false
  private _modbusRTUWorker: ModbusRTUWorker
  constructor(
    private modbusConfiguration: IModbusConfiguration,
    private modbusRTUQueue = new ModbusRTUQueue(),
    private modbusRTUprocessor = new ModbusRTUProcessor(modbusRTUQueue)
  ) {
    this._modbusRTUWorker = new ModbusRTUWorker(this, modbusRTUQueue)
  }
  getCacheId(): string {
    return this.modbusConfiguration.getName()
  }
  getName(): string {
    return this.modbusConfiguration.getName()
  }

  readModbusRegister(slaveId: number, addresses: Set<ImodbusAddress>, options: IexecuteOptions): Promise<ImodbusValues> {
    if (Config.getConfiguration().fakeModbus) return submitGetHoldingRegisterRequest(slaveId, addresses)

    const resolvedOptions: IexecuteOptions = {
      ...options,
      maxRegistersPerRequest:
        options.maxRegistersPerRequest ?? this.modbusConfiguration.getMaxRegistersPerRequestBySlaveId(slaveId),
    }

    if (this.modbusClient && this.modbusClient.isOpen) return this.modbusRTUprocessor.execute(slaveId, addresses, resolvedOptions)
    else
      return new Promise<ImodbusValues>((resolve, reject) => {
        this.initialConnect()
          .then(() => {
            return this.modbusRTUprocessor.execute(slaveId, addresses, resolvedOptions).then(resolve).catch(reject)
          })
          .catch((e) => {
            const addr = addresses.values().next().value
            if (addr) {
              const date = new Date()
              this._modbusRTUWorker.addError(
                {
                  slaveId: slaveId,
                  address: addr,
                  onResolve: () => {},
                  onError: () => {},
                  options: { task: ModbusTasks.initialConnect, errorHandling: {} },
                },
                ModbusErrorStates.initialConnect,
                date
              )
            }
            reject(e)
          })
      })
  }

  writeModbusRegister(
    slaveId: number,
    address: number,
    registerType: ModbusRegisterType,
    data: number[],
    options: IexecuteOptions
  ): Promise<void> {
    const executeWrite = (onResolve: () => void, onReject: (e: unknown) => void) => {
      const addr: ImodbusAddress = { address: address, length: data.length, registerType: registerType, write: data }
      this.modbusRTUQueue.enqueue(slaveId, addr, onResolve, onReject, options)
    }
    if (this.modbusClient && this.modbusClient.isOpen)
      return new Promise((onResolve, onReject) => {
        executeWrite.bind(this)(onResolve, onReject)
      })
    else
      return new Promise<void>((resolve, reject) => {
        this.initialConnect()
          .then(() => {
            executeWrite.bind(this)(resolve, reject)
          })
          .catch(reject)
      })
  }
  readRegisters<T>(
    slaveid: number,
    dataaddress: number,
    length: number,
    fct: (dataAddress: number, length: number) => Promise<T>,
    resultMapper: (inp: T, start: number) => IModbusResultWithDuration,
    fctName: string
  ): Promise<IModbusResultWithDuration> {
    const rc = new Promise<IModbusResultWithDuration>((resolve, reject) => {
      if (this.modbusClient == undefined) {
        log.log(LogLevelEnum.error, 'modbusClient is undefined')
        reject(new Error('modbusClient is undefined'))
        return
      } else {
        this.modbusClient!.setID(slaveid)
        let slaveTimout = this.modbusConfiguration.getSlaveTimeoutBySlaveId(slaveid)
        if (slaveTimout == undefined) slaveTimout = (this.modbusConfiguration.getModbusConnection() as IRTUConnection).timeout
        this.modbusClient!.setTimeout(slaveTimout)
        const start = Date.now()
        debugMClient('%s call: %d %d', fctName, dataaddress, length)
        fct(dataaddress, length)
          .then((result) => {
            this.clearModbusTimout()
            const rc = resultMapper(result, start)
            debugMClient('%s success: %d %d %o', fctName, dataaddress, length, rc.data)
            resolve(rc)
          })
          .catch((e) => {
            debugMClient('%s error: %d %d', fctName, dataaddress, length)
            this.setModbusTimout(reject, e, start)
          })
      }
    })
    return rc
  }
  private static registerResultMapper(inp: ReadRegisterResult, start: number): IModbusResultWithDuration {
    return {
      data: inp.data,
      duration: Date.now() - start,
    }
  }
  private static coilResultMapper(inp: ReadCoilResult, start: number): IModbusResultWithDuration {
    const readResult: ReadRegisterResult = {
      data: [],
      buffer: Buffer.allocUnsafe(0),
    }
    inp.data.forEach((d) => {
      readResult.data.push(d ? 1 : 0)
    })
    return {
      data: readResult.data,
      duration: Date.now() - start,
    }
  }

  readHoldingRegisters(slaveid: number, dataaddress: number, length: number): Promise<IModbusResultWithDuration> {
    return this.readRegisters<ReadRegisterResult>(
      slaveid,
      dataaddress,
      length,
      this.modbusClient!.readHoldingRegisters.bind(this.modbusClient),
      ModbusAPI.registerResultMapper,
      'Holding'
    )
  }
  readInputRegisters(slaveid: number, dataaddress: number, length: number): Promise<IModbusResultWithDuration> {
    return this.readRegisters<ReadRegisterResult>(
      slaveid,
      dataaddress,
      length,
      this.modbusClient!.readInputRegisters.bind(this.modbusClient),
      ModbusAPI.registerResultMapper,
      'Input'
    )
  }
  readDiscreteInputs(slaveid: number, dataaddress: number, length: number): Promise<IModbusResultWithDuration> {
    return this.readRegisters<ReadCoilResult>(
      slaveid,
      dataaddress,
      length,
      this.modbusClient!.readDiscreteInputs.bind(this.modbusClient),
      ModbusAPI.coilResultMapper,
      'Discrete'
    )
  }
  readCoils(slaveid: number, dataaddress: number, length: number): Promise<IModbusResultWithDuration> {
    return this.readRegisters<ReadCoilResult>(
      slaveid,
      dataaddress,
      length,
      this.modbusClient!.readCoils.bind(this.modbusClient),
      ModbusAPI.coilResultMapper,
      'Coil'
    )
  }
  getMaxModbusTimeout() {
    return (this.modbusConfiguration.getModbusConnection() as IRTUConnection).timeout
  }

  writeHoldingRegisters(slaveid: number, dataaddress: number, data: number[]): Promise<void> {
    const rc = new Promise<void>((resolve, reject) => {
      const start = Date.now()
      if (this.modbusClient == undefined) {
        log.log(LogLevelEnum.error, 'modbusClient is undefined')
        return
      } else {
        this.modbusClient!.setID(slaveid)
        this.modbusClient!.setTimeout((this.modbusConfiguration.getModbusConnection() as IRTUConnection).timeout)
        this.modbusClient!.writeRegisters(dataaddress, data)
          .then(() => {
            this.modbusClientTimedOut = false
            resolve()
          })
          .catch((e) => {
            this.setModbusTimout(reject, e, start)
          })
      }
    })
    return rc
  }
  writeCoils(slaveid: number, dataaddress: number, data: number[]): Promise<void> {
    const rc = new Promise<void>((resolve, reject) => {
      if (this.modbusClient == undefined) {
        log.log(LogLevelEnum.error, 'modbusClient is undefined')
        return
      } else {
        const start = Date.now()
        this.modbusClient!.setID(slaveid)
        this.modbusClient!.setTimeout((this.modbusConfiguration.getModbusConnection() as IRTUConnection).timeout)
        const dataNums: number[] = data.map((d) => (d === 1 ? 1 : 0))
        // Always use writeCoils; for single value pass array of one element
        this.modbusClient!.writeCoils(dataaddress, dataNums)
          .then(() => {
            this.modbusClientTimedOut = false
            resolve()
          })
          .catch((e) => {
            this.setModbusTimout(reject, e, start)
          })
      }
    })
    return rc
  }

  setModbusTimout(reject: (e: ErrorWithErrnoAndDuration) => void, e: ErrorWithErrnoAndDuration, start: number) {
    this.modbusClientTimedOut = e && e.errno != undefined && e.errno == 'ETIMEDOUT'
    e.duration = Date.now() - start
    reject(e)
  }
  clearModbusTimout() {
    this.modbusClientTimedOut = false
  }

  private connectMutex = new Mutex()
  // Opens the modbusClient. ASSUMES connectMutex is already held by the caller.
  // Never call this directly without the lock - use connectRTUClient() or reconnectRTU().
  private connectRTUClientLocked(): Promise<void> {
    if (this.modbusClient == undefined) this.modbusClient = new ModbusRTU()
    if (this.modbusClient.isOpen) return Promise.resolve()

    const rtu = this.modbusConfiguration.getModbusConnection() as IRTUConnection
    const port = rtu.serialport
    const baudrate = rtu.baudrate
    if (port && baudrate) {
      // Framing beyond the baud rate was hard wired to 8N1 before. A device that speaks 8E1 - which
      // the Modbus specification actually asks for - answered with nothing but timeouts and CRC errors.
      return this.modbusClient.connectRTUBuffered(port, {
        baudRate: baudrate,
        dataBits: (rtu.dataBits ?? DEFAULT_SERIAL_DATABITS) as 7 | 8,
        parity: rtu.parity ?? DEFAULT_SERIAL_PARITY,
        stopBits: (rtu.stopBits ?? DEFAULT_SERIAL_STOPBITS) as 1 | 2,
      })
    } else {
      const host = (this.modbusConfiguration.getModbusConnection() as ITCPConnection).host
      const tcpport = (this.modbusConfiguration.getModbusConnection() as ITCPConnection).port
      return this.modbusClient.connectTCP(host, { port: tcpport })
    }
  }
  private connectRTUClient(): Promise<void> {
    // Serialize so the modbusClient gets initialized/opened only once, even if called in parallel.
    return this.connectMutex.runExclusive(() => this.connectRTUClientLocked())
  }
  // Closes the modbusClient if open. ASSUMES connectMutex is already held.
  private closeLocked(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this.modbusClient == undefined || !this.modbusClient.isOpen) {
        resolve()
        return
      }
      this.modbusClient.close(() => resolve())
    })
  }
  reconnectRTU(task: string): Promise<void> {
    // Serialize the WHOLE close->reopen sequence. Two concurrent reconnects (e.g. worker +
    // updateBus) must never interleave: an overlapping open of the same serial device leaks
    // the still-locked fd -> "Resource temporarily unavailable Cannot lock port".
    return this.connectMutex.runExclusive(async () => {
      if (this.modbusClientTimedOut) {
        if (this.modbusClient == undefined || !this.modbusClient.isOpen)
          throw new Error(task + ' Last read failed with TIMEOUT and modbusclient is not ready')
        return
      }
      // Always close before reopening so the previous fd (and its flock) is fully released
      // before connectRTUBuffered creates a new SerialPort. Single owner, no overlap.
      await this.closeLocked()
      try {
        await this.connectRTUClientLocked()
      } catch (e) {
        log.log(LogLevelEnum.error, task + ' connection failed ' + e)
        throw e
      }
    })
  }
  private connectRTU(task: string): Promise<void> {
    const rc = new Promise<void>((resolve, reject) => {
      this.connectRTUClient()
        .then(resolve)
        .catch((e) => {
          log.log(LogLevelEnum.error, task + ' ' + this.getCacheId() + ': ' + e.message)
          reject(e)
        })
    })
    return rc
  }

  private closeRTU(task: string, callback: () => void) {
    if (this.modbusClientTimedOut) {
      debug("Workaround: Last calls TIMEDOUT won't close")
      callback()
    } else if (this.modbusClient == undefined) {
      log.log(LogLevelEnum.error, 'modbusClient is undefined')
    } else
      this.modbusClient.close(() => {
        // debug("closeRTU: " + (this.modbusClient?.isOpen ? "open" : "closed"))
        callback()
      })
  }
  private isRTUopen(): boolean {
    if (this.modbusClient == undefined) {
      log.log(LogLevelEnum.error, 'modbusClient is undefined')
      return false
    } else return this.modbusClient.isOpen
  }
  getQueue(): ModbusRTUQueue {
    return this.modbusRTUQueue
  }
  cleanupCache() {
    this._modbusRTUWorker.cleanupCache()
  }
  initialConnect(): Promise<void> {
    return this.connectRTU('InitialConnect')
  }
  getErrors(slaveid: number): ImodbusStatusForSlave {
    return this._modbusRTUWorker.getErrors(slaveid)
  }
  // Entry point for the non modbus tasks (mqtt publish, http push) to report into the slave's
  // error list, so the UI shows all failures of a poll cycle in one place.
  addSlaveError(slaveid: number, task: ModbusTasks, state: ModbusErrorStates, message: string, detail?: string): void {
    this._modbusRTUWorker.addSlaveError(slaveid, task, state, message, detail)
  }
  countRequest(slaveid: number, task: ModbusTasks): void {
    this._modbusRTUWorker.countRequest(slaveid, task)
  }
}
