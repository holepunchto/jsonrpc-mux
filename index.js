'use strict'
const messages = require('./messages')

module.exports = class JSONRPCMuxChannel {
  codecs = messages

  constructor (protomux, id = null, userData = null) {
    this.protomux = protomux
    this.id = id
    this.userData = userData
    this._muxchan = protomux.createChannel({
      protocol: 'jsonrpc-2.0',
      onclose: (remote) => this.close(remote)
    })
    this._pending = new Freelist()
    this._handlers = {}
    this._req = this._muxchan.addMessage({
      encoding: this.codecs.request,
      onmessage: (msg) => {
        const handler = this._handlers[msg.method]
        if (handler) handler(msg)
      }
    })
    this._res = this._muxchan.addMessage({
      encoding: this.codecs.response,
      onmessage: (msg) => {
        const tx = this._pending.from(msg.id)
        if (tx === null) return
        tx.resolve(msg.result)
      }
    })
    this._err = this._muxchan.addMessage({
      encoding: this.codecs.error,
      onmessage: (msg) => {
        const tx = this._pending.from(msg.id)
        if (tx === null) return
        return tx.reject(new RemoteError(msg.error))
      }
    })
    this._muxchan.open()
  }

  get socket () {
    return this.protomux.stream.rawStream
  }

  close (remote = false) {
    const closed = remote ? new Error('JSONRPC-MUX: channel remotely closed') : new Error('JSONRPC-MUX: message transaction halted channel closed')
    this._muxchan.close()
    for (const tx of this._pending.alloced) tx?.reject(closed)
    this._pending.clear()
  }

  async request (method, params = {}, { timeout = 0, signal } = {}) {
    const ac = timeout ? new AbortController() : null
    const tx = timeout ? new Tx(ac.signal, signal) : new Tx(signal)
    const id = this._pending.alloc(tx)
    if (this._req.send({ id, method, params }) === false) {
      const err = new Error('unable to make request - session closed')
      if (ac === null) throw err
      try { ac.signal.reason = err } catch {} // electron compat, but throws in other versions
      ac.abort(err)
    }
    const tm = timeout && setTimeout(() => {
      const err = new Error(method + ' request timed-out out after ' + timeout + 'ms')
      Object.assign(err, params)
      try { ac.signal.reason = err } catch {} // electron compat, but throws in other versions
      ac.abort(err)
    }, timeout)

    try {
      return await tx
    } finally {
      clearTimeout(tm)
      this._pending.free(id)
    }
  }

  notify (method, params = {}) {
    this._req.send({ method, params })
  }

  method (name, responder) {
    if (responder === null) {
      this._handlers[name] = null
      return
    }
    this._handlers[name] = ({ id, params }) => {
      const reply = id
        ? (payload, isError = payload instanceof Error) => isError
            ? this._err.send({ id, message: payload.message, code: payload.code })
            : this._res.send({ id, payload })
        : null

      if (responder.length === 2 || reply === null) responder(params, reply)
      else if (responder.length < 2) this.#methodize(responder, params, reply, name)
    }
  }

  async #methodize (responder, params, reply, name) {
    try {
      const payload = await responder(params)
      reply(payload)
    } catch (err) {
      reply(err, true)
    }
  }
}

class Tx extends Promise {
  static get [Symbol.species] () { return Promise }
  constructor (...signals) {
    let completers = null
    super((resolve, reject) => { completers = [resolve, reject] })
    const [resolve, reject] = completers
    this.reject = reject
    this.resolve = resolve
    if (signals.length === 0) return this
    const abortListener = (evt) => {
      this.reject(evt.target.reason || new Error('Tx aborted. Unknown reason'))
    }
    for (const signal of signals) {
      if (signal instanceof AbortSignal === false) continue
      if (signal.aborted) {
        this.reject(signal.reason || new Error('Tx aborted. Unknown reason'))
        return this
      }
      signal.addEventListener('abort', abortListener, { once: true })
    }

    this.resolve = (...args) => {
      for (const signal of signals) {
        if (signal instanceof AbortSignal === false) continue
        signal.removeEventListener('abort', abortListener)
      }
      return resolve(...args)
    }
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
