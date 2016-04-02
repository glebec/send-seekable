'use strict';
var rangeStream = require('range-stream');

// the generic handler for serving up partial streams
function sendSeekable (stream, config, req, res, next) {
  if (!config.length) {
    var err = new Error('send-seekable requires `length` option');
    return next(err);
  }
  // indicate this resource can be partially requested
  res.set('Accept-Ranges', 'bytes');
  // incorporate config
  if (config.length) res.set('Content-Length', config.length);
  if (config.type) res.set('Content-Type', config.type);
  // if this is a partial request
  if (req.headers.range) {
    // parsing request
    const span = req.headers.range.split('=')[1].split('-'),
          start = parseInt(span[0], 10),
          end = parseInt(span[1], 10) || config.length - 1;
    // formatting response
    res.status(206);
    res.set('Content-Length', (end - start) + 1); // end is inclusive
    res.set('Content-Range', `bytes ${start}-${end}/${config.length}`);
    // slicing the stream to partial content
    stream = stream.pipe(rangeStream(start, end));
  }
  return stream.pipe(res);
};

module.exports = function (req, res, next) {
  // every new request gets a thin wrapper over the generic function
  res.sendSeekable = function (stream, config) {
    return sendSeekable (stream, config, req, res, next);
  };
  next();
};
