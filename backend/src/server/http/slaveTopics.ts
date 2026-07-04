import { RequestHandler } from 'express'
import { HttpErrorsEnum } from '../../shared/specification/index.js'
import { MqttSubscriptions } from '../mqttsubscriptions.js'
import { sendResult } from './sendResult.js'

/**
 * Exposes the slaves' MQTT topics over HTTP:
 *   GET  <basetopic>/state/          returns the current state payload
 *   GET  <basetopic>/set/...<value>  sends an entity command
 *   POST <basetopic>/set/...         sends a command with the request body as payload
 * Everything else falls through to the next handler.
 */
export function createSlaveTopicsMiddleware(): RequestHandler {
  return (req, res, next) => {
    const msub = MqttSubscriptions.getInstance()
    const url = req.url.substring(1)
    const slave = msub.getSlave(url)
    if (slave) {
      if (req.method == 'GET' && url.endsWith('/state/')) {
        MqttSubscriptions.readModbus(slave)?.subscribe((spec) => {
          const payload = slave.getStatePayload(spec.entities)
          sendResult(req, res, HttpErrorsEnum.OK, payload)
          return
        })
      } else if (req.method == 'GET' && (url.indexOf('/set/') != -1 || url.indexOf('/set/modbus/') != -1)) {
        let idx = url.indexOf('/set/')
        let postLength = 5
        if (idx == -1) {
          idx = url.indexOf('/set/modbus/')
          postLength = 11
        }
        if (idx == -1) return next() //should not happen
        msub
          .sendEntityCommandWithPublish(slave, url, url.substring(idx + postLength))
          .then(() => {
            sendResult(req, res, HttpErrorsEnum.OK, JSON.stringify({ result: 'OK' }))
          })
          .catch((e) => {
            sendResult(req, res, HttpErrorsEnum.ErrBadRequest, JSON.stringify({ result: e.message }))
          })
      } else if (req.method == 'POST' && url.indexOf('/set/') != -1) {
        msub
          .sendCommand(slave, JSON.stringify(req.body))
          .then(() => {
            sendResult(req, res, HttpErrorsEnum.OK, JSON.stringify({ result: 'OK' }))
          })
          .catch((e) => {
            sendResult(req, res, HttpErrorsEnum.ErrBadRequest, JSON.stringify({ result: e.message }))
          })
      } else return next()
    } else return next()
  }
}
