'use strict'
const messages = require('./messages')
const noop = Function.prototype
module.exports = class JSONRPCMuxChannel {
  codecs = messages

  constructor (protomux, id = null, userData = null, { onclose = noop } = {}) {
    this.protomux = protomux
    this.id = id
    this.userData = userData
    this.open = false
    this._muxchan = protomux.createChannel({
      protocol: 'jsonrpc-2.0',
      onclose: async (remote) => {
        await this.close(remote)
        await onclose(remote, this)
      },
      onopen: () => { this.open = true }
    })
    if (this._muxchan === null) return // resource closed

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
        return tx.reject(new JSONRPCMuxError(msg.error, 'E_MUX_REMOTE'))
      }
    })
    this._muxchan.open()
  }

  get socket () {
    return this.protomux.stream.rawStream
  }

  close (remote = false) {
    this._muxchan.close()
    for (const tx of this._pending.alloced) {
      if (!tx) continue
      if (tx.errorlessClose || this.open === false) {
        tx.resolve()
      } else {
        const err = remote
          ? new JSONRPCMuxError(Object.assign(new Error('JSONRPC-MUX: channel remotely closed'), { code: 'E_REMOTE_CLOSED' }), 'E_MUX_REMOTE')
          : new JSONRPCMuxError({ message: 'JSONRPC-MUX: message transaction halted channel closed' }, 'E_HALTED')
        tx?.reject(err)
      }
    }
    this._pending.clear()
    this.open = false
  }

  request (method, params = {}, { timeout = 0, signal, errorlessClose = false } = {}) {
    const ac = timeout ? new AbortController() : null
    const tx = timeout ? transaction({ errorlessClose }, ac.signal, signal) : transaction({ errorlessClose }, signal)
    const id = this._pending.alloc(tx)
    if (this._req.send({ id, method, params }) === false) {
      const err = new JSONRPCMuxError({ message: 'unable to make request - session closed', code: 'E_SESSION_CLOSED' })
      if (ac === null) throw err
      try { ac.signal.reason = err } catch {} // electron compat, but throws in other versions
      ac.abort(err)
    }
    const tm = timeout && setTimeout(() => {
      const err = new JSONRPCMuxError({ message: method + ' request timed-out after ' + timeout + 'ms', code: 'E_TIMEOUT', params })
      try { ac.signal.reason = err } catch {} // electron compat, but throws in other versions
      ac.abort(err)
    }, timeout)

    return tx.finally(() => {
      clearTimeout(tm)
      this._pending.free(id)
    })
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
        ? (payload, isError = payload instanceof Error) => {
            return isError
              ? this._err.send({ id, message: payload.message, code: payload.code })
              : this._res.send({ id, payload })
          }
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

function transaction ({ errorlessClose = false }, ...signals) {
  signals = signals.filter(Boolean)
  const completers = {}
  const tx = new Promise((resolve, reject) => {
    completers.resolve = resolve
    completers.reject = reject
  })
  const { resolve, reject } = completers
  tx.errorlessClose = errorlessClose
  tx.resolve = resolve
  tx.reject = reject
  if (signals.length === 0) return tx
  const abortListener = (evt) => {
    reject(evt.target.reason || new JSONRPCMuxError({ message: 'Tx aborted. Unknown reason' }))
  }
  for (const signal of signals) {
    if (signal instanceof AbortSignal === false) continue
    if (signal.aborted) {
      queueMicrotask(() => {
        reject(signal.reason || new JSONRPCMuxError({ message: 'Tx aborted. Unknown reason' }))
      })
      return tx
    }
    signal.addEventListener('abort', abortListener, { once: true })
  }
  const release = () => {
    for (const signal of signals) {
      if (signal instanceof AbortSignal === false) continue
      signal.removeEventListener('abort', abortListener)
    }
  }
  tx.resolve = (...args) => {
    release()
    return resolve(...args)
  }
  tx.reject = (...args) => {
    release()
    return reject(...args)
  }
  return tx
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

class JSONRPCMuxError extends Error {
  local = true
  remote = null
  params = null
  code = null
  constructor (error, code = error.code || 'E_UNKNOWN', message = error.message, params = (error.params || null)) {
    super(`[${code}] ${message}`)
    this.code = code
    this.params = params
    if (code === 'E_MUX_REMOTE') {
      this.local = false
      this.remote = error
    }
  }
}
