import { describe, expect, it } from 'vitest'
import { ModbusRTUWorker } from '../../src/server/modbusRTUworker.js'
import { IModbusAPI } from '../../src/server/modbusWorker.js'
import { IQueueEntry, ModbusErrorActions, ModbusRTUQueue } from '../../src/server/modbusRTUqueue.js'
import { ModbusRegisterType } from '../../src/shared/specification/index.js'
import { ModbusTasks } from '../../src/shared/server/index.js'
import { Itest, ModbusRTUWorkerForTest, FakeBus } from './testhelper.js'

function enqueue(queue: ModbusRTUQueue, num: number, test: Itest) {
  queue.enqueue(
    1,
    { registerType: ModbusRegisterType.HoldingRegister, address: num },
    (qe, data) => {
      // validate no paralell processing
      expect(test.worker!.isRunningForTest).toBeFalsy()
      test.worker!.isRunningForTest = true

      expect(data).toBeDefined()
      expect(data![0]).toBe(num)
      test.worker!.isRunningForTest = false
    },
    () => {
      return ModbusErrorActions.handledNoReconnect
    },
    { task: ModbusTasks.specification, errorHandling: {} }
  )
}
function enqueueWrite(queue: ModbusRTUQueue, num: number, test: Itest) {
  queue.enqueue(
    1,
    { registerType: ModbusRegisterType.HoldingRegister, address: num, write: [num] },
    () => {
      // validate no paralell processing
      expect(test.worker!.isRunningForTest).toBeFalsy()
      test.worker!.isRunningForTest = true
      test.worker!.isRunningForTest = false
    },
    () => {
      return ModbusErrorActions.handledNoReconnect
    },
    { task: ModbusTasks.specification, errorHandling: {} }
  )
}
it('Sequential read successful processing', async () => {
  expect.hasAssertions()
  const queue = new ModbusRTUQueue()
  const test: Itest = {}
  enqueue(queue, 199, test) //CRC
  enqueue(queue, 200, test) //Timeout

  let done!: () => void
  const finished = new Promise<void>((resolve) => {
    done = resolve
  })
  test.worker = new ModbusRTUWorkerForTest(new FakeBus(), queue, done, 'read')
  const worker = test.worker
  worker.expectedReconnected = false
  worker.expectedAPIcallCount = 1
  worker.expectedAPIwroteDataCount = 0
  worker.expectedRequestCountSpecification = 3
  worker.run()
  // Hopefully, the run process resetted the queue before next queue entry is added
  enqueue(queue, 201, test)
  await finished
})

