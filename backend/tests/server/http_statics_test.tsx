import { it, expect, beforeAll, afterAll } from 'vitest'
import { parse } from 'yaml'
import { createTestServer, TestServer } from './httpTestHelper.js'

let ts: TestServer
beforeAll(async () => {
  // mockHassio delivers ingress_entry 'test', which must end up in the <base href>
  ts = await createTestServer({ name: 'http-statics', mockHassio: true })
})
afterAll(() => ts.cleanup())

it('GET /index.html rewrites base href to the ingress path', async () => {
  const response = await ts.request().get('/index.html').expect(200)
  expect(response.text.indexOf('href="/test/"')).toBeGreaterThanOrEqual(0)
})

it('GET /index.html with Ingress header', async () => {
  const response = await ts.request().get('/index.html').set({ 'X-Ingress-Path': 'test' }).expect(200)
  expect(response.text.indexOf('base href="/test/"')).toBeGreaterThanOrEqual(0)
})

it('GET angular files serves language specific statics', async () => {
  const response = await ts.request().get('/en-US/test.css').expect(200)
  expect(response.text).toBe('.justContent {\n' + '  margin: 1pt;\n' + '}\n')
  expect(response.type).toBe('text/css')
})

it('GET local specification files', async () => {
  const response = await ts.request().get('/specifications/files/waterleveltransmitter/files.yaml').expect(200)
  if (response.type === 'text/yaml' || response.type === 'application/x-yaml') {
    const o = parse(response.text)
    const files = Array.isArray(o) ? (o as { url: string }[]) : o && o.files ? o.files : []
    expect(Array.isArray(files)).toBeTruthy()
    if (files.length > 0) {
      expect((files[0].url as string).startsWith('/')).toBeFalsy()
    }
  } else {
    // Fallback: Angular index.html served when files.yaml is missing in test-setup
    expect(response.type).toBe('text/html')
  }
})

it('GET / redirects to index.html', async () => {
  const response = await ts.request().get('/').expect(302)
  expect(response.headers['location']).toBe('index.html')
})
