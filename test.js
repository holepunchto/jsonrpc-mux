'use strict'
const JSONRPCMux = require('.')
const test = require('brittle')
const Protomux = require('protomux')
const SecretStream = require('@hyperswarm/secret-stream')

test('notify', async ({ plan, alike, is }) => {
  plan(2)

  const a = new JSONRPCMux(new Protomux(new SecretStream(true)))
  const b = new JSONRPCMux(new Protomux(new SecretStream(false)))

  const achannel = a.channel()
  const bchannel = b.channel()

  replicate(a, b)

  const expectedParams = { a: 1, b: 2 }
  achannel.method('test', (params, reply) => {
    alike(params, expectedParams)
    is(reply, null)
  })

  bchannel.notify('test', expectedParams)
})

test('request-response (reply)', async ({ alike }) => {
  const a = new JSONRPCMux(new Protomux(new SecretStream(true)))
  const b = new JSONRPCMux(new Protomux(new SecretStream(false)))

  const achannel = a.channel()
  const bchannel = b.channel()

  replicate(a, b)

  const expectedParams = { a: 1, b: 2 }
  achannel.method('test', (params, reply) => {
    alike(params, expectedParams)
    reply({ a: 'response', echo: params })
  })

  const request = bchannel.request('test', expectedParams)

  alike(await request, { a: 'response', echo: expectedParams })
})

test('request-response (return)', async ({ alike }) => {
  const a = new JSONRPCMux(new Protomux(new SecretStream(true)))
  const b = new JSONRPCMux(new Protomux(new SecretStream(false)))

  const achannel = a.channel()
  const bchannel = b.channel()

  replicate(a, b)

  const expectedParams = { a: 1, b: 2 }
  achannel.method('test', (params) => {
    alike(params, expectedParams)
    return { a: 'response', echo: params }
  })

  const request = bchannel.request('test', expectedParams)

  alike(await request, { a: 'response', echo: expectedParams })
})

test('request-error (reply)', async ({ alike, exception }) => {
  const a = new JSONRPCMux(new Protomux(new SecretStream(true)))
  const b = new JSONRPCMux(new Protomux(new SecretStream(false)))

  const achannel = a.channel()
  const bchannel = b.channel()

  replicate(a, b)

  const expectedParams = { a: 1, b: 2 }
  achannel.method('test', (params, reply) => {
    alike(params, expectedParams)
    const err = new Error('problem')
    err.code = 'E_TEST'
    reply(err)
  })

  const request = bchannel.request('test', expectedParams)

  await exception(request, /\[E_TEST\] problem/)
})

test('request-error (throw)', async ({ alike, exception }) => {
  const a = new JSONRPCMux(new Protomux(new SecretStream(true)))
  const b = new JSONRPCMux(new Protomux(new SecretStream(false)))

  const achannel = a.channel()
  const bchannel = b.channel()

  replicate(a, b)

  const expectedParams = { a: 1, b: 2 }
  achannel.method('test', (params) => {
    alike(params, expectedParams)
    const err = new Error('problem')
    err.code = 'E_TEST'
    throw err
  })

  const request = bchannel.request('test', expectedParams)

  await exception(request, /\[E_TEST\] problem/)
})

test('request-error (throw non-error)', async ({ alike, exception }) => {
  const a = new JSONRPCMux(new Protomux(new SecretStream(true)))
  const b = new JSONRPCMux(new Protomux(new SecretStream(false)))

  const achannel = a.channel()
  const bchannel = b.channel()

  replicate(a, b)

  const expectedParams = { a: 1, b: 2 }
  achannel.method('test', (params) => {
    alike(params, expectedParams)
    throw { message: 'problem', code: 'E_TEST' } // eslint-disable-line
  })

  const request = bchannel.request('test', expectedParams)

  await exception(request, /problem/)
})

