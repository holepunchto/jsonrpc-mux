'use strict'
const Protomux = require('protomux')
const cenc = require('compact-encoding')

module.exports = class Mjr {
  codecs = {
    request: {
      preencode (state, { id, params, method }) {
        cenc.string.preencode(state, '2.0')
        cenc.uint.preencode(state, id)
        cenc.string.preencode(state, method)
        cenc.json.preencode(state, params)
      },
      encode (state, { id, params, method }) {
        cenc.string.encode(state, '2.0')
        cenc.uint.encode(state, id)
        cenc.string.encode(state, method)
        cenc.json.encode(state, params)
      },
      decode (state) {
        return {
          jsonrpc: cenc.string.decode(state),
          id: cenc.uint.decode(state),
          method: cenc.string.decode(state),
          params: cenc.json.decode(state)
        }
      }
    },
    response: {
      preencode (state, { id, payload }) {
        cenc.string.preencode(state, '2.0')
        cenc.uint.preencode(state, id)
        cenc.json.preencode(state, payload)
      },
      encode (state, { id, payload }) {
        cenc.string.encode(state, '2.0')
        cenc.uint.encode(state, id)
        cenc.json.encode(state, payload)
      },
      decode (state) {
        const jsonrpc = cenc.string.decode(state)
        const id = cenc.uint.decode(state)
        const payload = cenc.json.decode(state)
        return { jsonrpc, id, ...payload }
      }
    }
  }

  constructor (stream) {
    this.protomux = Protomux.from(stream)
  }

  channel (opts) { return new Channel(opts, this) }

  * [Symbol.iterator] () { yield * this.protomux }

  cork () { return this.protomux.cork() }

  uncork () { return this.protomux.uncork() }
}

class Channel {
  opening = null
  closing = null
  constructor (opts = {}, muxer) {
    this._muxchan = muxer.protomux.createChannel({
      ...opts,
      protocol: 'jsonrpc-2.0',
      onopen: () => this._onopen(),
      onclose: () => this._onclose && this._onclose(),
      ondestroy: () => this._ondestroy && this._ondestroy()
    })
    this.muxer = muxer
  }

  open (handshake) {
    if (this.opening) return this.opening
    this.opening = new Promise((resolve, reject) => {
      this._onopen = () => {
        resolve()
        delete this._ondestroy
      }
      this._ondestroy = (err = new Error('Destroyed')) => reject(err)
    })
    this._muxchan.open(handshake)
    return this.opening.then(() => { this.closing = null })
  }

  close () {
    if (this.closing) return this.closing
    this.closing = new Promise((resolve, reject) => {
      this._onclose = () => {
        resolve()
        delete this._ondestroy
      }
      this._ondestroy = (err = new Error('Destroyed')) => reject(err)
    })
    this._muxchan.close()
    return this.closing.then(() => { this.opening = null })
  }

  async request (method, params, { signal } = {}) {
    await this.open()
    const req = this._muxchan.addMessage({ encoding: this.muxer.codecs.request })
    const res = this._muxchan.addMessage({ encoding: this.muxer.codecs.response })
    const id = this._muxchan._localId

    const messaging = new Promise((resolve, reject) => {
      if (signal) {
        if (signal.aborted) return reject(signal.reason)
        signal.addEventListener('aborted', () => reject(signal.reason), { once: true })
      }
      res.onmessage = (msg) => {
        if (msg.id !== id) return
        if (msg.error) {
          const err = new RemoteError(`[${msg.error.code ? msg.error.code : 'E_UKNOWN'}] ${msg.error.message}`)
          err.remote = msg.error
          reject(err)
          return
        }
        resolve(msg.result)
      }
    })
    req.send({
      id,
      method,
      params
    })
    return messaging
  }

  async * method (name, { signal, throwAbort = false } = {}) {
    const req = this._muxchan.addMessage({ encoding: this.muxer.codecs.request })
    const res = this._muxchan.addMessage({ encoding: this.muxer.codecs.response })
    const id = this._muxchan._localId
    const reply = (payload) => res.send({
      id,
      payload: payload instanceof Error
        ? { error: { message: payload.message, code: payload.code } }
        : { result: payload }
    })
    try {
      do {
        if (this.closed) break
        if (signal?.aborted) throw signal.reason
        const message = await new Promise((resolve, reject) => {
          if (signal) {
            if (signal.aborted) return reject(signal.reason)
            signal.addEventListener('aborted', () => reject(signal.reason), { once: true })
          }
          req.onmessage = resolve
        })
        if (message?.method !== name) continue
        if (message?.id !== id) continue
        yield { params: message.params, reply }
      } while (true)
    } catch (err) {
      if (throwAbort && err === signal.reason) return
      throw err
    }
  }

  cork () {
    return this._muxchan.cork()
  }

  uncork () {
    return this._muxchan.uncork()
  }
}

class RemoteError extends Error {
  code = 'E_MJR_REMOTE'
  remote = null
}
