import { it, expect, beforeAll, afterAll } from 'vitest'
import { createServer, request as httpRequest } from 'http'
import express from 'express'
import { join } from 'path'
import { createTestServer, TestServer } from './httpTestHelper.js'
import { WebuiStatics } from '../../src/server/http/webuiStatics.js'

let ts: TestServer
beforeAll(async () => {
  // The new webui is mounted at the root (/); mockHassio provides the ingress
  // entry used for base-href rewrites elsewhere.
  ts = await createTestServer({ name: 'http-webui-statics', mockHassio: true })
})
afterAll(() => ts.cleanup())

it('GET / serves the new webui index (root)', async () => {
  const response = await ts.request().get('/').expect(200)
  expect(response.type).toBe('text/html')
  expect(response.text).toContain('Webui Fixture')
})

it('GET /index.html serves the static index.html', async () => {
  const response = await ts.request().get('/index.html').expect(200)
  expect(response.type).toBe('text/html')
  expect(response.text).toContain('Webui Fixture')
})

it('GET /style.css serves the stylesheet with correct content type', async () => {
  const response = await ts.request().get('/style.css').expect(200)
  expect(response.type).toBe('text/css')
  expect(response.text.indexOf('#f4f5f7')).toBeGreaterThanOrEqual(0)
  expect(response.text.indexOf('Public Sans')).toBeGreaterThanOrEqual(0)
})

it('GET /app.js serves the webui script', async () => {
  const response = await ts.request().get('/app.js').expect(200)
  expect(response.type).toBe('text/javascript')
  expect(response.text.indexOf('webuiFixture')).toBeGreaterThanOrEqual(0)
})

it('GET /lang/en.js serves a language file', async () => {
  const response = await ts.request().get('/lang/en.js').expect(200)
  expect(response.type).toBe('text/javascript')
  expect(response.text).toContain('Web Configurator')
})

it('GET /lang/de.js serves another language file', async () => {
  const response = await ts.request().get('/lang/de.js').expect(200)
  expect(response.type).toBe('text/javascript')
  expect(response.text).toContain('Web-Konfigurator')
})

it('path traversal outside the webui dir is refused (strict isolated handler)', async () => {
  const webuiStatics = new WebuiStatics(join('tests/server/config-dir', 'angular'))
  const app = express()
  // strictMount: 404 for missing/outside files (no fallthrough) — used by the
  // old /webui behaviour; the root mount uses middleware() which falls through.
  app.use('/webui', webuiStatics.strictMiddleware())
  app.use((_req, res) => res.status(404).send('no fallthrough'))
  const server = createServer(app)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  const raw = (path: string) =>
    new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = httpRequest({ host: '127.0.0.1', port, path, method: 'GET' }, (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (c: string) => (body += c))
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
      })
      req.on('error', reject)
      req.end()
    })
  try {
    const res = await raw('/webui/../index.html')
    expect(res.status).toBe(404)
    expect(res.body).toContain('Not Found')
    const ok = await raw('/webui/style.css')
    expect(ok.status).toBe(200)
    expect(ok.body.indexOf('#f4f5f7')).toBeGreaterThanOrEqual(0)
  } finally {
    server.close()
  }
})