test('request-error (return)', async ({ alike, exception }) => {
  const a = new JSONRPCMux(new Protomux(new SecretStream(true)))
  const b = new JSONRPCMux(new Protomux(new SecretStream(false)))

  const achannel = a.channel()
  const bchannel = b.channel()

  replicate(a, b)

  const expectedParams = { a: 1, b: 2 }
  achannel.method('test', (params) => {
    alike(params, expectedParams)
    const err = new Error('problem')
    err.code = 'E_TEST'
    return err
  })

  const request = bchannel.request('test', expectedParams)

  await exception(request, /\[E_TEST\] problem/)
})

test('multiple methods, multiple requests', async ({ is }) => {
  const a = new JSONRPCMux(new Protomux(new SecretStream(true)))
  const b = new JSONRPCMux(new Protomux(new SecretStream(false)))

  const achannel = a.channel()
  const bchannel = b.channel()

  achannel.name = 'a'
  bchannel.name = 'b'

  replicate(a, b)

  achannel.method('test', (params, reply) => reply(params.n + params.n))
  achannel.method('test2', (params, reply) => reply(params.n ** params.n))

  const request = bchannel.request('test', { n: 1 })
  const request2 = bchannel.request('test2', { n: 2 })
  const request3 = bchannel.request('test', { n: 3 })
  const request4 = bchannel.request('test2', { n: 4 })

  is(await request, 2)
  is(await request2, 4)
  is(await request3, 6)
  is(await request4, 256)
})

test('abort request', async ({ alike, exception }) => {
  const a = new JSONRPCMux(new Protomux(new SecretStream(true)))
  const b = new JSONRPCMux(new Protomux(new SecretStream(false)))

  const achannel = a.channel()
  const bchannel = b.channel()

  replicate(a, b)

  const expectedParams = { a: 1, b: 2 }
  achannel.method('test', (params, reply) => {
    alike(params, expectedParams)
  })
  const ac = new AbortController()
  const request = bchannel.request('test', expectedParams, ac)
  setTimeout(() => {
    ac.abort(new Error('abort test'))
  }, 100)
  await exception(request, /abort test/)
})

test('request invalid method', async ({ exception }) => {
  const a = new JSONRPCMux(new Protomux(new SecretStream(true)))
  const b = new JSONRPCMux(new Protomux(new SecretStream(false)))

  const bchannel = b.channel()

  replicate(a, b)

  const expectedParams = { a: 1, b: 2 }

  const request = bchannel.request('test', expectedParams)

  await exception(request, /request timed-out/)
})

test('request timeout option', async ({ is, exception }) => {
  const a = new JSONRPCMux(new Protomux(new SecretStream(true)))
  const b = new JSONRPCMux(new Protomux(new SecretStream(false)))

  const bchannel = b.channel()

  replicate(a, b)

  const expectedParams = { a: 1, b: 2 }

  const request = bchannel.request('test', expectedParams, { timeout: 200 })
  const before = Date.now()
  await exception(request, /request timed-out/)
  const after = Date.now()
  is(Math.round((after - before) / 100) * 100, 200)
})

test('abort method', async ({ alike, exception }) => {
  const a = new JSONRPCMux(new Protomux(new SecretStream(true)))
  const b = new JSONRPCMux(new Protomux(new SecretStream(false)))

  const achannel = a.channel()
  const bchannel = b.channel()

  replicate(a, b)

  const expectedParams = { a: 1, b: 2 }
  const registration = new AbortController()
  achannel.method('test', (params, reply) => {
    alike(params, expectedParams)
    reply({ a: 'response', echo: params })
  }, registration)

  const request = bchannel.request('test', expectedParams)

  alike(await request, { a: 'response', echo: expectedParams })

  registration.abort() // method unlisten

  await exception(bchannel.request('test', expectedParams), /request timed-out/)
})

test('notify invalid method', async ({ execution }) => {
  const a = new JSONRPCMux(new Protomux(new SecretStream(true)))
  const b = new JSONRPCMux(new Protomux(new SecretStream(false)))

  const bchannel = b.channel()

  replicate(a, b)

  const expectedParams = { a: 1, b: 2 }

  await execution(() => bchannel.notify('test', expectedParams))
})

function replicate (a, b) {
  a.protomux.stream.rawStream.pipe(b.protomux.stream.rawStream).pipe(a.protomux.stream.rawStream)
}
