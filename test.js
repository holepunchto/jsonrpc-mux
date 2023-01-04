'use strict'
const Mjr = require('.')
const test = require('brittle')
const SecretStream = require('@hyperswarm/secret-stream')

test('request-response', async ({ alike }) => {
  const a = new Mjr(new SecretStream(true))
  const b = new Mjr(new SecretStream(false))

  const achannel = a.channel()
  const bchannel = b.channel()

  replicate(a, b)

  await Promise.all([achannel.open(), bchannel.open()])

  const ac = new AbortController()
  const expectedParams = { a: 1, b: 2 }
  const iterable = achannel.method('test', ac)

  const request = bchannel.request('test', expectedParams)

  const yielded = await iterable.next()
  const { params, reply } = yielded.value

  alike(params, expectedParams)

  reply({ a: 'response', echo: params })

  alike(await request, { a: 'response', echo: expectedParams })
})

test('request-error', async ({ alike, exception }) => {
  const a = new Mjr(new SecretStream(true))
  const b = new Mjr(new SecretStream(false))

  const achannel = a.channel()
  const bchannel = b.channel()

  replicate(a, b)

  await Promise.all([achannel.open(), bchannel.open()])

  const ac = new AbortController()
  const expectedParams = { a: 1, b: 2 }
  const iterable = achannel.method('test', ac)

  const request = bchannel.request('test', expectedParams)

  const yielded = await iterable.next()
  const { params, reply } = yielded.value

  alike(params, expectedParams)
  const err = new Error('problem')
  err.code = 'E_TEST'
  reply(err)
  await exception(request, /\[E_TEST\] problem/)
})

function replicate (a, b) {
  a.protomux.stream.rawStream.pipe(b.protomux.stream.rawStream).pipe(a.protomux.stream.rawStream)
}
