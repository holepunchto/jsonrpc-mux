'use strict'
const Mjr = require('.')
const test = require('brittle')
const Protomux = require('protomux')
const SecretStream = require('@hyperswarm/secret-stream')

test('request-response', async ({ alike }) => {
  const a = new Mjr(new Protomux(new SecretStream(true)))
  const b = new Mjr(new Protomux(new SecretStream(false)))

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

test('request-error', async ({ alike, exception }) => {
  const a = new Mjr(new Protomux(new SecretStream(true)))
  const b = new Mjr(new Protomux(new SecretStream(false)))

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

test('multiple methods, multiple requests', async ({ is }) => {
  const a = new Mjr(new Protomux(new SecretStream(true)))
  const b = new Mjr(new Protomux(new SecretStream(false)))

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

function replicate (a, b) {
  a.protomux.stream.rawStream.pipe(b.protomux.stream.rawStream).pipe(a.protomux.stream.rawStream)
}
