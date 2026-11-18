import { it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { SerialPort } from 'serialport'
import { ConfigBus } from '../../src/server/configbus.js'

type PortInfo = Awaited<ReturnType<typeof SerialPort.list>>[number]
// The device listing helpers are private; the tests reach them through this view
const bus = ConfigBus as unknown as {
  listDevicesUdev(next: (devices: string[]) => void, reject: (error: Error) => void): void
  grepDevices(info: { data: { devices: Array<{ subsystem?: string; dev_path: string; by_id?: string | null }> } }): string[]
}
const port = (path: string, pnpId: string | undefined): PortInfo =>
  ({
    path,
    pnpId,
    manufacturer: undefined,
    serialNumber: undefined,
    locationId: undefined,
    productId: undefined,
    vendorId: undefined,
  }) as PortInfo

let dir: string
const originalByIdDir = ConfigBus.serialByIdDir

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'configbus_devices'))
  ConfigBus.serialByIdDir = dir
})

afterEach(() => {
  ConfigBus.serialByIdDir = originalByIdDir
  vi.restoreAllMocks()
  fs.rmSync(dir, { recursive: true, force: true })
})

function listUdev(): Promise<string[]> {
  return new Promise((resolve, reject) => bus.listDevicesUdev(resolve, reject))
}

it('listDevicesUdev: offers the by-id path next to the tty path when it exists', async () => {
  fs.writeFileSync(path.join(dir, 'usb-FTDI_FT232R_USB_UART_BG012304HT-if00-port0'), '')
  vi.spyOn(SerialPort, 'list').mockResolvedValue([port('/dev/ttyUSB0', 'usb-FTDI_FT232R_USB_UART_BG012304HT-if00-port0')])
  expect(await listUdev()).toEqual(['/dev/ttyUSB0', path.join(dir, 'usb-FTDI_FT232R_USB_UART_BG012304HT-if00-port0')])
})

it('listDevicesUdev: no by-id path where the OS has none', async () => {
  vi.spyOn(SerialPort, 'list').mockResolvedValue([port('/dev/ttyUSB0', 'usb-missing-if00-port0'), port('/dev/ttyS0', undefined)])
  expect(await listUdev()).toEqual(['/dev/ttyUSB0', '/dev/ttyS0'])
})

it('grepDevices: adds the supervisor by_id path when it exists', () => {
  const tty = path.join(dir, 'ttyUSB0')
  const byId = path.join(dir, 'usb-FTDI-if00-port0')
  fs.writeFileSync(tty, '')
  fs.writeFileSync(byId, '')
  const rc = bus.grepDevices({
    data: {
      devices: [
        { subsystem: 'tty', dev_path: tty, by_id: byId },
        { subsystem: 'tty', dev_path: tty, by_id: null },
        { subsystem: 'tty', dev_path: tty, by_id: path.join(dir, 'gone') },
        { subsystem: 'block', dev_path: tty, by_id: byId },
      ],
    },
  })
  expect(rc).toEqual([tty, byId, tty, tty])
})