describe('ModbusRTUWorker read', () => {
  it('Sequential read error processing', async () => {
    const queue = new ModbusRTUQueue()
    const test: Itest = {}
    queue.enqueue(
      1,
      { registerType: ModbusRegisterType.Coils, address: 199 },
      (qe, result) => {
        expect(result![0]).toBe(1)
      },
      () => {
        // This should not happen
        expect(true).toBeFalsy()
      },
      { task: ModbusTasks.specification, errorHandling: { retry: true } }
    )
    queue.enqueue(
      1,
      { registerType: ModbusRegisterType.Coils, address: 200 },
      (qe, result) => {
        expect(result![0]).toBe(1)
      },
      () => {
        // This should not happen
        expect(true).toBeFalsy()
      },
      { task: ModbusTasks.specification, errorHandling: { retry: true } }
    )
    let done!: () => void
    const finished = new Promise<void>((resolve) => {
      done = resolve
    })
    test.worker = new ModbusRTUWorkerForTest(new FakeBus(), queue, done, 'read')
    const worker = test.worker
    worker.expectedReconnected = false
    worker.expectedAPIcallCount = 0
    worker.run()
    await finished
  })
  it('Sequential read error Illegal Function code', async () => {
    const queue = new ModbusRTUQueue()
    const test: Itest = {}
    const fb = new FakeBus()
    queue.enqueue(
      1,
      { registerType: ModbusRegisterType.Coils, address: 198 },
      () => {
        expect(true).toBeFalsy()
      },
      () => {
        fb.callCount = 199 // unique identifier to validate in onFinish()
      },
      { task: ModbusTasks.specification, errorHandling: {} }
    )
    let done!: () => void
    const finished = new Promise<void>((resolve) => {
      done = resolve
    })
    test.worker = new ModbusRTUWorkerForTest(fb, queue, done, 'read')
    const worker = test.worker
    worker.expectedReconnected = false
    worker.expectedAPIcallCount = 199
    worker.run()
    await finished
  })
  it('Sequential read error processing with retry (no reconnect)', async () => {
    const queue = new ModbusRTUQueue()
    const test: Itest = {}
    queue.enqueue(
      1,
      { registerType: ModbusRegisterType.Coils, address: 199 },
      (qe, result) => {
        expect(result![0]).toBe(1)
      },
      () => {
        // This should not happen
        expect(true).toBeFalsy()
      },
      { task: ModbusTasks.specification, errorHandling: { retry: true } }
    )
    let done!: () => void
    const finished = new Promise<void>((resolve) => {
      done = resolve
    })
    test.worker = new ModbusRTUWorkerForTest(new FakeBus(), queue, done, 'read')
    const worker = test.worker
    worker.expectedReconnected = false
    worker.expectedAPIcallCount = 0
    worker.run()
    await finished
  })
  it('Sequential read error processing with split', async () => {
    const queue = new ModbusRTUQueue()
    const test: Itest = {}
    queue.enqueue(
      1,
      { registerType: ModbusRegisterType.Coils, address: 202, length: 3 },
      (qe, result) => {
        expect(result![0]).toBe(1)
      },
      () => {
        // This should not happen
        expect(true).toBeFalsy()
      },
      { task: ModbusTasks.specification, errorHandling: { retry: true, split: true } }
    )
    let done!: () => void
    const finished = new Promise<void>((resolve) => {
      done = resolve
    })
    test.worker = new ModbusRTUWorkerForTest(new FakeBus(), queue, done, 'read')
    const worker = test.worker
    worker.expectedReconnected = false
    worker.expectedAPIcallCount = 0
    worker.run()
    await finished
  })
  it('Sequential read error processing: Timeout', async () => {
    const queue = new ModbusRTUQueue()
    const test: Itest = {}
    queue.enqueue(
      1,
      { registerType: ModbusRegisterType.Coils, address: 200 },
      (qe, result) => {
        // should not be called, because of error
        expect(result![0]).toBe(1)
      },
      () => {
        // This should not happen
        expect(true).toBeFalsy()
      },
      { task: ModbusTasks.specification, errorHandling: { retry: true } }
    )
    let done!: () => void
    const finished = new Promise<void>((resolve) => {
      done = resolve
    })
    test.worker = new ModbusRTUWorkerForTest(new FakeBus(), queue, done, 'readExcpetion')
    const worker = test.worker
    worker.expectedReconnected = false
    worker.expectedAPIcallCount = 0
    worker.run()
    await finished
  })
})
function genCacheEntry(
  address: number,
  onResult: (queueEntry: IQueueEntry, result: number[] | undefined) => void,
  onError: (queueEntry: IQueueEntry, error: any) => void
): IQueueEntry {
  return {
    slaveId: 1,
    address: { address: address, length: 1, registerType: ModbusRegisterType.HoldingRegister },
    options: { useCache: true, task: ModbusTasks.specification, errorHandling: {} },
    onResolve: onResult,
    onError: onError,
  }
}
class RTUWorkerCached extends ModbusRTUWorker {
  constructor(
    api: IModbusAPI,
    queue: ModbusRTUQueue,
    private onFinishP: () => void,
    public currentDate: Date = new Date(2025, 1, 1, 5, 0, 0, 0)
  ) {
    super(api, queue)
  }

  protected override getCurrentDate(): Date {
    return new Date(this.currentDate.getTime())
  }
  override onFinish(): void {
    this.onFinishP()
  }
}
describe('ModbusRTUWorker Cache', () => {
  it('updateCacheError', () => {
    const queue = new ModbusRTUQueue()
    const worker = new RTUWorkerCached(new FakeBus(), queue, () => {})
    const e199 = genCacheEntry(
      199,
      () => {},
      () => {}
    )

    worker['updateCache'](e199, [-199])
    expect(worker['cache'].get(1)!.holdingRegisters.get(199)!.data![0]).toBe(-199)
    worker['updateCache'](e199, [-201])
    expect(worker['cache'].get(1)!.holdingRegisters.get(199)!.data![0]).toBe(-201)
    worker['updateCacheError'](e199, new Error('Error'))
    // Cache Entry is "new"
    expect(worker['cache'].get(1)!.holdingRegisters.get(199)!.data![0]).toBe(-201)
    expect(worker['cache'].get(1)!.holdingRegisters.get(199)!.error).toBeUndefined()
    worker.currentDate = new Date(2025, 1, 1, 13, 0, 0, 0)
    // Entry is "old"
    worker['updateCacheError'](e199, new Error('Error'))
    expect(worker['cache'].get(1)!.holdingRegisters.get(199)!.data).toBeUndefined()
    expect(worker['cache'].get(1)!.holdingRegisters.get(199)!.error).toBeDefined()
  })
  it('cleanupCache', () => {
    const queue = new ModbusRTUQueue()
    const worker = new RTUWorkerCached(new FakeBus(), queue, () => {})
    const e199 = genCacheEntry(
      199,
      () => {},
      () => {}
    )
    // expired entry
    const e200 = genCacheEntry(
      200,
      () => {},
      () => {}
    )
    worker['updateCache'](e199, [-199])
    const cd = worker.currentDate
    worker.currentDate = new Date(2025, 1, 1, 5 - 13, 0, 0, 0)
    worker['updateCache'](e200, [-200])
    worker.currentDate = cd
    worker['cleanupCache']()
    expect(worker['cache'].get(1)!.holdingRegisters.get(199)!.data).toBeDefined()
    expect(worker['cache'].get(1)!.holdingRegisters.get(200)).toBeUndefined()
  })
  it('Read from cache', async () => {
    const queue = new ModbusRTUQueue()
    let onResultCallCount = 0
    let onErrorCallCount = 0
    const e199 = genCacheEntry(
      199,
      (qe, result) => {
        onResultCallCount++
        expect(result![0]).toBe(2)
      },
      () => {
        onErrorCallCount++
      }
    )
    const e200 = genCacheEntry(
      200,
      (qe, result) => {
        onResultCallCount++
        expect(result![0]).toBe(2)
      },
      () => {
        onErrorCallCount++
      }
    )
    const e201 = genCacheEntry(
      201,
      (qe, result) => {
        onResultCallCount++
        expect(result![0]).toBe(3)
      },
      () => {
        onErrorCallCount++
      }
    )
    const finished = new Promise<void>((resolve) => {
      const worker = new RTUWorkerCached(new FakeBus(), queue, () => {
        expect(onResultCallCount).toBe(2)
        expect(onErrorCallCount).toBe(1)
        resolve()
      })
      worker['updateCache'](e199, [2])
      worker['updateCacheError'](e200, new Error('Error'))
      worker['updateCache'](e201, [3])
      queue.enqueueEntry(e199)
      queue.enqueueEntry(e200)
      queue.enqueueEntry(e201)
      worker.run()
    })
    await finished
  })
})
describe('ModbusRTUWorker write', () => {
  it('Sequential read and write successful processing', async () => {
    expect.hasAssertions()
    const queue = new ModbusRTUQueue()
    const test: Itest = {}
    enqueue(queue, 199, test)
    enqueueWrite(queue, 200, test)
    let done!: () => void
    const finished = new Promise<void>((resolve) => {
      done = resolve
    })
    test.worker = new ModbusRTUWorkerForTest(new FakeBus(), queue, done, 'write')
    const worker = test.worker
    worker.expectedReconnected = false
    worker.expectedAPIcallCount = 1
    worker.expectedAPIwroteDataCount = 2
    worker.run()
    // Hopefully, the run process resetted the queue before next queue entry is added
    enqueueWrite(queue, 201, test)
    await finished
  })
})

