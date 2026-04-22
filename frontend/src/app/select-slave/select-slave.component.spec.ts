import { FormBuilder } from '@angular/forms'
import { of } from 'rxjs'
import { describe, it, expect, vi } from 'vitest'

import { SelectSlaveComponent } from './select-slave.component'
import { Iconfiguration, IBus, Islave, PollModes } from '@shared/server'
import { IdentifiedStates, Ispecification, SpecificationStatus, ModbusRegisterType, IidentificationSpecification } from '@shared/specification'

class ApiServiceMock {
  lastPost: { busId: number; slave: Islave } | undefined
  lastDelete: { busId: number; slaveId: number } | undefined

  postSlave(busId: number, slave: Islave) {
    this.lastPost = { busId, slave }
    return of(slave)
  }

  deleteSlave(busId: number, slaveId: number) {
    this.lastDelete = { busId, slaveId }
    return of({})
  }

  getSlaves(_busId: number) {
    return of([] as Islave[])
  }

  getModbusSpecification() {
    return of(undefined)
  }
}

const buildConfig = (): Iconfiguration => ({
  version: 'test',
  fakeModbus: true,
  mqttbasetopic: 'base',
  mqttdiscoveryprefix: 'homeassistant',
  mqttdiscoverylanguage: 'en',
  mqttconnect: {},
  httpport: 3000,
  rootUrl: '/',
})

const buildSpec = (): Ispecification => ({
  filename: 'second',
  status: SpecificationStatus.added,
  files: [],
  i18n: [{ lang: 'en', texts: [{ textId: 'name', text: 'Second' }, { textId: 'e1', text: 'entity1' }] }],
  entities: [
    {
      id: 1,
      name: 'entity1',
      readonly: true,
      mqttname: 'e1',
      converter: 'number',
      registerType: ModbusRegisterType.HoldingRegister,
      modbusAddress: 1,
    },
  ],
})

const buildIdentSpec = (): IidentificationSpecification => ({
  filename: 'second',
  name: 'Second',
  status: SpecificationStatus.added,
  identified: IdentifiedStates.identified,
  entities: [{ id: 1, name: 'entity1', readonly: true }],
})

const buildBus = (): IBus => ({
  busId: 1,
  connectionData: { host: '127.0.0.1', port: 502, timeout: 100 },
  slaves: [],
})

const createComponent = (api: ApiServiceMock) => {
  const component = new SelectSlaveComponent(
    new FormBuilder(),
    { params: of({ busid: 1 }) } as any,
    api as any,
    { navigate: vi.fn() } as any,
    { copy: vi.fn() } as any
  )
  component.config = buildConfig()
  component.bus = buildBus()
  component.preparedSpecs = [buildSpec()]
  return component
}

describe('SelectSlaveComponent (vitest)', () => {
  it('saveSlave posts selected spec and poll mode', () => {
    const api = new ApiServiceMock()
    const component = createComponent(api)
    const slave: Islave = { slaveid: 1, pollMode: PollModes.intervall }
    const uiSlave = {
      slave,
      label: 'Slave 1',
      slaveForm: component.initiateSlaveControl(slave, null),
    } as any

    const identSpec = buildIdentSpec()
    uiSlave.slaveForm.get('specificationid')!.setValue(identSpec)
    uiSlave.slaveForm.get('pollMode')!.setValue(PollModes.intervall)
    uiSlave.slaveForm.get('discoverEntitiesList')!.setValue([1])

    component.saveSlave(uiSlave)

    expect(api.lastPost?.busId).toBe(1)
    expect(api.lastPost?.slave.specificationid).toBe('second')
    expect(api.lastPost?.slave.pollMode).toBe(PollModes.intervall)
  })

  it('addSlave appends new slave', () => {
    const api = new ApiServiceMock()
    const component = createComponent(api)

    component.uiSlaves = []
    component.slaveNewForm.get('slaveId')!.setValue(2)
    component.slaveNewForm.get('detectSpec')!.setValue(false)

    api.postSlave = (_busId: number, slave: Islave) => of({ ...slave, slaveid: 2 })

    component.addSlave(component.slaveNewForm)

    expect(component.uiSlaves.length).toBe(1)
    expect(component.uiSlaves[0].slave.slaveid).toBe(2)
  })

  it('deleteSlave calls API and removes slave', () => {
    const api = new ApiServiceMock()
    const component = createComponent(api)
    const slave: Islave = { slaveid: 1 }
    const uiSlave = {
      slave,
      label: 'Slave 1',
      slaveForm: component.initiateSlaveControl(slave, null),
    } as any

    component.uiSlaves = [uiSlave]

    component.deleteSlave(slave)

    expect(api.lastDelete?.busId).toBe(1)
    expect(api.lastDelete?.slaveId).toBe(1)
    expect(component.uiSlaves.length).toBe(0)
  })
})