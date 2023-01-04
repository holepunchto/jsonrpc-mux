# mjr

> mux json-rpc

http://www.jsonrpc.org/specification

## API

### `new Mjr(protomux) => muxer`

#### Arguments

* protomux - A [`Protomux`](https://github.com/holepunchto/protomux) instance.

### `muxer.channel(opts) => channel`

Create a new JSON-RPC channel.

### `muxer.protomux`

The [`Protomux`](https://github.com/mafintosh/protomux) instance providing the protocol multiplexing layer.

#### Arguments

##### `opts` `<Object>`

* `id` - Buffer. Optional.

### `for (const channel of muxer) {...}`

Iterate over all created channels

### `channel.open([handshake])`

Open the channel.

#### Arguments

##### `handshake` `<any>`

Optional handshake value

### `channel.close()`

Close the channel

### `channel.request(method, params, opts}) -> Promise`

Call an RPC method. The returned promise resolves or rejects depending on whether the JSON-RPC response object has a `result` or `error` property.

#### Arguments

##### `method` `<String>`

The method name to call.

##### `params` `<Object>`

Methods' named parameters.

##### `opts` `<Object>`

* `signal` -  An `AbortController` signal. The `channel.request` method will throw on abort.

### `for await (const { params, reply } of channel.method(name, [, opts])) { ... }`

Register a method and begin listening for messages. 

The `channel.method` function returns an async iterable which proceeds each time a message is received.

#### Yield Object

##### `params` `<Object>`

Incoming params from a remote caller

##### `reply(msgOrError <any>)` 

Call to send a response back.

If the supplied argument is an `instanceof Error` a JSONRPC error response (`{ jsonrpc: '2.0', id: 999, error: { message, code } }`) will be generated otherwise the supplied argument forms the result response (`{ jsonrpc: '2.0', id: 999, result: msg }`).

#### Arguments

##### `name` `<String>`

The name of the method

##### `responder` `<AsyncFunction|Function>`

Handler function for the method.

##### `options` `<Object>`

* `signal` - An `AbortController` signal
* `throwAbort` - `Boolean`, Default: `false`. Cause the iterable to throw with the abort signal reason, otherwise silently end the iterable on signal abort.

### `channel.muxer`

The `Mjr` instance from which the channel was created.

## Test

```sh
npm test
```

## Licence

BSD-3-Clause