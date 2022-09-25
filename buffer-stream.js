'use strict';
var Readable = require('stream').Readable;


module.exports = function readableBufferStream (srcBuf) {
  var bytesRead = 0;

  return new Readable({
    read (size) {
      var remaining = srcBuf.length - bytesRead;
      if (remaining > 0) {
        var toRead = Math.min(size, remaining);
        this.push(srcBuf.subarray(bytesRead, bytesRead + toRead));
        bytesRead += toRead;
      } else {
        this.push(null);
      }
    }
  });
}
