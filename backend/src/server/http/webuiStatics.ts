import { Request, RequestHandler, Response } from 'express'
import { join, basename } from 'path'
import * as fs from 'fs'
/**
 * Serves the static Modbus2MQTT webui (the HA_enoceanmqtt-style configurator).
 *
 * The webui is a flat directory of html/css/js/lang files that lives in the
 * Angular asset output (dist/frontend/browser/<lang>/assets/webui/). It is
 * mounted at /webui and mirrors the look & behaviour of HA_enoceanmqtt's webui.
 * The index.html uses only relative asset paths, so it works both directly
 * and behind a Home Assistant ingress proxy (which maps /ingress/ -> /).
 */
export class WebuiStatics {
  private webuidir: string = ''
  private ingressUrl: string = '/'

  constructor(angulardir: string) {
    // Resolve the language build directory the same way the (removed) Angular statics did:
    // the angular output is dist/frontend/browser/<lang>/… and the webui is
    // shipped inside that dir's assets folder (src/assets/webui).
    const langDir = this.resolveLangDir(angulardir)
    this.webuidir = langDir ? join(langDir, 'assets', 'webui') : join(angulardir, 'assets', 'webui')
  }

  private resolveLangDir(angulardir: string): string | null {
    if (!fs.existsSync(angulardir)) return null
    const entries = fs.readdirSync(angulardir)
    for (const entry of entries) {
      const full = join(angulardir, entry)
      if (entry.indexOf('-') >= 0 && fs.statSync(full).isDirectory()) return full
    }
    return null
  }

  setIngressUrl(url: string): void {
    this.ingressUrl = url
  }

  getDir(): string {
    return this.webuidir
  }

  sendIndexFile(req: Request, res: Response): void {
    const file = join(this.webuidir, 'index.html')
    if (!fs.existsSync(file)) {
      res.status(404).setHeader('Content-Type', 'text/html').send('webui index.html not found')
      return
    }
    // The webui uses relative asset paths only, so no base href rewrite is
    // needed for ingress: /ingress/webui/… resolves style.css relative to /ingress/webui/.
    const content = fs.readFileSync(file)
    res.status(200).setHeader('Content-Type', 'text/html').setHeader('Content-Length', content.byteLength)
    res.send(content)
  }

  private processStaticWebuiFiles(req: Request, res: Response, next?: () => void): void {
    try {
      // Resolve the request inside the webui dir and refuse path traversal.
      const webuiRoot = join(this.webuidir)
      const file = join(webuiRoot, req.url.replace(/^\/+/, ''))
      if (file !== webuiRoot && !file.startsWith(webuiRoot + '/')) {
        if (next) return next()
        res.status(404).send('Not Found')
        return
      }
      if (fs.existsSync(file) && !fs.lstatSync(file).isDirectory()) {
        if (req.url.endsWith('index.html') || req.url === '/') {
          this.sendIndexFile(req, res)
          return
        } else {
          res.removeHeader('Content-Type')
          res.contentType(basename(req.url))
          const content = fs.readFileSync(file)
          res.setHeader('Content-Length', content.byteLength)
          res.status(200)
          res.send(content)
          return
        }
      }
      // Missing webui asset: fall through if we have a next (so the SPA can
      // handle unknown unified paths), else 404 (isolated mounts/tests).
      if (next) return next()
      res.status(404).send('Not Found')
      return
    } catch {
      if (next) return next()
      res.status(404).send('Not Found')
      return
    }
  }

  middleware(): RequestHandler {
    return (req: Request, res: Response, next: () => void) => {
      // Serve webui files (index/style/app/lang/...). Anything else falls
      // through so the Angular SPA / old-ui / API routes keep their behaviour.
      this.processStaticWebuiFiles(req, res, next)
    }
  }

  /** Strict variant: 404 for missing/outside files (no fallthrough). Used by
   *  the isolated /webui mount and tests; the root mount uses middleware(). */
  strictMiddleware(): RequestHandler {
    return (req: Request, res: Response) => {
      this.processStaticWebuiFiles(req, res)
    }
  }
}
