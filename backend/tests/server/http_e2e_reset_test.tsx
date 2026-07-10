import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import { apiUri } from '../../src/shared/server/index.js'
import { ConfigPersistence } from '../../src/server/persistence/configPersistence.js'
import { createTestServer } from './httpTestHelper.js'

describe('POST ' + apiUri.e2eReset, () => {
  it('resets config state when MODBUS2MQTT_E2E is set', async () => {
    const ts = await createTestServer({ name: 'http-e2e-reset', env: { MODBUS2MQTT_E2E: '1' } })
    try {
      const response = await ts.request().post(apiUri.e2eReset).expect(200)
      expect(response.body.result).toBe('OK')
      const localDir = ConfigPersistence.getLocalDir()
      expect(fs.existsSync(localDir + '/busses')).toBeFalsy()
      expect(fs.existsSync(localDir + '/specifications')).toBeFalsy()
    } finally {
      ts.cleanup()
    }
  })

  it('is not registered without MODBUS2MQTT_E2E', async () => {
    const ts = await createTestServer({ name: 'http-e2e-reset-disabled' })
    try {
      // without the env var the route does not exist; the catch-all serves the SPA
      const response = await ts.request().post(apiUri.e2eReset).expect(200)
      expect(response.type).toBe('text/html')
    } finally {
      ts.cleanup()
    }
  })
})
