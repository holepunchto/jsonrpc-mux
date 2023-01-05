'use strict'
const cenc = require('compact-encoding')

module.exports = class JSONRPCMux {
  codecs = {
    request: {
      preencode (state, { rid, id, params, method }) {
        cenc.uint.preencode(state, rid)
        cenc.uint.preencode(state, id)
        cenc.string.preencode(state, method)
        cenc.json.preencode(state, params)
      },
      encode (state, { rid, id, params, method }) {
        cenc.uint.encode(state, rid)
        cenc.uint.encode(state, id)
        cenc.string.encode(state, method)
        cenc.json.encode(state, params)
      },
      decode (state) {
        return {
          rid: cenc.uint.decode(state),
          id: cenc.uint.decode(state),
          method: cenc.string.decode(state),
          params: cenc.json.decode(state)
        }
      }
    },
    response: {
      preencode (state, { id, payload }) {
        cenc.uint.preencode(state, id)
        cenc.json.preencode(state, payload)
      },
      encode (state, { id, payload }) {
        cenc.uint.encode(state, id)
        cenc.json.encode(state, payload)
      },
      decode (state) {
        const id = cenc.uint.decode(state)
        const payload = cenc.json.decode(state)
        return { id, ...payload }
      }
    }
  }

  constructor (protomux) {
    this.protomux = protomux
  }

  channel () { return new Channel(this) }
}

class Channel {
  constructor (muxer) {
    this.muxer = muxer
    this._muxchan = muxer.protomux.createChannel({
      protocol: 'jsonrpc-2.0',
      onclose: () => this.destroy()
    })
    this._pending = new Freelist()
    this._handlers = {}
    this._req = this._muxchan.addMessage({
      encoding: this.muxer.codecs.request,
      onmessage: (msg) => {
        const handler = this._handlers[msg.method]
        if (handler) handler(msg)
      }
    })
    this._res = this._muxchan.addMessage({
      encoding: this.muxer.codecs.response,
      onmessage: (msg) => {
        const tx = this._pending.from(msg.id)
        if (tx === null) return
        if (msg.error) return tx.reject(new RemoteError(msg.error))
        tx.resolve(msg.result)
      }
    })
    this._muxchan.open()
  }

  destroy () {
    this._pending.clear()
    return this._muxchan.close()
  }

  async request (method, params, { signal } = {}) {
    const tx = new Tx(signal)
    const id = this._pending.alloc(tx)
    this._req.send({ id, method, params })
    try {
      return await tx
    } finally {
      this._pending.free(id)
    }
  }

  notify (method, params) {
    this._req.send({ method, params })
  }

  method (name, responder, { signal } = {}) {
    this._handlers[name] = ({ id, params }) => {
      const reply = id
        ? (payload) => this._res.send({
            id,
            payload: payload instanceof Error
              ? { error: { message: payload.message, code: payload.code } }
              : { result: payload }
          })
        : null
      responder(params, reply)
    }
    if (signal) signal.addEventListener('abort', () => { this._handlers[name] = null })
  }
}

class Tx extends Promise {
  static get [Symbol.species] () { return Promise }
  constructor (signal = null) {
    let completers = null
    super((resolve, reject) => { completers = [resolve, reject] })
    const [resolve, reject] = completers
    this.reject = reject
    this.resolve = resolve
    this.signal = signal
    if (signal === null) return this
    if (signal.aborted) {
      this.reject(signal.reason)
      return this
    }
    const abortListener = () => this.reject(signal.reason)
    this.resolve = (...args) => { try { resolve(...args) } finally { signal.removeEventListener('aborted', abortListener) } }
    signal.addEventListener('aborted', abortListener, { once: true })
  }
}

class Freelist {
  alloced = []
  freed = []
  alloc (item) {
    const id = this.freed.length === 0 ? this.alloced.push(null) - 1 : this.freed.pop()
    this.alloced[id] = item
    return id + 1
  }

  free (id) {
    id--
    this.freed.push(id)
    this.alloced[id] = null
  }

  from (id) {
    id--
    return id < this.alloced.length ? this.alloced[id] : null
  }

  emptied () {
    return this.freed.length === this.alloced.length
  }

  clear () {
    this.alloced.length = 0
    this.freed.length = 0
  }
}

class RemoteError extends Error {
  code = 'E_MUX_REMOTE'
  remote = null
  constructor (error) {
    super(`[${error.code ? error.code : 'E_UKNOWN'}] ${error.message}`)
    this.remote = error
  }
}
