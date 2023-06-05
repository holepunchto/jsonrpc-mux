'use strict'
const Channel = require('.')
const test = require('brittle')
const Protomux = require('protomux')
const SecretStream = require('@hyperswarm/secret-stream')

test('request-response (reply)', async ({ teardown, alike }) => {
  const a = new Channel(new Protomux(new SecretStream(true)))
  const b = new Channel(new Protomux(new SecretStream(false)))
  teardown(() => { a.close() })

  replicate(a, b)

  const expectedParams = { a: 1, b: 2 }
  a.method('test', (params, reply) => {
    alike(params, expectedParams)
    reply({ a: 'response', echo: params })
  })

  const request = b.request('test', expectedParams)

  alike(await request, { a: 'response', echo: expectedParams })
})

test('request-response (return)', async ({ teardown, alike }) => {
  const a = new Channel(new Protomux(new SecretStream(true)))
  const b = new Channel(new Protomux(new SecretStream(false)))
  teardown(() => { a.close() })

  replicate(a, b)

  const expectedParams = { a: 1, b: 2 }
  a.method('test', (params) => {
    alike(params, expectedParams)
    return { a: 'response', echo: params }
  })

  const request = b.request('test', expectedParams)

  alike(await request, { a: 'response', echo: expectedParams })
})

test('request-error (reply)', async ({ teardown, alike, exception }) => {
  const a = new Channel(new Protomux(new SecretStream(true)))
  const b = new Channel(new Protomux(new SecretStream(false)))
  teardown(() => { a.close() })

  replicate(a, b)

  const expectedParams = { a: 1, b: 2 }
  a.method('test', (params, reply) => {
    alike(params, expectedParams)
    const err = new Error('problem')
    err.code = 'E_TEST'
    reply(err)
  })

  const request = b.request('test', expectedParams)
  await exception(request, /\[E_MUX_REMOTE\] problem/)
  await exception(request, { local: false, remote: { code: 'E_TEST', message: 'problem' } })
})

test('request-error (throw)', async ({ teardown, alike, exception }) => {
  const a = new Channel(new Protomux(new SecretStream(true)))
  const b = new Channel(new Protomux(new SecretStream(false)))
  teardown(() => { a.close() })

  replicate(a, b)

  const expectedParams = { a: 1, b: 2 }
  a.method('test', (params) => {
    alike(params, expectedParams)
    const err = new Error('problem')
    err.code = 'E_TEST'
    throw err
  })

  const request = b.request('test', expectedParams)

  await exception(request, /\[E_MUX_REMOTE\] problem/)
  await exception(request, { local: false, remote: { code: 'E_TEST', message: 'problem' } })
})

test('request-error (throw non-error)', async ({ teardown, alike, exception }) => {
  const a = new Channel(new Protomux(new SecretStream(true)))
  const b = new Channel(new Protomux(new SecretStream(false)))
  teardown(() => { a.close() })

  replicate(a, b)

  const expectedParams = { a: 1, b: 2 }
  a.method('test', (params) => {
    alike(params, expectedParams)
    throw { message: 'problem', code: 'E_TEST' } // eslint-disable-line
  })

  const request = b.request('test', expectedParams)

  await exception(request, /problem/)
})

test('request-error (throw wtihout code)', async ({ teardown, alike, exception }) => {
  const a = new Channel(new Protomux(new SecretStream(true)))
  const b = new Channel(new Protomux(new SecretStream(false)))
  teardown(() => { a.close() })

  replicate(a, b)

  const expectedParams = { a: 1, b: 2 }
  a.method('test', (params) => {
    alike(params, expectedParams)
    throw new Error('problem')
  })

  const request = b.request('test', expectedParams)

  await exception(request, /\[E_MUX_REMOTE\] problem/)
  await exception(request, { local: false, remote: { code: 'E_UNSPECIFIED', message: 'problem' } })
})

test('request-error (return)', async ({ teardown, alike, exception }) => {
  const a = new Channel(new Protomux(new SecretStream(true)))
  const b = new Channel(new Protomux(new SecretStream(false)))
  teardown(() => { a.close() })

  replicate(a, b)

  const expectedParams = { a: 1, b: 2 }
  a.method('test', (params) => {
    alike(params, expectedParams)
    const err = new Error('problem')
    err.code = 'E_TEST'
    return err
  })

  const request = b.request('test', expectedParams)

  await exception(request, /\[E_MUX_REMOTE\] problem/)
  await exception(request, { local: false, remote: { code: 'E_TEST', message: 'problem' } })
})

