import { describe, it, expect, afterEach } from 'vitest'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { provideNoopAnimations } from '@angular/platform-browser/animations'
import { ActivatedRoute, provideRouter } from '@angular/router'
import { EventEmitter } from '@angular/core'
import { from } from 'rxjs'
import { SelectSlaveComponent } from './select-slave.component'
import { ensureAngularTesting } from '../../test-setup'
import configurationFixture from '../../test-fixtures/configuration.json'
import busFixture from '../../test-fixtures/bus.json'
import slavesFixture from '../../test-fixtures/slaves.json'
import specificationsFixture from '../../test-fixtures/specifications.json'

ensureAngularTesting()

describe('Select Slave tests (vitest)', () => {
  let fixture: ComponentFixture<SelectSlaveComponent>
  let httpMock: HttpTestingController
  let ev: EventEmitter<number | undefined>

  /** detectChanges that tolerates NG0100 from cascading synchronous subscribes */
  function safeDetectChanges(): void {
    try {
      fixture.detectChanges()
    } catch (e: any) {
      if (!e.message?.includes('NG0100')) throw e
    }
  }

  /** Flush any pending GET /api/specification?spec=... requests with proper spec data */
  function flushSpecFetches(): void {
    httpMock.match((r) => r.url.includes('/api/specification?spec=')).forEach((r) => {
      const url = new URL(r.request.urlWithParams, 'http://localhost')
      const specName = url.searchParams.get('spec')
      r.flush({
        filename: specName,
        status: 0,
        entities: [{ id: 1, name: specName + '.entity1', readonly: true, mqttname: 'e1' }],
        i18n: [{ lang: 'en', texts: [{ textId: 'name', text: specName }] }],
        files: [],
      })
    })
  }

  async function mount(): Promise<void> {
    ;(window as any).configuration = { rootUrl: '/' }
    ev = new EventEmitter<number | undefined>()

    await TestBed.configureTestingModule({
      imports: [SelectSlaveComponent],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { params: from([{ busid: 1 }]) },
        },
      ],
    }).compileComponents()

    httpMock = TestBed.inject(HttpTestingController)
    fixture = TestBed.createComponent(SelectSlaveComponent)
    fixture.componentInstance.slaveidEventEmitter = ev

    // Trigger ngOnInit
    safeDetectChanges()

    // Flush cascading HTTP requests
    httpMock.expectOne((r) => r.url.includes('/api/configuration')).flush(configurationFixture)
    httpMock.expectOne((r) => r.url.includes('/api/specifications')).flush(specificationsFixture)
    httpMock.expectOne((r) => r.url.includes('/api/bus')).flush(busFixture)
    httpMock.expectOne((r) => r.url.includes('/api/slaves')).flush(slavesFixture)

    // Flush on-demand full spec fetches triggered by addSpecificationToUiSlave
    flushSpecFetches()

    // Multiple change detection cycles to stabilize
    safeDetectChanges()
    safeDetectChanges()
    safeDetectChanges()
  }

  afterEach(() => {
    fixture?.destroy()
  })

  it('mount and interact with slave', async () => {
    await mount()

    const component = fixture.componentInstance
    const el = fixture.nativeElement as HTMLElement

    // Verify slaves are populated
    expect(component.uiSlaves.length).toBe(1)
    expect(component.uiSlaves[0].slave.slaveid).toBe(1)

    // Slaves arrive without an embedded specification (decoupled API); the
    // discover-entities list must be recomputed once the spec fetch resolved.
    expect(component.uiSlaves[0].slaveForm.get('discoverEntitiesList')!.value).toEqual([1])

    const uiSlave = component.uiSlaves[0]

    // Set specificationid to the correct IidentificationSpecification object
    const secondSpec = { filename: 'second', name: 'Second', status: 0, identified: 1, entities: [] }
    uiSlave.slaveForm.get('specificationid')!.setValue(secondSpec)
    uiSlave.slaveForm.markAsTouched()
    safeDetectChanges()

    // Flush any modbus specification requests triggered by the change
    httpMock.match((r) => r.url.includes('/api/modbus/specification')).forEach((r) =>
      r.flush({
        filename: 'second',
        name: 'Second',
        status: 0,
        entities: [{ id: 1, name: 'second.entity1', readonly: true, mqttname: 'se1' }],
        i18n: [{ lang: 'en', texts: [{ textId: 'name', text: 'Second' }] }],
      })
    )
    safeDetectChanges()

    // Set pollMode to "Interval" (0) and a cron poll schedule
    uiSlave.slaveForm.get('pollMode')!.setValue(0)
    uiSlave.slaveForm.get('pollSchedule')!.setValue('0 * * * *')
    safeDetectChanges()

    // Call saveSlave directly (button might not render in jsdom due to @if timing)
    component.saveSlave(uiSlave)
    safeDetectChanges()

    // Flush on-demand spec fetch triggered by saveSlave -> addSpecificationToUiSlave
    flushSpecFetches()
    safeDetectChanges()

    // Verify the POST request
    const postReq = httpMock.expectOne((r) => r.method === 'POST' && r.url.includes('/api/slave'))
    expect(postReq.request.body.slaveid).toBe(1)
    expect(postReq.request.body.pollMode).toBe(0)
    expect(postReq.request.body.pollSchedule).toBe('0 * * * *')
    expect(postReq.request.body.specificationid).toBe('second')
    postReq.flush(postReq.request.body)
    safeDetectChanges()

    // Flush the slaves reload after save
    httpMock.match((r) => r.url.includes('/api/slaves')).forEach((r) => r.flush(slavesFixture))
    safeDetectChanges()

    // Flush any remaining requests
    httpMock.match(() => true).forEach((r) => r.flush([]))
  })

  it('http push body preview reacts to entity selection and root (zoneless)', async () => {
    await mount()
    const uiSlave = fixture.componentInstance.uiSlaves[0]

    // Deterministic spec so the preview does not depend on async spec loading.
    uiSlave.slave.specification = { entities: [{ id: 1, mqttname: 'e1' }] } as any

    // A URL is required for a non-empty preview.
    uiSlave.slaveForm.get('httpPushUrl')!.setValue('https://example.com/push')
    uiSlave.slaveForm.get('pushEntitiesList')!.setValue([])
    // No entities selected yet -> empty object. The signal updates from valueChanges alone,
    // without a change-detection cycle (the regression: under zoneless it never re-rendered).
    expect(uiSlave.httpPushBody!()).toBe('{}')

    // Selecting the entity must immediately update the signal.
    uiSlave.slaveForm.get('pushEntitiesList')!.setValue([1])
    expect(uiSlave.httpPushBody!()).toBe('{"e1":""}')

    // A root that exists narrows the payload to that subtree.
    uiSlave.slaveForm.get('httpPushRoot')!.setValue('e1')
    expect(uiSlave.httpPushBody!()).toBe('""')

    // A root that does not exist yields the explanatory placeholder.
    uiSlave.slaveForm.get('httpPushRoot')!.setValue('nope')
    expect(uiSlave.httpPushBody!()).toContain('not found')

    httpMock.match(() => true).forEach((r) => r.flush([]))
  })

  it('schedule presets, custom and human-readable description', async () => {
    await mount()
    const c = fixture.componentInstance

    // describeCron translations
    expect(c.describeCron('0 * * * *')).toBe('Every full hour (at :00)')
    expect(c.describeCron('*/15 * * * *')).toBe('Every 15 minutes (at :00, :15, :30, :45)')
    expect(c.describeCron('*/5 * * * *')).toBe('Every 5 minutes (at :00, :05, :10, :15, …)')
    expect(c.describeCron('0 */6 * * *')).toBe('Every 6 hours (at 00:00, 06:00, 12:00, 18:00)')
    expect(c.describeCron('30 6 * * *')).toBe('Every day at 06:30')
    expect(c.describeCron('0 8 * * mon')).toBe('Mondays at 08:00')
    expect(c.describeCron('')).toBe('')
    expect(c.describeCron('5 4 3 2 1')).toBe('') // no confident translation

    // preset selection writes the cron into pollSchedule
    const fg = c.uiSlaves[0].slaveForm
    fg.get('pollSchedulePreset')!.setValue('*/15 * * * *')
    c.onPollSchedulePresetChange(fg)
    expect(fg.get('pollSchedule')!.value).toBe('*/15 * * * *')

    // "Custom cron…" keeps the current expression for manual editing
    fg.get('pollSchedulePreset')!.setValue(c.pollScheduleCustom)
    c.onPollSchedulePresetChange(fg)
    expect(fg.get('pollSchedule')!.value).toBe('*/15 * * * *')

    // "No schedule" clears it (the interval is used again)
    fg.get('pollSchedulePreset')!.setValue('')
    c.onPollSchedulePresetChange(fg)
    expect(fg.get('pollSchedule')!.value).toBeNull()

    httpMock.match(() => true).forEach((r) => r.flush([]))
  })

  it('add slave', async () => {
    await mount()

    const component = fixture.componentInstance
    const el = fixture.nativeElement as HTMLElement

    // Type new slave ID
    const slaveIdInput = el.querySelector('input[name="slaveId"]') as HTMLInputElement
    slaveIdInput.value = '2'
    slaveIdInput.dispatchEvent(new Event('input'))
    safeDetectChanges()

    // Click add button
    const addButton = el.querySelector('button[mattooltip="Add Modbus Slave"]') as HTMLButtonElement
    addButton?.click()
    safeDetectChanges()

    // Verify the POST request for adding slave
    const postReq = httpMock.expectOne((r) => r.method === 'POST' && r.url.includes('/api/slave'))
    expect(postReq.request.body.slaveid).toBe(2)
    postReq.flush(postReq.request.body)
    safeDetectChanges()

    // Flush on-demand spec fetches and any subsequent requests
    flushSpecFetches()
    const remaining = httpMock.match(() => true)
    remaining.forEach((r) => r.flush([]))
  })
})
