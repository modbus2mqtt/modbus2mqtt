import { expect } from '@jest/globals'
import { IModbusResultWithDuration } from '../../src/server/bus.js'
import { ModbusRTUQueue } from '../../src/server/modbusRTUqueue.js'
import { ModbusRTUWorker } from '../../src/server/modbusRTUworker.js'
import { IModbusAPI } from '../../src/server/modbusWorker.js'
import { ModbusTasks } from '../../src/shared/server/index.js'
import * as fs from 'fs'
import { Config } from '../../src/server/config.js'
import { ConfigPersistence } from '../../src/server/persistence/configPersistence.js'
import { ConfigSpecification } from '../../src/specification/index.js'
import { join } from 'path'

/**
 * Universal Test Helper for file backup/restore
 * Save and restore files before/after tests
 */
export class FileBackupHelper {
  private backups: Map<string, string> = new Map()
  private testId: string

  constructor(testName?: string) {
    this.testId = testName || `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Create a backup of a file
   */
  backup(filePath: string): void {
    if (fs.existsSync(filePath)) {
      const backupPath = `${filePath}.backup-${this.testId}`
      fs.copyFileSync(filePath, backupPath)
      this.backups.set(filePath, backupPath)
    }
  }

  /**
   * Restore a file from its backup
   */
  restore(filePath: string): void {
    const backupPath = this.backups.get(filePath)
    if (backupPath && fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, filePath)
      fs.unlinkSync(backupPath)
      this.backups.delete(filePath)
    }
  }

  /**
   * Restore all backed-up files
   */
  restoreAll(): void {
    for (const [originalPath, backupPath] of this.backups.entries()) {
      if (fs.existsSync(backupPath)) {
        fs.copyFileSync(backupPath, originalPath)
        fs.unlinkSync(backupPath)
      }
    }
    this.backups.clear()
  }

  /**
   * Remove all backup files without restoring
   */
  cleanup(): void {
    for (const backupPath of this.backups.values()) {
      if (fs.existsSync(backupPath)) {
        fs.unlinkSync(backupPath)
      }
    }
    this.backups.clear()
  }
}

/**
 * Test helper for config file backup/restore
 * Save and restore secrets.yaml and other files before/after tests
 */
export class ConfigTestHelper {
  private helper: FileBackupHelper
  private originalSecretsPath: string

  constructor(testName?: string) {
    // Ensure configuration directories are set
    if (!ConfigPersistence.configDir || ConfigPersistence.configDir.length === 0) {
      throw new Error('ConfigPersistence.configDir must be set before creating ConfigTestHelper')
    }

    this.helper = new FileBackupHelper(testName)
    this.originalSecretsPath = ConfigPersistence.getLocalDir() + '/secrets.yaml'
  }

  setup(): void {
    // Create backups of all relevant files
    this.helper.backup(this.originalSecretsPath)

    // Also back up bus and specification files
    const configDir = ConfigPersistence.configDir
    if (configDir) {
      this.helper.backup(`${configDir}/modbus2mqtt/busses/bus.0/s2.yaml`)
      this.helper.backup(`${configDir}/modbus2mqtt/specifications/files/waterleveltransmitter/files.yaml`)
    }
  }

  restore(): void {
    this.helper.restoreAll()
  }

  cleanup(): void {
    this.helper.cleanup()
  }
}

/**
 * Test helper for specification files
 * Back up various specification files before tests
 */
export class SpecificationTestHelper {
  private helper: FileBackupHelper

  constructor(testName?: string) {
    this.helper = new FileBackupHelper(testName)
  }

  /**
   * Back up waterleveltransmitter files.yaml
   */
  backupWaterLevelTransmitter(baseDir: string): void {
    const filePath = `${baseDir}/modbus2mqtt/specifications/files/waterleveltransmitter/files.yaml`
    this.helper.backup(filePath)
  }

  /**
   * Back up bus.0 s2.yaml files
   */
  backupBusConfig(baseDir: string): void {
    const filePath = `${baseDir}/modbus2mqtt/busses/bus.0/s2.yaml`
    this.helper.backup(filePath)
  }

  /**
   * Back up all test-relevant specification files
   */
  backupAll(baseDir: string): void {
    this.backupWaterLevelTransmitter(baseDir)
    this.backupBusConfig(baseDir)
  }

  /**
   * Restore all files
   */
  restoreAll(): void {
    this.helper.restoreAll()
  }

  /**
   * Cleanup without restoring
   */
  cleanup(): void {
    this.helper.cleanup()
  }
}

/**
 * Test helper for migration tests
 * Manages temporary directories and files for CmdlineMigrate tests
 */
export class MigrationTestHelper {
  private helper: FileBackupHelper
  private tempDirs: Set<string> = new Set()

  constructor(testName?: string) {
    this.helper = new FileBackupHelper(testName)
  }

  /**
   * Register a temporary directory for cleanup
   */
  registerTempDir(dirPath: string): void {
    this.tempDirs.add(dirPath)
  }

  /**
   * Back up a file before the test
   */
  backup(filePath: string): void {
    this.helper.backup(filePath)
  }

  /**
   * Cleanup all temporary files and directories
   */
  cleanup(): void {
    // Helper cleanup
    this.helper.cleanup()

    // Remove temporary directories
    for (const dirPath of this.tempDirs) {
      if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true })
      }
    }
    this.tempDirs.clear()
  }

  /**
   * Restore all backed-up files
   */
  restoreAll(): void {
    this.helper.restoreAll()
  }
}

let data = 198
export class FakeBus implements IModbusAPI {
  reconnected: boolean = false
  wroteDataCount: number = 0
  callCount: number = 0
  constructor() {
    data = 198
  }
  getCacheId(): string {
    return '1'
  }
  reconnectRTU(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.reconnected = true
      resolve()
    })
  }

  writeHoldingRegisters(_slaveid: number, _dataaddress: number, data: number[]): Promise<void> {
    return new Promise<void>((resolve) => {
      this.wroteDataCount++
      expect(data[0]).toBeGreaterThanOrEqual(200)
      resolve()
    })
  }
  writeCoils(): Promise<void> {
    return new Promise<void>((_resolve, reject) => {
      reject(new Error('Error'))
    })
  }
  defaultRC = (resolve: (result: IModbusResultWithDuration) => void) => {
    resolve({ data: [0], duration: 199 })
  }
  readHoldingRegisters(_slaveid: number, dataaddress: number, length: number): Promise<IModbusResultWithDuration> {
    return new Promise<IModbusResultWithDuration>((resolve) => {
      const d: number[] = []
      this.callCount = 1
      for (let idx = 0; idx < length; idx++) d.push(dataaddress)
      data++
      resolve({ data: d, duration: data })
    })
  }
  readCoils(_slaveid: number, dataaddress: number, length: number): Promise<IModbusResultWithDuration> {
    return new Promise<IModbusResultWithDuration>((resolve, reject) => {
      if (this.callCount > 0) {
        this.callCount = 0
        const r: IModbusResultWithDuration = {
          data: [1],
          duration: 100,
        }
        resolve(r)
      } else {
        this.callCount = 1
        switch (dataaddress) {
          case 197:
            {
              this.callCount = 1
              const e1: any = new Error('Error')
              e1.modbusCode = 1 // Illegal function address
              reject(e1)
            }
            break
          case 198:
            {
              const e1: any = new Error('Error')
              e1.modbusCode = 1 // Illegal function code
              reject(e1)
            }
            break
          case 199:
            const e1: any = new Error('CRC error')
            reject(e1)
            break
          case 202:
            const e2: any = new Error('CRC error')
            reject(e2)
            break
          case 200:
            const e = new Error('Error')
            ;(e as any).errno = 'ETIMEDOUT'
            reject(e)
            break
          default:
            const r: IModbusResultWithDuration = {
              data: [1],
              duration: 100,
            }
            if (length > 1) for (let l = 1; l < length; l++) r.data.push(1)
            resolve(r)
        }
      }
    })
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  readDiscreteInputs(_slaveid: number, _dataaddress: number, _length: number): Promise<IModbusResultWithDuration> {
    return new Promise<IModbusResultWithDuration>(this.defaultRC)
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  readInputRegisters(_slaveid: number, _dataaddress: number, _length: number): Promise<IModbusResultWithDuration> {
    return new Promise<IModbusResultWithDuration>(this.defaultRC)
  }
}
export class ModbusRTUWorkerForTest extends ModbusRTUWorker {
  public isRunningForTest: boolean
  public expectedReconnected: boolean = false
  public expectedAPIcallCount: number = 1
  public expectedAPIwroteDataCount: number = 0
  public expectedRequestCountSpecification = 0
  constructor(
    modbusAPI: IModbusAPI,
    queue: ModbusRTUQueue,
    private done: () => void,
    private testcase: string
  ) {
    super(modbusAPI, queue)
    this.isRunningForTest = false
  }
  override onFinish(): void {
    const fakeBus: FakeBus = this.modbusAPI as any
    expect(fakeBus.callCount).toBe(this.expectedAPIcallCount)
    expect((this.modbusAPI as FakeBus).reconnected).toBe(this.expectedReconnected)
    expect(fakeBus.wroteDataCount).toBe(this.expectedAPIwroteDataCount)
    if (this.expectedRequestCountSpecification > 0) {
      const min = new Date().getMinutes()
      expect(this['cache'].get(1)!.requestCount[ModbusTasks.specification][min]).toBe(this.expectedRequestCountSpecification)
    }
    this.done()
  }
}
export interface Itest {
  worker?: ModbusRTUWorkerForTest
}

/**
 * Helper to create per-test temporary config/data directories and switch the app to use them.
 * Prevents tests from modifying shared fixtures like waterleveltransmitter.yaml.
 */
export class TempConfigDirHelper {
  private originalConfigDir: string
  private originalDataDir: string
  private originalSslDir: string
  private tempRoot: string
  private tempConfigDir: string
  private tempDataDir: string

  constructor(private name: string = 'temp') {
    this.originalConfigDir = ConfigSpecification.configDir || ConfigPersistence.configDir
    this.originalDataDir = ConfigSpecification.dataDir || ConfigPersistence.dataDir
    this.originalSslDir = ConfigPersistence.sslDir
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    this.tempRoot = join('/tmp', `modbus2mqtt-${this.name}-${stamp}`)
    this.tempConfigDir = join(this.tempRoot, 'config-dir')
    this.tempDataDir = join(this.tempRoot, 'data-dir')
  }

  /** Recursively copy a directory and ensure copies are writable */
  private copyDirSync(src: string, dest: string): void {
    fs.cpSync(src, dest, { recursive: true })
    this.makeWritableRecursive(dest)
  }

  /** Ensure all files and directories are writable (source may be readonly) */
  private makeWritableRecursive(dir: string): void {
    const stat = fs.statSync(dir)
    fs.chmodSync(dir, stat.mode | 0o700)
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        this.makeWritableRecursive(fullPath)
      } else {
        const fileStat = fs.statSync(fullPath)
        fs.chmodSync(fullPath, fileStat.mode | 0o600)
      }
    }
  }

  /** Set up temp dirs and switch Config/ConfigSpecification to use them */
  setup(): void {
    // Copy config-dir and data-dir if defined
    if (this.originalConfigDir && this.originalConfigDir.length > 0) this.copyDirSync(this.originalConfigDir, this.tempConfigDir)
    if (this.originalDataDir && this.originalDataDir.length > 0) this.copyDirSync(this.originalDataDir, this.tempDataDir)

    // Point runtime to the temp directories
    ConfigSpecification.configDir = this.tempConfigDir
    ConfigSpecification.dataDir = this.tempDataDir
    ConfigPersistence.configDir = this.tempConfigDir
    ConfigPersistence.dataDir = this.tempDataDir
    ConfigPersistence.sslDir = this.tempConfigDir
  }

  /** Restore original directories and remove temp dirs */
  cleanup(): void {
    // Restore paths
    ConfigSpecification.configDir = this.originalConfigDir
    ConfigSpecification.dataDir = this.originalDataDir
    ConfigPersistence.configDir = this.originalConfigDir
    ConfigPersistence.dataDir = this.originalDataDir
    ConfigPersistence.sslDir = this.originalSslDir

    // Remove temp root
    if (fs.existsSync(this.tempRoot)) {
      try {
        fs.rmSync(this.tempRoot, { recursive: true, force: true })
      } catch {
        // ignore cleanup errors in tests
      }
    }
  }
}
import { createServer } from 'net'

export const getAvailablePort = async (): Promise<number> => {
  return await new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.once('error', (err) => {
      reject(err)
    })
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address && typeof address === 'object') {
        const port = address.port
        server.close(() => resolve(port))
      } else {
        server.close(() => reject(new Error('Unable to determine free port')))
      }
    })
  })
}