import { it, expect, beforeAll, afterAll } from 'vitest'
import { startModbusTCPserver, stopModbusTCPServer } from '../../src/server/modbusTCPserver.js'
import { HttpErrorsEnum, ImodbusSpecification } from '../../src/shared/specification/index.js'
import { apiUri } from '../../src/shared/server/index.js'
import { ConfigSpecification } from '../../src/specification/index.js'
import { createTestServer, TestServer } from './httpTestHelper.js'

let ts: TestServer

beforeAll(async () => {
  ts = await createTestServer({ name: 'httpserver_get_spec', backendTCP: true })
  await startModbusTCPserver(ConfigSpecification.configDir, ConfigSpecification.dataDir, 0)
})
afterAll(() => {
  stopModbusTCPServer()
  ts.cleanup()
})

it('Discrete Inputs definition provided check', async () => {
  const response = await ts
    .request()
    .get(apiUri.modbusSpecification + '?busid=0&slaveid=3&spec=lc-technology-relay-input')
    .expect(HttpErrorsEnum.OK)
  const spec: ImodbusSpecification = response.body
  expect(spec.entities).toBeDefined()
  expect(spec.entities.length).toEqual(16)
  expect(spec.entities[0].registerType).toEqual(2)
})

it('Coils definition provided check', async () => {
  const response = await ts
    .request()
    .get(apiUri.modbusSpecification + '?busid=0&slaveid=3&spec=lc-technology-relay-input')
    .expect(HttpErrorsEnum.OK)
  const spec: ImodbusSpecification = response.body
  expect(spec.entities).toBeDefined()
  expect(spec.entities.length).toEqual(16)
  expect(spec.entities[8].registerType).toEqual(1)
})
