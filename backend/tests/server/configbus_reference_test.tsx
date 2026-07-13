import { it, expect, beforeAll, afterAll, beforeEach, describe, vi } from 'vitest'
import { Config, ConfigListenerEvent } from '../../src/server/config.js'
import { ConfigPersistence } from '../../src/server/persistence/configPersistence.js'
import { ConfigBus, SlaveReferencedError } from '../../src/server/configbus.js'
import { ConfigSpecification } from '../../src/specification/index.js'
import { TempConfigDirHelper } from './testhelper.js'
import { setConfigsDirsForTest } from './configsbase.js'
import { Islave, PollModes, Slave } from '../../src/shared/server/index.js'
import { parse } from 'yaml'
import * as fs from 'fs'
import { join } from 'path'

setConfigsDirsForTest()

let tempHelper: TempConfigDirHelper

// Ids the fixture config-dir does not use: the tests must never touch the shipped slave files.
const ROOT_ID = 60
const CHILD_ID = 61
const EARLY_CHILD_ID = 59

function slaveFile(slaveid: number): string {
  return join(ConfigPersistence.getLocalDir(), 'busses', 'bus.0', 's' + slaveid + '.yaml')
}
function readSlaveFile(slaveid: number): Islave {
  return parse(fs.readFileSync(slaveFile(slaveid), 'utf8'))
}
function root(): Islave {
  return {
    slaveid: ROOT_ID,
    specificationid: 'waterleveltransmitter',
    name: 'root meter',
    pollMode: PollModes.intervall,
    pollSchedule: '0 * * * *',
    qos: 1,
    httpPush: { url: 'https://heimvio.de/readings/{{ slaveName }}', pushEntities: [1] },
  }
}
function child(): Islave {
  return { slaveid: CHILD_ID, referenceSlaveId: ROOT_ID, name: 'child meter', rootTopic: 'meters/child' }
}
/** Writes root + child and puts both into the in-memory bus, the way Bus.writeSlave does. */
function writeRootAndChild(): { rootSlave: Islave; childSlave: Islave } {
  const bus = ConfigBus.getBussesProperties().find((b) => b.busId === 0)!
  const rootSlave = root()
  ConfigBus.writeslave(0, rootSlave)
  bus.slaves.push(rootSlave)
  const childSlave = child()
  ConfigBus.writeslave(0, childSlave)
  bus.slaves.push(childSlave)
  return { rootSlave, childSlave }
}

beforeAll(async () => {
  tempHelper = new TempConfigDirHelper('configbus_reference')
  tempHelper.setup()
  const config = new Config()
  await config.readYamlAsync()
  new ConfigSpecification().readYaml()
})

afterAll(() => {
  if (tempHelper) tempHelper.cleanup()
})

beforeEach(() => {
  for (const id of [ROOT_ID, CHILD_ID, EARLY_CHILD_ID]) if (fs.existsSync(slaveFile(id))) fs.unlinkSync(slaveFile(id))
  ConfigBus.readBusses()
})

