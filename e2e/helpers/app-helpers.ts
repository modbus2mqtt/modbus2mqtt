import { type Page, expect } from '@playwright/test';
import { PORTS, LOCALHOST } from './ports';

/**
 * Suppress all announcement banners via localStorage.
 * Must be called before the first page.goto().
 */
export async function dismissAnnouncements(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('modbus2mqtt.suppressBanner', 'true');
  });
}

/**
 * Open all collapsed mat-expansion-panel-header elements within a locator scope.
 */
async function openCollapsedPanels(page: Page, scope: string) {
  const panels = page.locator(`${scope} mat-expansion-panel-header[aria-expanded=false]`);
  const count = await panels.count();
  for (let i = 0; i < count; i++) {
    await panels.nth(i).click();
  }
}

/**
 * Select a mat-option by text. CDK overlay renders options at document root.
 */
async function selectMatOption(page: Page, text: string) {
  await page.locator('mat-option').filter({ hasText: text }).click();
}

export async function runRegister(
  page: Page,
  options: { authentication: boolean; port?: number; prefix?: string },
) {
  const prefix = options.prefix ?? '';
  let baseUrl: string;

  if (prefix.length) {
    baseUrl = `http://${LOCALHOST}:${PORTS.nginxAddon}/${prefix}`;
  } else if (options.port != null) {
    baseUrl = `http://${LOCALHOST}:${options.port}`;
  } else {
    baseUrl = `http://${LOCALHOST}:${PORTS.modbus2mqttSpec}`;
  }

  await dismissAnnouncements(page);
  await page.goto(baseUrl);

  if (options.authentication) {
    await page.locator('[formcontrolname="username"]').fill('test');
    await page.locator('[formcontrolname="password"]').fill('test');
    await page.locator('button[value="authentication"]').click();
  } else {
    const noAuthBtn = page.locator('button[value="noAuthentication"]');
    if ((await noAuthBtn.count()) > 0) {
      await noAuthBtn.click();
    }
  }

  // Wait for Angular to complete registration/login and navigate away from login/register.
  // The regex MUST be anchored: without ^ and $, a negative lookahead always matches at end-of-string.
  await page.waitForURL(/^(?!.*(login|register)).*$/, { timeout: 15000 });

  // Navigate to /configure if not already there
  if (!page.url().includes('/configure')) {
    await page.goto(baseUrl + '/configure');
    await page.waitForURL(/\/configure/, { timeout: 15000 });
  }

  await expect(page).toHaveURL(new RegExp(prefix + '/configure'));
}

export async function runConfig(
  page: Page,
  options: { authentication: boolean; prefix?: string },
) {
  const prefix = options.prefix ?? '';
  const port = options.authentication ? PORTS.mosquittoAuth : PORTS.mosquittoNoAuth;

  // Wait for the configure form to be visible
  await expect(page.locator('[formcontrolname="mqttserverurl"]')).toBeVisible({ timeout: 10000 });

  await page.locator('[formcontrolname="mqttserverurl"]').fill(`mqtt://${LOCALHOST}:${port}`);
  await page.locator('[formcontrolname="mqttserverurl"]').dispatchEvent('change');

  if (options.authentication) {
    await page.locator('[formcontrolname="mqttuser"]').fill('homeassistant');
    await page.locator('[formcontrolname="mqttpassword"]').fill('homeassistant');
  } else {
    // For no-auth mosquitto, clear credentials so validation succeeds
    await page.locator('[formcontrolname="mqttuser"]').fill('');
    await page.locator('[formcontrolname="mqttpassword"]').fill('');
  }
  await page.locator('[formcontrolname="mqttpassword"]').dispatchEvent('change');

  // Force-click save via dispatchEvent, bypassing disabled state (same as Cypress force:true).
  // The save() handler calls close() which navigates to '/'.
  const saveBtn = page.locator('div.saveCancel button').first();
  await saveBtn.dispatchEvent('click');
  await expect(page).toHaveURL(new RegExp(prefix + '/busses'), { timeout: 15000 });
}