// Issue #229: a failing poll read produced no data, the entity was published as an empty value and
// Home Assistant flipped it to "unknown" until the next successful poll - the values kept toggling.
// The cache still holds the last successfully read value, so a failing poll now serves that.
class FlakyApi implements IModbusAPI {
  fail = false
  constructor(private cacheId: string) {}
  getCacheId(): string {
    return this.cacheId
  }
  reconnectRTU(): Promise<void> {
    return Promise.resolve()
  }
  private read = (_slaveid: number, _address: number, _length: number) => {
    if (this.fail) {
      const e = new Error('Error') as Error & { errno?: string }
      e.errno = 'ETIMEDOUT'
      return Promise.reject(e)
    }
    return Promise.resolve({ data: [42], duration: 1 })
  }
  readHoldingRegisters = this.read
  readCoils = this.read
  readDiscreteInputs = this.read
  readInputRegisters = this.read
  writeHoldingRegisters = () => Promise.resolve()
  writeCoils = () => Promise.resolve()
}

function poll(worker: ModbusRTUWorker, queue: ModbusRTUQueue, task: ModbusTasks): Promise<number[] | Error> {
  return new Promise<number[] | Error>((resolve) => {
    queue.enqueue(
      1,
      { registerType: ModbusRegisterType.HoldingRegister, address: 7 },
      (_qe, data) => resolve(data as number[]),
      (_qe, e) => resolve(e as Error),
      { task, errorHandling: {} }
    )
    worker.run()
  })
}

describe('failing reads keep the last known value (issue #229)', () => {
  it('serves the cached value when a poll read fails', async () => {
    const api = new FlakyApi('flaky-poll')
    const queue = new ModbusRTUQueue()
    const worker = new ModbusRTUWorker(api, queue)

    expect(await poll(worker, queue, ModbusTasks.poll)).toEqual([42])

    // the device stops answering: the poll must still deliver the last known value, not a hole
    api.fail = true
    expect(await poll(worker, queue, ModbusTasks.poll)).toEqual([42])
  })

  it('does not fake a value for a task other than the poll', async () => {
    const api = new FlakyApi('flaky-spec')
    const queue = new ModbusRTUQueue()
    const worker = new ModbusRTUWorker(api, queue)

    expect(await poll(worker, queue, ModbusTasks.specification)).toEqual([42])

    // device detection and specification reads must see the failure - a stale value would
    // silently identify the wrong device
    api.fail = true
    expect(await poll(worker, queue, ModbusTasks.specification)).toBeInstanceOf(Error)
  })

  it('reports the failure when nothing was ever read successfully', async () => {
    const api = new FlakyApi('flaky-cold')
    api.fail = true
    const queue = new ModbusRTUQueue()
    const worker = new ModbusRTUWorker(api, queue)

    expect(await poll(worker, queue, ModbusTasks.poll)).toBeInstanceOf(Error)
  })
})
