import { IModbusResultWithDuration } from './bus.js'
import { ModbusRTUQueue, IQueueEntry } from './modbusRTUqueue.js'
import { ModbusRegisterType } from '../shared/specification/index.js'

type TModbusReadFunction = (slaveid: number, dataaddress: number, length: number) => Promise<IModbusResultWithDuration>
type TModbusWriteFunction = (slaveid: number, dataaddress: number, data: number[]) => Promise<void>

export interface IModbusAPI {
  readHoldingRegisters: TModbusReadFunction
  readCoils: TModbusReadFunction
  readDiscreteInputs: TModbusReadFunction
  readInputRegisters: TModbusReadFunction
  writeHoldingRegisters: TModbusWriteFunction
  writeCoils: TModbusWriteFunction
  writeCoil?: (slaveid: number, dataaddress: number, state: boolean) => Promise<void>
  reconnectRTU: (task: string) => Promise<void>
  getCacheId(): string
}
export class ModbusWorker {
  protected functionCodeReadMap: Map<ModbusRegisterType, TModbusReadFunction>
  protected functionCodeWriteMap: Map<ModbusRegisterType, TModbusWriteFunction>
  constructor(
    protected modbusAPI: IModbusAPI,
    protected queue: ModbusRTUQueue
  ) {
    this.functionCodeReadMap = new Map<ModbusRegisterType, TModbusReadFunction>()
    this.functionCodeWriteMap = new Map<ModbusRegisterType, TModbusWriteFunction>()
    queue.addNewEntryListener(this.run.bind(this))
    queue.addCachedEntryListener(this.getCached.bind(this))
    this.functionCodeReadMap.set(ModbusRegisterType.HoldingRegister, this.modbusAPI.readHoldingRegisters.bind(this.modbusAPI))
    this.functionCodeReadMap.set(ModbusRegisterType.Coils, this.modbusAPI.readCoils.bind(this.modbusAPI))
    this.functionCodeReadMap.set(ModbusRegisterType.DiscreteInputs, this.modbusAPI.readDiscreteInputs.bind(this.modbusAPI))
    this.functionCodeReadMap.set(ModbusRegisterType.AnalogInputs, this.modbusAPI.readInputRegisters.bind(this.modbusAPI))
    this.functionCodeWriteMap.set(ModbusRegisterType.HoldingRegister, this.modbusAPI.writeHoldingRegisters.bind(this.modbusAPI))
    this.functionCodeWriteMap.set(ModbusRegisterType.Coils, this.modbusAPI.writeCoils.bind(this.modbusAPI))
  }
  /**
   * If entry is for readind: searchs for entry in cache. If not found, it forwards entry to queue
   * @param entry: Entry to search in cache
   */
  private getCached(entry: IQueueEntry): void {
    if (!entry.address.write) {
      // TODO not implemented
    }
    // not found in cache
    this.queue.enqueueEntry(entry)
  }

  run(): void {
    let current: IQueueEntry | undefined = undefined
    while (undefined != (current = this.queue.dequeue())) {
      if (current.address.write) {
        if (
          current.address.registerType === ModbusRegisterType.Coils &&
          current.address.writeFunctionCode === 5 &&
          this.modbusAPI.writeCoil
        ) {
          this.modbusAPI
            .writeCoil(current.slaveId, current.address.address, current.address.write[0] === 1)
            .then(() => {
              current!.onResolve(current!, [])
            })
            .catch((e) => {
              current!.onError(current!, e)
            })
        } else {
          this.functionCodeWriteMap.get(current.address.registerType)!(
            current.slaveId,
            current.address.address,
            current.address.write
          )
            .then(() => {
              current!.onResolve(current!, [])
            })
            .catch((e) => {
              current!.onError(current!, e)
            })
        }
      }
      else
        this.functionCodeReadMap.get(current.address.registerType)!(
          current.slaveId,
          current.address.address,
          current.address.length == undefined ? 1 : current.address.length
        )
          .then((result) => {
            current!.onResolve(current!, result.data)
          })
          .catch((e) => {
            current!.onError(current!, e)
          })
    }
  }
}