test('multiple methods, multiple requests', async ({ teardown, is }) => {
  const a = new Channel(new Protomux(new SecretStream(true)))
  const b = new Channel(new Protomux(new SecretStream(false)))
  teardown(() => { a.close() })

  a.name = 'a'
  b.name = 'b'

  replicate(a, b)

  a.method('test', (params, reply) => reply(params.n + params.n))
  a.method('test2', (params, reply) => reply(params.n ** params.n))

  const request = b.request('test', { n: 1 })
  const request2 = b.request('test2', { n: 2 })
  const request3 = b.request('test', { n: 3 })
  const request4 = b.request('test2', { n: 4 })

  is(await request, 2)
  is(await request2, 4)
  is(await request3, 6)
  is(await request4, 256)
})

test('abort request', async ({ teardown, alike, exception }) => {
  const a = new Channel(new Protomux(new SecretStream(true)))
  const b = new Channel(new Protomux(new SecretStream(false)))
  teardown(() => { a.close() })

  replicate(a, b)

  const expectedParams = { a: 1, b: 2 }
  a.method('test', (params, reply) => {
    alike(params, expectedParams)
  })
  const ac = new AbortController()
  const request = b.request('test', expectedParams, ac)
  setTimeout(() => {
    ac.abort(new Error('abort test'))
  }, 100)
  await exception(request, /abort test/)
})

test('request invalid method', async ({ teardown, exception }) => {
  const a = new Channel(new Protomux(new SecretStream(true)))
  const b = new Channel(new Protomux(new SecretStream(false)))
  teardown(() => { a.close() })

  replicate(a, b)

  const expectedParams = { a: 1, b: 2 }

  const request = b.request('test', expectedParams, { timeout: 100 })
  await exception(request, /test request timed-out/)
})

test('delete method', async ({ teardown, alike, exception }) => {
  const a = new Channel(new Protomux(new SecretStream(true)))
  const b = new Channel(new Protomux(new SecretStream(false)))
  teardown(() => { a.close() })

  replicate(a, b)

  const expectedParams = { a: 1, b: 2 }

  a.method('test', (params, reply) => {
    alike(params, expectedParams)
    reply({ a: 'response', echo: params })
  })

  const request = b.request('test', expectedParams)

  alike(await request, { a: 'response', echo: expectedParams })

  a.method('test', null)

  await exception(b.request('test', expectedParams, { timeout: 100 }), /request timed-out/)
})

test('notify invalid method', async ({ teardown, execution }) => {
  const a = new Channel(new Protomux(new SecretStream(true)))
  const b = new Channel(new Protomux(new SecretStream(false)))
  teardown(() => { a.close() })

  replicate(a, b)

  const expectedParams = { a: 1, b: 2 }

  await execution(() => b.notify('test', expectedParams))
})

test('id set', async ({ teardown, is }) => {
  const a = new Channel(new Protomux(new SecretStream(true)), 'AN_ID')
  const b = new Channel(new Protomux(new SecretStream(false)), 'ANOTHER_ID')
  teardown(() => { a.close() })

  is(a.id, 'AN_ID')
  is(b.id, 'ANOTHER_ID')
})

test('userData set', async ({ teardown, alike }) => {
  const a = new Channel(new Protomux(new SecretStream(true)), null, { some: 'userdata' })
  const b = new Channel(new Protomux(new SecretStream(false)), null, { other: 'userdata' })
  teardown(() => { a.close() })

  alike(a.userData, { some: 'userdata' })
  alike(b.userData, { other: 'userdata' })
})

test('onclose', async ({ plan, alike, is }) => {
  plan(4)

  const a = new Channel(new Protomux(new SecretStream(true)), null, null, { onclose (remote) { is(remote, false) } })
  const b = new Channel(new Protomux(new SecretStream(false)), null, null, { onclose (remote) { is(remote, true) } })

  replicate(a, b)

  const expectedParams = { a: 1, b: 2 }
  a.method('test', (params, reply) => {
    alike(params, expectedParams)
    reply({ a: 'response', echo: params })
  })

  const request = b.request('test', expectedParams)

  alike(await request, { a: 'response', echo: expectedParams })
  a.close()
})

test('onclose', async ({ plan, alike, is }) => {
  plan(4)

  const a = new Channel(new Protomux(new SecretStream(true)), null, null, { onclose (remote) { is(remote, false) } })
  const b = new Channel(new Protomux(new SecretStream(false)), null, null, { onclose (remote) { is(remote, true) } })

  replicate(a, b)

  const expectedParams = { a: 1, b: 2 }
  a.method('test', (params, reply) => {
    alike(params, expectedParams)
    reply({ a: 'response', echo: params })
  })

  const request = b.request('test', expectedParams)

  alike(await request, { a: 'response', echo: expectedParams })
  a.close()
})

function replicate (a, b) { a.socket.pipe(b.socket).pipe(a.socket) }
