import { test, expect } from '@playwright/test';
import { PORTS, LOCALHOST } from '../helpers/ports';
import { runRegister, runConfig } from '../helpers/app-helpers';
import { resetServer } from '../helpers/reset-helper';

/** Minimal spec JSON that can be imported via POST /api/uploadspec */
const localSpec = {
  filename: 'e2e-test-spec',
  version: '0.5',
  model: 'E2E Test Model',
  manufacturer: 'E2E Manufacturer',
  status: 2, // SpecificationStatus.added
  entities: [
    {
      id: 1,
      name: 'temperature',
      readonly: true,
      mqttname: 'temp',
      converter: 'number',
      registerType: 3, // HoldingRegister
      modbusAddress: 0,
      converterParameters: { multiplier: 0.1, offset: 0, uom: '°C' },
    },
  ],
  files: [{ url: 'http://example.com/image.png', fileLocation: 0, usage: 'img' }],
  i18n: [
    {
      lang: 'en',
      texts: [
        { textId: 'name', text: 'E2E Test Specification' },
        { textId: 'e1', text: 'Temperature' },
      ],
    },
  ],
  testdata: {},
};

test.describe('Specifications Page Tests', () => {
  const baseUrl = `http://${LOCALHOST}:${PORTS.modbus2mqttSpec}`;

  test.beforeEach(async () => {
    await resetServer(PORTS.modbus2mqttSpec);
  });

  test('shows public specifications and imported local spec', async ({ page }) => {
    test.setTimeout(120_000);

    // Register and configure MQTT (no-auth backend — API calls need no bearer token)
    await runRegister(page, { authentication: false, port: PORTS.modbus2mqttSpec });
    await runConfig(page, { authentication: false });

    const headers = { 'Content-Type': 'application/json' };

    // Import a local specification via API
    const uploadResponse = await page.request.post(`${baseUrl}/api/uploadspec`, {
      data: localSpec,
      headers,
    });
    const uploadStatus = uploadResponse.status();
    const uploadBody = await uploadResponse.text();
    expect(uploadResponse.ok(), `Upload failed with ${uploadStatus}: ${uploadBody}`).toBeTruthy();
    const uploadResult = JSON.parse(uploadBody);
    expect(uploadResult.errors).toBeFalsy();

    // Verify GET /api/specifications returns summary format
    const apiResponse = await page.request.get(`${baseUrl}/api/specifications`, {
      headers,
    });
    expect(apiResponse.ok()).toBeTruthy();
    const specs = await apiResponse.json();
    expect(specs.length).toBeGreaterThan(0);

    // Find our imported spec
    const importedSpec = specs.find((s: any) => s.filename === 'e2e-test-spec');
    expect(importedSpec).toBeTruthy();
    expect(importedSpec.model).toBe('E2E Test Model');
    expect(importedSpec.manufacturer).toBe('E2E Manufacturer');
    expect(importedSpec.i18n).toBeDefined();
    expect(importedSpec.files).toBeDefined();
    // Summary must NOT contain entities or identified
    expect(importedSpec.entities).toBeUndefined();
    expect(importedSpec.identified).toBeUndefined();
    // Files must only contain url+usage (no data, no fileLocation)
    if (importedSpec.files.length > 0) {
      expect(importedSpec.files[0]).toHaveProperty('url');
      expect(importedSpec.files[0]).toHaveProperty('usage');
      expect(importedSpec.files[0].data).toBeUndefined();
      expect(importedSpec.files[0].fileLocation).toBeUndefined();
    }

    // Check that public specs are also present
    const publicSpecs = specs.filter((s: any) => s.status === 0); // SpecificationStatus.published
    expect(publicSpecs.length).toBeGreaterThan(0);

    // Navigate to specifications page
    await page.goto(`${baseUrl}/specifications`);
    await page.waitForURL(/\/specifications/, { timeout: 15000 });

    // Wait for spec cards to render
    const specCards = page.locator('mat-card').filter({ hasNotText: 'Functions' });
    await expect(specCards.first()).toBeVisible({ timeout: 15000 });

    // Verify our local spec is displayed
    const localSpecCard = specCards.filter({ hasText: 'E2E Test Specification' });
    await expect(localSpecCard).toBeVisible({ timeout: 10000 });

    // Verify at least one public spec is displayed
    const cardCount = await specCards.count();
    expect(cardCount).toBeGreaterThan(1);

    // Verify local spec can be deleted (delete button enabled for local specs)
    const deleteButton = localSpecCard.locator('button').filter({ hasText: 'delete' });
    await expect(deleteButton).toBeEnabled();
  });
});
