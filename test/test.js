'use strict';

var fs = require('fs');
var path = require('path');
var Express = require('express');
var test = require('supertest');
var chai = require('chai');
var expect = chai.expect;
var sinon = require('sinon');
var sinonChai = require('sinon-chai');
var parseRange = require('range-parser');
chai.use(sinonChai);

var sendSeekable = require('../send-seekable');;

describe('The `express-send-seekable` module', function () {

  it('is a middleware function', function () {
    expect(sendSeekable).to.be.an.instanceof(Function);
    expect(sendSeekable).to.have.length(3);
  });

  it('places a `sendSeekable` method on `res`', function () {
    var res = {};
    sendSeekable({}, res, function next () {});
    expect(res.sendSeekable).to.be.an.instanceof(Function);
  });

  it('calls `next`', function () {
    var next = sinon.spy();
    sendSeekable({}, {}, next);
    expect(next).to.have.been.calledOnce; // Sinon getter prop, not a function
    expect(next).to.have.been.calledWith(); // distinct from `undefined`
  });

});

describe('`res.sendSeekable`', function () {

  var appTester, content, config;
  beforeEach(function () {
    var app = new Express();
    app.get('/', sendSeekable, function (req, res) {
      res.sendSeekable(content, config);
    });
    app.use(function (err, req, res, next) {
      res.sendStatus(500);
    });
    appTester = test(app);
  });

  afterEach(function () {
    content = undefined;
    config = undefined;
  });

  function testInvariantBehavior () {
    it('sets the `Accept-Ranges` header to `bytes`', function (done) {
      appTester.expect('Accept-Ranges', 'bytes', done);
    });

    it('sets the `Date` header to a nonempty string', function (done) {
      appTester.expect('Date', /.+/, done);
    });
  }

  describe('when passed a buffer:', function () {

    function TestBuffer () {
      return new Buffer('Where Alph, the sacred river, ran');
    }

    testSupportedContent(TestBuffer);

  });

  describe('when passed a stream:', function () {

    var testFilePath = path.join(__dirname, 'test.js');
    var len = fs.statSync(testFilePath).size;
    var contents = fs.readFileSync(testFilePath, 'utf8');

    function TestStream () {
      var stream = fs.createReadStream(path.join(__dirname, 'test.js'), {
        encoding: 'utf8'
      });
      stream.length = len;
      stream.toString = function () { return contents; };
      return stream;
    }

    testSupportedContent(TestStream, { length: len });

  });

  function testSupportedContent (Content, testConfig) {

    content = new Content();
    if (content.length < 20) throw Error('test fixture needs content > 20');
    var middle = +Math.floor(content.length / 2);
    var later = +Math.floor(content.length / 2) + 5;
    var end = +content.length - 1;
    var beyond = +content.length + 50;

    beforeEach(function () {
      content = new Content();
      config = testConfig;
    });

    describe('on HEAD request', function () {

      beforeEach(function () {
        appTester = appTester.head('/');
      });

      it('sets a 200 status', function (done) {
        appTester.expect(200, done);
      });

      it('sends no body', function (done) {
        appTester.expect(undefined, done);
      });

      it('sets the `Content-Length` header to the content byte length', function (done) {
        appTester.expect('Content-Length', content.length.toString(), done);
      });

      testInvariantBehavior();

    });

    describe('on GET request', function () {

      beforeEach(function () {
        appTester = appTester.get('/');
      });

      describe('for a resource', function () {

        it('sets a 200 status', function (done) {
          appTester.expect(200, done);
        });

        it('sends the entire content', function (done) {
          appTester.expect(content.toString(), done);
        });

        it('sets the `Content-Length` header to the content byte length', function (done) {
          appTester.expect('Content-Length', content.length.toString(), done);
        });

        it('sets the `Content-Type` header if configured', function (done) {
          var type = 'random string ' + (Math.random() * 999);
          if (!config) config = {};
          config.type = type;
          appTester.expect('Content-Type', type, done);
        });

        it('does not set the `Content-Range` header', function (done) {
          appTester.expect(function (res) {
            expect(res.headers['content-range']).to.not.exist; // Chai getter
          }).end(done);
        });

        testInvariantBehavior();

      });

      describe('for valid byte range', function () {

        function testRange (firstByte, lastByte) {

          var trueFirst, trueLast;
          beforeEach(function () {
            if (typeof firstByte !== 'number') firstByte = '';
            if (typeof lastByte !== 'number') lastByte = '';
            // set requested content range
            var rangeString = 'bytes=' + firstByte + '-' + lastByte;
            appTester = appTester.set('Range', rangeString);
            // determine actual range
            var range = parseRange(content.length, rangeString);
            trueFirst = range[0].start;
            trueLast = range[0].end;
          });

          it('sets a 206 status', function (done) {
            appTester.expect(206, done);
          });

          it('sends the requested range', function (done) {
            var range = content.toString().slice(trueFirst, trueLast + 1);
            appTester.expect(range, done);
          });

          it('sets the `Content-Length` header to the number of bytes returned', function (done) {
            appTester.expect(function (res) {
              expect(res.headers['content-length']).to.equal(String(res.text.length));
            }).end(done);
          });

          it('sets the `Content-Range` header to the range returned', function (done) {
            var len = content.length;
            var rangeString = 'bytes ' + trueFirst + '-' + trueLast + '/' + len;
            appTester.expect('Content-Range', rangeString, done);
          });

          it('sets the `Content-Type` header if configured', function (done) {
            var type = 'random string ' + (Math.random() * 999);
            if (!config) config = {};
            config.type = type;
            appTester.expect('Content-Type', type, done);
          });

          testInvariantBehavior();

        }

        describe('[0, unspecified]', function () {
          testRange(0);
        });

        describe('[0, 0]', function () {
          testRange(0, 0);
        });

        describe('[0, a middle point]', function () {
          testRange(0, middle);
        });

        describe('[0, the end]', function () {
          testRange(0, end);
        });

        describe('[0, beyond the end]', function () {
          testRange(0, beyond);
        });

        describe('[a middle point, unspecified]', function () {
          testRange(middle);
        });

        describe('[a middle point, the same point]', function () {
          testRange(middle, middle);
        });

        describe('[a middle point, a later point]', function () {
          testRange(middle, later);
        });

        describe('[a middle point, the end]', function () {
          testRange(middle, end);
        });

        describe('[a middle point, beyond the end]', function () {
          testRange(middle, beyond);
        });

        describe('[the end, unspecified]', function () {
          testRange(end);
        });

        describe('[the end, the end]', function () {
          testRange(end, end);
        });

        describe('[the end, beyond the end]', function () {
          testRange(end, beyond);
        });

        describe('[the last byte]', function () {
          testRange(null, 1);
        });

        describe('[the last byte to the middle]', function () {
          testRange(null, middle);
        });

        describe('[the last byte to the beginning]', function () {
          testRange(null, end + 1);
        });

      });

      describe('for invalid byte range', function () {

        describe('<malformed>', function () {

          it('sets a 400 status', function (done) {
            appTester.set('Range', 'hello')
            .expect(400, done);
          });

          it('does not set the `Content-Range` header', function (done) {
            appTester.expect(function (res) {
              expect(res.headers['content-range']).to.not.exist; // Chai getter
            }).end(done);
          });

        });

        function testUnsatisfiableRange (range) {

          beforeEach(function () {
            appTester = appTester.set('Range', 'bytes=' + range);
          });

          it('sets a 416 status', function (done) {
            appTester.expect(416, done);
          });

          it('sets the `Content-Range` header to `*/total`', function (done) {
            appTester.expect('Content-Range', '*/' + content.length, done);
          });

        }

        describe('<start beyond end>', function () {
          testUnsatisfiableRange(later + '-' + middle);
        });

        describe('<start beyond total>', function () {
          testUnsatisfiableRange(beyond + '-');
        });

        describe('<end below 0>', function () {
          testUnsatisfiableRange('-' + beyond);
        });

        describe('<no range>', function () {
          testUnsatisfiableRange('-');
        });

      });

      describe('for unsupported byte range', function () {

        it('<multipart> throws an error', function (done) {
          appTester.set('Range', 'bytes=0-4,10-14').expect(500, done);
        });

        it('does not set the `Content-Range` header', function (done) {
          appTester.expect(function (res) {
            expect(res.headers['content-range']).to.not.exist; // Chai getter
          }).end(done);
        });

      });

    });

  }

});
