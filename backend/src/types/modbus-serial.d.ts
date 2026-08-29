declare module 'modbus-serial' {
  import type { ReadCoilResult, ReadRegisterResult } from '../server/modbusTypes.js'

  export interface ModbusRTULike {
    isOpen: boolean
    setID(id: number): void
    setTimeout(ms: number): void
    close(cb: () => void): void
    // dataBits/parity/stopBits are passed straight to serialport; omitting them means 8N1.
    connectRTUBuffered(
      path: string,
      opts: { baudRate: number; dataBits?: 7 | 8; parity?: 'none' | 'even' | 'odd'; stopBits?: 1 | 2 }
    ): Promise<void>
    connectTCP(host: string, opts: { port: number }): Promise<void>
    readHoldingRegisters(address: number, length: number): Promise<ReadRegisterResult>
    readInputRegisters(address: number, length: number): Promise<ReadRegisterResult>
    readDiscreteInputs(address: number, length: number): Promise<ReadCoilResult>
    readCoils(address: number, length: number): Promise<ReadCoilResult>
    writeRegisters(address: number, data: number[]): Promise<void>
    writeCoils(address: number, data: number[]): Promise<void>
  }

  const ModbusRTU: {
    new (): ModbusRTULike
  }

  export default ModbusRTU

  // Server TCP typings (minimal surface for compilation)
  export type FCallbackVal<T = unknown> = (err: Error | null, data?: T) => void

  export interface IServiceVector {
    getInputRegister(addr: number, unitID: number, cb: FCallbackVal<number>): void
    getHoldingRegister(addr: number, unitID: number, cb: FCallbackVal<number>): void
    getMultipleInputRegisters(addr: number, length: number, unitID: number, cb: FCallbackVal<number[]>): void
    getMultipleHoldingRegisters(addr: number, length: number, unitID: number, cb: FCallbackVal<number[]>): void
    getDiscreteInput(addr: number, unitID: number, cb: FCallbackVal<boolean>): void
    getCoil(addr: number, unitID: number, cb: FCallbackVal<boolean>): void
    setRegister(addr: number, value: number, unitID: number, cb: FCallbackVal<number>): void
    setCoil(addr: number, value: boolean, unitID: number, cb: FCallbackVal<boolean>): void
  }

  export class ServerTCP {
    constructor(
      vector: IServiceVector,
      options: { host: string; port: number; debug?: boolean; unitID?: number; responseDelay?: number }
    )
    close(callback?: () => void): void
    on(event: string, listener: (...args: unknown[]) => void): void
  }
}
