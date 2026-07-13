import { describe, it, expect } from 'vitest'

import { ModbusErrorComponent } from './modbus-error.component'
import { ImodbusStatusForSlave, ModbusErrorStates, ModbusTasks } from '@shared/server'
import { ModbusRegisterType } from '@shared/specification'

const buildErrors = (date: number): ImodbusStatusForSlave => ({
  errors: [
    {
      task: ModbusTasks.specification,
      date,
      address: { address: 1, registerType: ModbusRegisterType.HoldingRegister },
      state: ModbusErrorStates.crc,
    },
  ],
  requestCount: [0, 1, 2, 3, 4, 5, 6, 7],
  queueLength: 23,
})

describe('ModbusErrorComponent (vitest)', () => {
  it('formats 30 seconds ago', () => {
    const now = Date.now()
    const component = new ModbusErrorComponent({} as any)
    component.modbusErrors = buildErrors(now - 30 * 1000)
    component.currentDate = now

    const text = component.getSinceTimeString(component.modbusErrors.errors)
    expect(text).toBe('30 seconds ago')
  })

  it('formats 90 seconds ago', () => {
    const now = Date.now()
    const component = new ModbusErrorComponent({} as any)
    component.modbusErrors = buildErrors(now - 90 * 1000)
    component.currentDate = now

    const text = component.getSinceTimeString(component.modbusErrors.errors)
    expect(text).toBe('1:30 minutes ago')
  })
})
