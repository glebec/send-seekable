[![npm version](https://img.shields.io/npm/v/send-seekable.svg?maxAge=3600)](https://www.npmjs.com/package/send-seekable)
[![Codeship](https://img.shields.io/codeship/641e1c10-0600-0134-54e5-56f9205ea8b9.svg)](https://codeship.com/projects/154589)
[![Code Climate](https://img.shields.io/codeclimate/github/glebec/send-seekable.svg?maxAge=3600)]()
[![Greenkeeper.io is keeping this repo's dependencies up to date](https://img.shields.io/badge/greenkeeper.io-monitoring-brightgreen.svg?maxAge=3600)](https://greenkeeper.io/)

# Send-Seekable

### Express.js/connect middleware for serving partial content (206) byte-range responses from buffers or streams

Need to support seeking in a (reproducible) buffer or stream? Attach this middleware to your `GET` route and you can now `res.sendSeekable` your resource:

```js
const Express = require('express')
const sendSeekable = require('send-seekable');

const app = new Express();
app.use(sendSeekable);

const exampleBuffer = new Buffer('Weave a circle round him thrice');
// this route accepts HTTP request with Range header, e.g. `bytes=10-15`
app.get('/', function (req, res, next) {
  res.sendSeekable(exampleBuffer);
})

app.listen(1337);
```

## Installation

```sh
npm install send-seekable --save
```

## Features

### Supported

* Node version 0.12.0 or higher
* `GET` and `HEAD` requests (the latter is handled automatically by Express; the server will still produce the necessary buffer or stream as if preparing for a `GET`, but will refrain from actually transmitting the body)
* Sending buffers (as they are)
* Sending streams (requires predetermined metadata content length, in bytes)
* Byte range requests
  - From a given byte: `bytes=2391-`
  - From a given byte to a later byte: `bytes=3340-7839`
  - The last X bytes: `bytes=-4936`

### Limitations

* Does not handle multi-range requests (`bytes=834-983,1056-1181,1367-`)
* Does not cache buffers or streams; you must provide a buffer or stream containing identical content upon each request to a specific route

## Context and Use Case

HTTP clients sometimes request a *portion* of a resource, to cut down on transmission time, payload size, and/or server processing. A typical example is an HTML5 `audio` element with a `src` set to a route on your server. Clicking on the audio progress bar ideally allows the browser to *seek* to that section of the audio file. To do so, the browser may send an HTTP request with a `Range` header specifying which bytes are desired.

Express.js automatically handles range requests for routes terminating in a `res.sendFile`. This is relatively easy to support as the underlying `fs.createReadStream` can be called with `start` and `end` bytes. However, Express does not natively support range requests for buffers or streams. This makes sense: for buffers, you need to either re-create/fetch the buffer (custom logic) or cache it (bad for memory). For streams it is even harder: streams don't know their total byte size, they can't "rewind" to an earlier portion, and they cannot be cached as simply as buffers.

Regardless, sometimes you can't — or won't — store a resource on disk. Provided you can re-create the stream or buffer, it would be convenient for Express to slice the content to the client's desired range. This module enables that.

## API / Guide

### `sendSeekable (req, res, next)`

```js
const sendSeekable = require('send-seekable');
```

A Connect/Express-style middleware function. It simply adds the method `res.sendSeekable`, which you can call as needed.

Attaching `sendSeekable` as app-wide middleware is an easy way to "set and forget." Your app and routes work exactly as they did before; you must deliberately call `res.sendSeekable` to actually change a route's behavior.

```js
// works for all routes in this app / sub-routers
app.use(sendSeekable);
```

```js
// works for all routes in this router / sub-routers
router.use(sendSeekable);
```

Alternatively, if you only need to support seeking for a small number of routes, you can attach the middleware selectively — adding the `res.sendSeekable` method just where needed. In practice however there is no performance difference.

```js
// attached to this specific route
app.get('/', sendSeekable, function (req, res, next){ /* ... */ });
```

```js
// also attached to this route
router.get('/', sendSeekable, function (req, res, next) { /* ... */ });
```

### `res.sendSeekable(stream|buffer, <config>)`

Param | Type | Details
---|---|---
`stream|buffer` | A Node.js `Stream` instance or `Buffer` instance | the content you want to be able to serve in response to partial content requests
`config` | `Object` | Optional for buffers; required for streams. Has two properties: `.type` is the optional MIME-type of the content (e.g. `audio/mp4`), and `.length` is the total size of the content in bytes (required for streams). More on this below.

```js
const exampleBuffer = new Buffer('And close your eyes with holy dread');

app.get('/', sendSeekable, function (req, res, next) {
  res.sendSeekable(exampleBuffer);
})
```

With the middleware module mounted, your `res` objects now have a new `sendSeekable` method which you can use to support partial content requests on either a buffer or stream.

For either case, **it is assumed that the buffer or stream contains identical content on every request**. If your route dynamically produces buffers or streams containing different content, with different total byte lengths, the client's range requests may not line up with the new content.

#### Sending Buffers

As an example: if you have binary data stored in a database, and can fetch it as a Node.js Buffer instance, you can support partial content ranges using `res.sendSeekable`.

```js
app.use(sendSeekable);

const exampleBuffer = new Buffer('For he on honey-dew hath fed');
// minimum use pattern
app.get('/', function (req, res, next) {
  res.sendSeekable(exampleBuffer);
})
```

```js
// the buffer does not have to be cached, so long as you always produce or retrieve the same contents
function makeSameBufferEveryTime () {
  return new Buffer('And drunk the milk of Paradise');
}
app.get('/', function (req, res, next) {
  const newBuffer = makeSameBufferEveryTime();
  res.sendSeekable(newBuffer)
})
```

The `config` object is not required for sending buffers, but it is recommended in order to set the MIME-type of your response — especially in the case of sending audio or video.

```js
// with optional MIME-type configured
app.get('/', function (req, res, next) {
  const audiBuffer = fetchAudioBuffer();
  res.sendSeekable(audioBuffer, { type: 'audio/mp4' });
})
```

You can also set this using vanilla Express methods, of course.

```js
// with optional MIME-type configured
app.get('/', function (req, res, next) {
  const audioBuffer = fetchAudioBuffer();
  res.set('Content-Type', 'audio/mp4');
  res.sendSeekable(audioBuffer);
})
```

#### Sending Streams

Sending streams is almost as easy with some significant caveats.

First, you must know the total byte size of your stream contents ahead of time, and specify it as `config.length`.

```js
app.get('/', function (req, res, next) {
  const audio = instantiateAudioData();
  res.sendSeekable(audio.stream, {
    type: audio.type, // e.g. 'audio/mp4'
    length: audio.size // e.g. 4287092
  });
});
```

Second, note that you **CANNOT** simply send the same stream object each time; you must *re-create* a stream representing *identical content*. So, this will not work:

```js
const audioStream = radioStream(onlineRadioStationURL);
// DOES NOT WORK IF `audioStream` REPRESENTS CHANGNING CONTENT OVER TIME
app.get('/', function (req, res, next) {
  res.sendSeekable(audioStream, {
    type: 'audio/mp4',
    length: 4287092
  });
});
```

Whereas, something like this is ok:

```js
// Works assuming audio file #123 is always the same
app.get('/', function (req, res, next) {
  // a new stream with the same contents, every time there is a request
  const audioStream = database.fetchAudioFileById(123);
  res.sendSeekable(audioStream, {
    type: 'audio/mp4',
    length: 4287092
  });
});
```

## Mechanics

It can be helpful to understand precisely how `sendSeekable` works under thw hood. The short explanation is that `res.sendSeekable` determines whether a `GET` request is a standard content request or range request, sets the response headers accordingly, and slices the content to send if neccessary. A typical sequence of events might look like this:

### Initial request

1. CLIENT: makes plain `GET` request to `/api/audio/123`
1. SERVER: routes request to that route
1. `req` and `res` objects pass through the `sendSeekable` middleware
1. `sendSeekable`: adds `res.sendSeekable` method
1. ROUTE: fetches audio #123 and associated (pre-recorded) metadata such as file size and MIME-type (you are responsible for this logic)
1. ROUTE: calls `res.sendSeekable` with the buffer and `config` object
1. `res.sendSeekable`: places the `Accept-Ranges: bytes` header on `res`
1. `res.sendSeekable`: adds appropriate `Content-Length` and `Content-Type` headers
1. `res.sendSeekable`: streams the entire buffer to the client with `200` (ok) status
1. CLIENT: receives entire file from server
1. CLIENT: notes the `Accept-Ranges: bytes` header on the response

### Subsequent range request

Next the user attempts to seek in the audio progress bar to a position corresponding to byte 1048250. Note that steps 2–7 are identical to the initial request steps 2–7:

1. CLIENT: makes new `GET` request to `/api/audio/123`, with `Range` header set to `bytes=1048250-` (i.e. from byte 1048250 to the end)
1. SERVER: routes request to that route
1. `req` and `res` objects pass through the `sendSeekable` middleware
1. `sendSeekable`: places `res.sendSeekable` method
1. ROUTE: fetches audio #123 and associated (pre-recorded) metadata such as file size and MIME-type (you are responsible for this logic)
1. ROUTE: calls `res.sendSeekable` with the buffer and `config` object
1. `res.sendSeekable`: places the `Accept-Ranges: bytes` header on `res`
1. `res.sendSeekable`: parses the range header on the request
1. `res.sendSeekable`: slices the buffer to the requested range
1. `res.sendSeekable`: sets the `Content-Range` header, as well as `Content-Length` and `Content-Type`
1. `res.sendSeekable`: streams the byte range to the client with `206` (partial content) status
1. CLIENT: receives the requested range

## Contributing

Pull requests are welcome. Send-seekable includes a thorough test suite written for the Mocha framework. You may find it easier to develop for Send-seekable by running the test suite in file watch mode via:

```sh
npm run develop
```

Please add to the test specs (in `test/test.js`) for any new features / functionality. Pull requests without tests, or with failing tests, will be gently reminded to include tests.

## License

MIT
