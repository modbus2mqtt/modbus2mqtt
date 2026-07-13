import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { provideNoopAnimations } from '@angular/platform-browser/animations'
import { ModbusErrorComponent } from './modbus-error.component'
import { ApiService } from '../services/api-service'
import { ImodbusStatusForSlave, ModbusErrorStates, ModbusTasks } from '@shared/server'
import { ModbusRegisterType } from '@shared/specification'
import { ensureAngularTesting } from '../../test-setup'

ensureAngularTesting()

describe('ModbusErrorComponent (vitest)', () => {
  let date: number
  let fixture: ComponentFixture<ModbusErrorComponent>

  const buildErrors = (): ImodbusStatusForSlave => ({
    errors: [
      {
        task: ModbusTasks.specification,
        date: date,
        address: { address: 1, registerType: ModbusRegisterType.HoldingRegister },
        state: ModbusErrorStates.crc,
      },
    ],
    requestCount: [0, 1, 2, 3, 4, 5, 6, 7],
    queueLength: 23,
  })

  // The transport tasks have no register address, they carry a message instead
  const buildHttpPushErrors = (): ImodbusStatusForSlave => ({
    errors: [
      { task: ModbusTasks.httpPush, date: date, state: ModbusErrorStates.httpStatus, message: '503 Service Unavailable' },
      { task: ModbusTasks.httpPush, date: date, state: ModbusErrorStates.httpStatus, message: '503 Service Unavailable' },
    ],
    requestCount: [0, 0, 0, 0, 0, 0, 0, 0, 0, 7],
    queueLength: 0,
  })

  async function mount(
    currentDate: number,
    status: ImodbusStatusForSlave = buildErrors()
  ): Promise<ComponentFixture<ModbusErrorComponent>> {
    ;(window as any).configuration = { rootUrl: '/' }

    await TestBed.configureTestingModule({
      imports: [ModbusErrorComponent],
      providers: [provideNoopAnimations(), { provide: ApiService, useValue: {} }],
    }).compileComponents()

    fixture = TestBed.createComponent(ModbusErrorComponent)
    fixture.componentInstance.modbusErrors = status
    fixture.componentInstance.currentDate = currentDate
    fixture.detectChanges()

    return fixture
  }

  beforeEach(() => {
    date = Date.now()
  })

  afterEach(() => {
    fixture?.destroy()
  })

  it('can mount 30 seconds after last error', async () => {
    const f = await mount(date + 30 * 1000)
    const desc = f.nativeElement.querySelector('mat-panel-description')
    expect(desc?.textContent).toContain('30 seconds ago')
  })

  it('can mount 90 seconds after last error', async () => {
    const f = await mount(date + 90 * 1000)
    const desc = f.nativeElement.querySelector('mat-panel-description')
    expect(desc?.textContent).toContain('1:30 minutes ago')
  })

  it('shows an http push error with its message instead of a register address', async () => {
    const f = await mount(date + 1000, buildHttpPushErrors())
    const text = f.nativeElement.textContent
    expect(text).toContain('HTTP Push')
    expect(text).toContain('(7 processed calls)')
    expect(text).toContain('HTTP Error Status')
    expect(f.componentInstance.getErrors(buildHttpPushErrors().errors)).toEqual(['503 Service Unavailable: 2'])
  })
})