describe('referencing slaves', () => {
  it('persists only the own fields of a referencing slave', () => {
    writeRootAndChild()

    const persisted = readSlaveFile(CHILD_ID)
    expect(persisted).toEqual({
      slaveid: CHILD_ID,
      referenceSlaveId: ROOT_ID,
      name: 'child meter',
      rootTopic: 'meters/child',
    })
  })

  it('discards inherited values a client sends for a referencing slave', () => {
    const bus = ConfigBus.getBussesProperties().find((b) => b.busId === 0)!
    const rootSlave = root()
    ConfigBus.writeslave(0, rootSlave)
    bus.slaves.push(rootSlave)

    const smuggled: Islave = { ...child(), qos: 2, httpPush: { url: 'https://evil.example/{{ slaveName }}' } }
    ConfigBus.writeslave(0, smuggled)

    expect(readSlaveFile(CHILD_ID).httpPush).toBeUndefined()
    // in memory the child follows the root, not what the client sent
    expect(smuggled.qos).toBe(1)
    expect(smuggled.httpPush!.url).toBe('https://heimvio.de/readings/{{ slaveName }}')
  })

  it('materializes the inherited fields when reading the config', () => {
    writeRootAndChild()
    ConfigBus.readBusses()

    const reread = ConfigBus.getSlave(0, CHILD_ID)!
    expect(reread.referenceSlaveId).toBe(ROOT_ID)
    expect(reread.specificationid).toBe('waterleveltransmitter')
    expect(reread.pollSchedule).toBe('0 * * * *')
    expect(reread.qos).toBe(1)
    expect(reread.httpPush!.url).toBe('https://heimvio.de/readings/{{ slaveName }}')
    // its own fields survive
    expect(reread.name).toBe('child meter')
    expect(reread.rootTopic).toBe('meters/child')
  })

  it('resolves a reference whose root is read after it', () => {
    // s59 (child) is read before s60 (root): resolution must not depend on file order
    const bus = ConfigBus.getBussesProperties().find((b) => b.busId === 0)!
    const rootSlave = root()
    ConfigBus.writeslave(0, rootSlave)
    bus.slaves.push(rootSlave)
    const early: Islave = { slaveid: EARLY_CHILD_ID, referenceSlaveId: ROOT_ID, name: 'early child' }
    ConfigBus.writeslave(0, early)

    ConfigBus.readBusses()

    const reread = ConfigBus.getSlave(0, EARLY_CHILD_ID)!
    expect(reread.specificationid).toBe('waterleveltransmitter')
  })

  it('tolerates a missing root: no throw, no specification, so the slave is not polled', () => {
    const orphan: Islave = { slaveid: CHILD_ID, referenceSlaveId: 999, name: 'orphan' }
    ConfigBus.writeslave(0, orphan)

    expect(() => ConfigBus.readBusses()).not.toThrow()
    const reread = ConfigBus.getSlave(0, CHILD_ID)!
    expect(reread).toBeDefined()
    expect(reread.specificationid).toBeUndefined()
    expect(reread.name).toBe('orphan')
  })

  it('re-materializes the children and emits updateSlave when the root changes', () => {
    const { rootSlave, childSlave } = writeRootAndChild()
    const updated: Slave[] = []
    ConfigBus.addListener(ConfigListenerEvent.updateSlave, vi.fn().mockImplementation((s: Slave) => {
      updated.push(s)
      return Promise.resolve(undefined)
    }) as never)

    rootSlave.httpPush!.url = 'https://heimvio.de/v2/{{ slaveName }}'
    rootSlave.qos = 2
    ConfigBus.writeslave(0, rootSlave)

    expect(childSlave.httpPush!.url).toBe('https://heimvio.de/v2/{{ slaveName }}')
    expect(childSlave.qos).toBe(2)
    expect(updated.map((s) => s.getSlaveId())).toContain(CHILD_ID)
    // the child's file still holds the delta only
    expect(readSlaveFile(CHILD_ID).httpPush).toBeUndefined()
  })

  it('refuses to delete a referenced slave', () => {
    writeRootAndChild()
    expect(() => ConfigBus.deleteSlave(0, ROOT_ID)).toThrow(SlaveReferencedError)
    expect(fs.existsSync(slaveFile(ROOT_ID))).toBe(true)
    expect(ConfigBus.getSlave(0, ROOT_ID)).toBeDefined()
  })

  it('detaches the children on delete when asked: they keep their configuration', () => {
    writeRootAndChild()

    ConfigBus.deleteSlave(0, ROOT_ID, true)

    expect(fs.existsSync(slaveFile(ROOT_ID))).toBe(false)
    const detached = readSlaveFile(CHILD_ID)
    expect(detached.referenceSlaveId).toBeUndefined()
    expect(detached.specificationid).toBe('waterleveltransmitter')
    expect(detached.httpPush!.url).toBe('https://heimvio.de/readings/{{ slaveName }}')
    expect(detached.name).toBe('child meter')
  })

  it('deletes a slave nobody references', () => {
    const bus = ConfigBus.getBussesProperties().find((b) => b.busId === 0)!
    const rootSlave = root()
    ConfigBus.writeslave(0, rootSlave)
    bus.slaves.push(rootSlave)

    expect(() => ConfigBus.deleteSlave(0, ROOT_ID)).not.toThrow()
    expect(fs.existsSync(slaveFile(ROOT_ID))).toBe(false)
  })
})
