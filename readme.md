# jsonrpc-mux

> multiplex jsonrpc

http://www.jsonrpc.org/specification

## API

### `new JSONRPCMux(protomux) => muxer`

#### Arguments

* protomux - A [`Protomux`](https://github.com/holepunchto/protomux) instance.

### `muxer.channel() => channel`

Create a new JSON-RPC channel.

### `muxer.protomux`

The [`Protomux`](https://github.com/mafintosh/protomux) instance providing the protocol multiplexing layer.

### `channel.request(method, params, opts}) -> Promise`

Call an RPC method. The returned promise resolves or rejects depending on whether the JSON-RPC response object has a `result` or `error` property.

#### Arguments

##### `method` `<String>`

The method name to call.

##### `params` `<Object>`

Methods' named parameters.

##### `opts` `<Object>`

* `signal` -  An `AbortController` signal. The `channel.request` method will throw on abort.

### `channel.method(name, responder, [, opts]))`

Register a method and begin listening for messages. The `responder` function is called with `params` and `reply` arguments.

#### Arguments

##### `name` `<String>`

The name of the method

##### `responder` `async (params, reply) => { ... }` 

Handler function for the method.

Call `reply` to send a response back.

If the argument supplied to `reply` is an `instanceof Error` a JSONRPC error response (`{ jsonrpc: '2.0', id: 999, error: { message, code } }`) will be generated otherwise the supplied argument forms the result response (`{ jsonrpc: '2.0', id: 999, result: msg }`).


##### `options` `<Object>`

* `signal` - An `AbortController` signal
* `throwAbort` - `Boolean`, Default: `false`. Cause the iterable to throw with the abort signal reason, otherwise silently end the iterable on signal abort.

### `channel.muxer`

The `JSONRPCMux` instance from which the channel was created.

## Test

```sh
npm test
```

## Licence

BSD-3-Clause