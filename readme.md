# jsonrpc-mux

> multiplex jsonrpc

http://www.jsonrpc.org/specification

## API

### `new JSONRPCMux(protomux) => muxer`

#### Arguments

##### `protomux`

A [`Protomux`](https://github.com/holepunchto/protomux) instance.

### `muxer.channel(id, userData = null) => channel`

Create a new JSON-RPC channel.

#### Arguments

##### `id`

Optionally set an `id` property on the channel to the value passed as the `id` argument.

##### `userData`

Optionally set the resulting `channel.userData` property to the input value. Default `null`.

### `muxer.protomux`

The [`Protomux`](https://github.com/mafintosh/protomux) instance providing the protocol multiplexing layer. 

Read and write. Can be dynamically set to replace the Protomux muxer.

### `channel.request(method, params, opts}) => Promise`

Make a JSONRPC 2.0 Request. Call an RPC method and wait for a response. The returned promise resolves or rejects depending on whether the JSON-RPC response object has a `result` or `error` property.

If an invalid method is requested or the request stalls for any reason it will timeout after `opts.timeout` (default 650ms).

#### Arguments

##### `method` `<String>`

The method name to call.

##### `params` `<Object>`

Methods' named parameters.

##### `opts` `<Object>`

* `signal` -  An `AbortController` signal. The `channel.request` method will throw on abort.
* `timeout` -  Milliseconds. Self-abort after given timeout. Default `650`.

### `channel.notify(method, params})`

Make a JSONRPC 2.0 Notification. Call an RPC method fire-and-forget style.

If an invalid method is requested or the request stalls for any reason this will be silently ignored due to fire-and-forget behaviour.

#### Arguments

##### `method` `<String>`

The method name to call.

##### `params` `<Object>`

Methods' named parameters.

### `channel.method(name, responder))`

Register a method and begin listening for messages. 

The `responder` function is called with `params` and `reply` arguments.

Pass `null` as the second `responder` argument instead of a function to unregister a method.

#### Arguments

##### `name` `<String>`

The name of the method

##### `responder` `async (params, reply) => { ... } |  async (params) => { ... }` 

Handler function or `null`.

If the  `responder` is `null` unregister the method.

If the supplied `responder` signature is `(params, reply) => {}` call `reply` to send a response back.

If the supplied `responder` signature is `(params) => {}` or `() => {}` then returned values form the result response and any thrown value creates an error response.

**`reply(valueOrError, isError)`**

If the argument supplied to `reply` is an `instanceof Error` a JSONRPC error response (`{ jsonrpc: '2.0', id: 999, error: { message, code } }`) will be generated otherwise the supplied argument forms the result response (`{ jsonrpc: '2.0', id: 999, result: msg }`). This can be forced off by setting the second argument to `false`. Likewise, a non-error object can be considered an error-response by passing `true` as the second argument to reply - it must have a `message` property. 

**Examples**

```js
  achannel.method('example', (params, reply) => {
    reply({ a: 'response', echo: params })
  })
```

```js
  achannel.method('example', (params, reply) => {
    return { a: 'response', echo: params }
  })
```
```js
  achannel.method('example', (params, reply) => {
    reply(new Error('an error response'))
  })
```

```js
  achannel.method('example', (params, reply) => {
    return new Error('an error response') // returning an error is also an error response
  })
```

```js
  achannel.method('example', (params, reply) => {
    reply({ message: 'an error response'}, true)
  })
```

```js
  achannel.method('example', (params, reply) => {
    throw new Error('an error response')
  })
```

### `channel.muxer`

The `JSONRPCMux` instance from which the channel was created.

## Test

```sh
npm test
```

## Licence

BSD-3-Clause