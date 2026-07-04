import { NextFunction, Request, RequestHandler, Response } from 'express'
import { join, basename } from 'path'
import { parse } from 'node-html-parser'
import * as fs from 'fs'
import { LogLevelEnum, Logger } from '../../specification/index.js'

const log = new Logger('HttpServerBase')

/**
 * Serves the language specific Angular build output.
 * All angular files live in language directories (e.g. /en-US/index.html).
 * index.html gets its <base href> rewritten to the Home Assistant ingress path.
 */
export class AngularStatics {
  private statics = new Map<string, string>()
  languages = ['en']
  private ingressUrl: string = '/'

  constructor(private angulardir: string) {}

  setIngressUrl(url: string): void {
    this.ingressUrl = url
  }

  init(): void {
    fs.readdirSync(this.angulardir).forEach((langDir) => {
      const lang = langDir.replace(/-.*/g, '')
      const dir = langDir
      this.statics.set(lang, dir)
    })
    if (this.statics.size > 0) this.languages = Array.from(this.statics.keys())
  }

  private getDirectoryForLanguage(req: Request): string {
    let lang = req.acceptsLanguages(['en'])
    if (!lang) lang = 'en'
    return this.statics.get(lang)!
  }

  private compareIngressUrl(req: Request): void {
    const h = req.header('X-Ingress-Path')
    if (h && h != this.ingressUrl) {
      log.log(LogLevelEnum.error, 'Invalid X-Ingress-Path in header expected: ' + this.ingressUrl + 'got: ' + h)
    }
  }

  sendIndexFile(req: Request, res: Response): void {
    this.compareIngressUrl(req)
    if (req.url.endsWith('.js')) {
      log.log(LogLevelEnum.info, 'sendIndexfile is serving js file directly: ' + req.url)
    }
    const dir = this.getDirectoryForLanguage(req)
    const file = join(this.angulardir, dir, 'index.html')
    let content = fs.readFileSync(file).toString()
    const htmlDom = parse(content.toString())
    if (this.ingressUrl && content && htmlDom) {
      const base = htmlDom.querySelector('base')
      base?.setAttribute('href', join('/', this.ingressUrl, '/'))
      content = htmlDom.toString()
      res.status(200).setHeader('Content-Type', 'text/html').send(htmlDom.toString())
    } else res.status(401).setHeader('Content-Type', 'text/html').send('Invalid index.html file ')
  }

  /*
   * This method checks if the url is available in a language dependant angular directory
   * E.g. "/en-US/index.html". In this case it returns the files
   * If it's the index file, the base href will be replaced
   */
  private processStaticAngularFiles(req: Request, res: Response, next: NextFunction): void {
    try {
      const dir = this.getDirectoryForLanguage(req)
      if (dir) {
        res.removeHeader('Content-Type')
        const file = join(this.angulardir, dir, req.url)
        if (fs.existsSync(file) && !fs.lstatSync(file).isDirectory()) {
          if (req.url.indexOf('index.html') >= 0) {
            this.sendIndexFile(req, res)
            return
          } else {
            res.contentType(basename(req.url))
            const content = fs.readFileSync(file)
            log.log(LogLevelEnum.info, 'url' + req.url + ' ct:' + res.getHeader('Content-Type'))
            res.setHeader('Content-Length', content.byteLength)
            res.status(200)
            res.send(content)
            return
          }
        }
      }
      next()
      return
    } catch {
      res.status(401).setHeader('Content-Type', 'text/html').send('No or invalid index.html file ')
    }
  }

  middleware(): RequestHandler {
    return this.processStaticAngularFiles.bind(this)
  }
}
