import { test } from '@playwright/test';
import { PORTS, LOCALHOST } from '../helpers/ports';
import { runRegister, runConfig, runBusses, dismissAnnouncements } from '../helpers/app-helpers';
import { resetServer } from '../helpers/reset-helper';

test.describe('End to End Tests', () => {
  test.beforeEach(async () => {
    await resetServer(PORTS.modbus2mqttNoAuth);
    await resetServer(PORTS.modbus2mqttAddon);
  });

  test('register->mqtt with no authentication', async ({ page }) => {
    await runRegister(page, { authentication: false, port: PORTS.modbus2mqttNoAuth });
    await runConfig(page, { authentication: false });
  });

  test('mqtt hassio addon', async ({ page }) => {
    await dismissAnnouncements(page);
    await page.goto(`http://${LOCALHOST}:${PORTS.nginxAddon}/ingress`);
    await runBusses(page, 'ingress');
  });
});
