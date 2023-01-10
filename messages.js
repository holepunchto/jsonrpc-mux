'use strict'
const cenc = require('compact-encoding')

module.exports = {
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
      const result = cenc.json.decode(state)
      return { id, result }
    }
  },
  error: {
    preencode (state, { id, message, code }) {
      cenc.uint.preencode(state, id)
      cenc.string.preencode(state, message)
      cenc.string.preencode(state, code)
    },
    encode (state, { id, message, code }) {
      cenc.uint.encode(state, id)
      cenc.string.encode(state, message)
      cenc.string.encode(state, code)
    },
    decode (state) {
      const id = cenc.uint.decode(state)
      const message = cenc.string.decode(state)
      const code = cenc.string.decode(state)
      return { id, error: { message, code } }
    }
  }
}
