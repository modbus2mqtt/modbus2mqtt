import { ModbusErrorStates, ModbusTasks } from '../shared/server/index.js'
import { Slave } from '../shared/server/index.js'
import { Bus } from './bus.js'

// The slave's error list lives in the modbus worker cache (per bus and slave id) and is served to
// the UI as Islave.modbusStatusForSlave. These helpers let the tasks which don't talk modbus - mqtt
// publish and http push - report into the same list, so the Status & Errors panel of a slave shows
// every failure of a poll cycle, not just the modbus part of it.
// detail carries what is needed to act on the failure but is too volatile to group by - the resolved
// push url, the topic of a failed publish. The UI groups by message and shows the newest detail.
export function recordSlaveError(
  slave: Slave,
  task: ModbusTasks,
  state: ModbusErrorStates,
  message: string,
  detail?: string
): void {
  Bus.getBus(slave.getBusId())?.getModbusAPI()?.addSlaveError(slave.getSlaveId(), task, state, message, detail)
}

export function countSlaveRequest(slave: Slave, task: ModbusTasks): void {
  Bus.getBus(slave.getBusId())?.getModbusAPI()?.countRequest(slave.getSlaveId(), task)
}