export async function runBusses(page: Page, prefix?: string) {
  const pfx = prefix ?? '';
  await expect(page).toHaveURL(new RegExp(pfx + '/busses'));

  const firstCard = page.locator('mat-card').first();

  // Click TCP tab within this card
  await firstCard.locator('[role="tab"]').filter({ hasText: 'TCP' }).click();

  // Fill TCP form fields - scope to the tab panel containing the 'host' field (TCP-only)
  // Both tab panels may be visible, so [role="tabpanel"]:not([hidden]) matches both.
  const tcpPanel = firstCard.locator('[role="tabpanel"]').filter({ has: page.locator('[formcontrolname="host"]') });
  await tcpPanel.locator('[formcontrolname="host"]').fill(LOCALHOST);
  await tcpPanel.locator('[formcontrolname="port"]').fill('3002');
  await tcpPanel.locator('[formcontrolname="timeout"]').fill('500');

  // Add new bus (add_box) or save existing bus (check_circle)
  const buttons = firstCard.locator('div.card-header-buttons');
  const addBtn = buttons.locator('button').filter({ hasText: 'add_box' });
  const saveBtn = buttons.locator('button').filter({ hasText: 'check_circle' });

  if ((await addBtn.count()) > 0 && (await addBtn.isEnabled())) {
    await addBtn.click();
  } else if ((await saveBtn.count()) > 0) {
    await saveBtn.click();
  }

  // Wait for saved state: list button appears
  const listBtn = firstCard.locator('div.card-header-buttons button').filter({ hasText: 'list' });
  await listBtn.waitFor({ timeout: 10000 });
  await listBtn.click();
}

export async function addSlave(page: Page, prefix?: string) {
  const pfx = prefix ?? '';
  await expect(page).toHaveURL(new RegExp(pfx + '/slaves'));

  // Disable auto-detect
  await page.locator('[formcontrolname="detectSpec"]').click();

  // Find "New Slave" card and set slave ID
  const newSlaveCard = page.locator('mat-card').filter({ hasText: 'New Slave' });
  const slaveIdInput = newSlaveCard.locator('[formcontrolname="slaveId"]');
  await slaveIdInput.scrollIntoViewIfNeeded();
  await slaveIdInput.fill('3');
  await slaveIdInput.dispatchEvent('change');
  await slaveIdInput.dispatchEvent('blur');

  // Click Add button if enabled
  const addBtn = newSlaveCard.locator('button').first();
  if (await addBtn.isEnabled()) {
    await addBtn.click({ force: true });
  }

  // Wait for first slave card (not "New Slave")
  const slaveCards = page.locator('app-select-slave mat-card').filter({ hasNotText: 'New Slave' });
  await slaveCards.first().waitFor({ timeout: 10000 });

  // Open collapsed expansion panels (re-evaluate after each click)
  const firstCard = slaveCards.first();
  const collapsedPanels = firstCard.locator('mat-expansion-panel-header[aria-expanded=false]');
  while ((await collapsedPanels.count()) > 0) {
    await collapsedPanels.first().scrollIntoViewIfNeeded();
    await collapsedPanels.first().click();
    // Wait for expansion animation to complete
    await page.waitForTimeout(300);
  }

  // Set poll mode to "No polling" - scroll to make it visible first
  const pollMode = firstCard.locator('mat-select[formControlName="pollMode"]');
  await pollMode.scrollIntoViewIfNeeded();
  await pollMode.click();
  await selectMatOption(page, 'No polling');

  // Save slave (check_circle button)
  await firstCard.locator('div.card-header-buttons button').filter({ hasText: 'check_circle' }).first().click();

  // Navigate to specification (add_box button)
  await firstCard.locator('div.card-header-buttons button').filter({ hasText: 'add_box' }).first().click();

  await expect(page).toHaveURL(new RegExp(pfx + '/specification'));
}

