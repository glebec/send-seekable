'use strict';
var rangeStream = require('range-stream');
var parseRange = require('range-parser');
var sbuff = require('simple-bufferstream');

module.exports = function (req, res, next) {
  // every new request gets a thin wrapper over the generic function
  res.sendSeekable = function (stream, config) {
    return sendSeekable (stream, config, req, res, next);
  };
  next();
};

// the generic handler for serving up partial streams
function sendSeekable (stream, config, req, res, next) {
  if (stream instanceof Buffer) {
    config = config || {};
    config.length = stream.length;
    stream = sbuff(stream);
  }
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
    // parse ranges
    var ranges = parseRange(config.length, req.headers.range);
    if (ranges === -2) return res.sendStatus(400); // malformed range
    if (ranges === -1) {
      // unsatisfiable range
      res.set('Content-Range', '*/' + config.length);
      return res.sendStatus(416);
    }
    if (ranges.type !== 'bytes') return stream.pipe(res);
    if (ranges.length > 1) {
      return next(new Error('send-seekable can only serve single ranges'));
    }
    var start = ranges[0].start;
    var end = ranges[0].end;
    // formatting response
    res.status(206);
    res.set('Content-Length', (end - start) + 1); // end is inclusive
    res.set('Content-Range', 'bytes ' + start + '-' + end + '/' + config.length);
    // slicing the stream to partial content
    stream = stream.pipe(rangeStream(start, end));
  }
  return stream.pipe(res);
}