export async function addEntity(page: Page, entityNum: number, modbusAddress: number) {
  const lastEntity = page.locator('app-entity').last();

  // Wait for the entity to be fully rendered with at least one expansion panel
  await lastEntity.locator('mat-expansion-panel-header').first().waitFor({ timeout: 10000 });

  // Open collapsed panels within entity (re-evaluate after each click since aria-expanded changes)
  const collapsedPanels = lastEntity.locator('mat-expansion-panel-header[aria-expanded=false]');
  while ((await collapsedPanels.count()) > 0) {
    await collapsedPanels.first().scrollIntoViewIfNeeded();
    await collapsedPanels.first().click();
    await page.waitForTimeout(300);
  }

  // Fill entity name
  const nameInput = lastEntity.locator('[formcontrolname="name"]');
  await nameInput.scrollIntoViewIfNeeded();
  await nameInput.fill(`the entity${entityNum}`);
  await nameInput.press('Enter');

  // Fill modbus address
  const addrInput = lastEntity.locator('[formcontrolname="modbusAddress"]');
  await addrInput.fill(String(modbusAddress));
  await addrInput.press('Enter');

  // Select converter: number
  const converterSelect = lastEntity.locator('mat-select[formControlName="converter"]');
  await converterSelect.scrollIntoViewIfNeeded();
  await converterSelect.click();
  await selectMatOption(page, 'number');

  // After selecting converter, a "Number Converter Properties" expansion panel appears.
  // Open any newly-collapsed panels (re-evaluate after each click).
  const converterPanels = lastEntity.locator('mat-expansion-panel-header[aria-expanded=false]');
  while ((await converterPanels.count()) > 0) {
    await converterPanels.first().scrollIntoViewIfNeeded();
    await converterPanels.first().click();
    await page.waitForTimeout(300);
  }

  // Fill min/max
  const minInput = lastEntity.locator('[formcontrolname="min"]');
  await minInput.scrollIntoViewIfNeeded();
  await minInput.fill('0');
  await lastEntity.locator('[formcontrolname="max"]').fill('1000');

  // Select register type: Holding
  const regTypeSelect = lastEntity.locator('mat-select[formControlName="registerType"]');
  await regTypeSelect.scrollIntoViewIfNeeded();
  await regTypeSelect.click();
  await selectMatOption(page, 'Holding');

  // Toggle readonly
  const readonlyToggle = lastEntity.locator('[formControlName="readonly"]');
  await readonlyToggle.scrollIntoViewIfNeeded();
  await readonlyToggle.click();

  // Click add entity button (add_circle icon)
  await lastEntity.locator('mat-card mat-card-header button').filter({ hasText: 'add_circle' }).last().click({ force: true });
}

export async function setUrls(page: Page) {
  const uploadFiles = page.locator('app-upload-files').first();

  // Image panel - add PNG URL
  await uploadFiles.locator('mat-expansion-panel-header').nth(1).click();
  await uploadFiles.locator('[formcontrolname="urlImage"]').fill(`http://${LOCALHOST}/test.png`);
  await uploadFiles.locator('button mat-icon').filter({ hasText: 'add' }).nth(1).click({ force: true });

  // Documentation panel - add PDF URL
  await uploadFiles.locator('mat-expansion-panel-header').nth(0).click();
  await uploadFiles.locator('[formcontrolname="urlDocument"]').fill(`http://${LOCALHOST}/test.pdf`);
  await uploadFiles.locator('button mat-icon').filter({ hasText: 'add' }).nth(0).click({ force: true });

  await page.waitForTimeout(1000);
}

export async function saveSpecification(page: Page) {
  // Save button should be enabled
  const saveBtn = page.locator('div.saveCancel').first().locator('button').nth(0);
  await expect(saveBtn).toBeEnabled();
  await saveBtn.click({ force: true });

  // Click second button (close/navigate back)
  await page.locator('div.saveCancel').first().locator('button').nth(1).click({ force: true });
}
