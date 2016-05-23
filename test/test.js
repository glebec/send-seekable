'use strict';

const Express = require('express');
const test = require('supertest');
const chai = require('chai');
const expect = chai.expect;
const sinon = require('sinon');
const sinonChai = require('sinon-chai');
chai.use(sinonChai);

const sendSeekable = require('../send-seekable');;

describe('The `express-send-seekable` module', function () {

  it('is a middleware function', function () {
    expect(sendSeekable).to.be.an.instanceof(Function);
    expect(sendSeekable).to.have.length(3);
  });

  it('calls `next`', function () {
    const next = sinon.spy();
    sendSeekable({}, {}, next);
    expect(next).to.have.been.calledOnce; // Sinon getter prop, not a function
    expect(next).to.have.been.calledWith(); // distinct from `undefined`
  });

  it('places a `sendSeekable` method on `res`', function () {
    const res = {};
    sendSeekable({}, res, function next () {});
    expect(res.sendSeekable).to.be.an.instanceof(Function);
  });

});

describe('The `res.sendSeekable` method', function () {

  let app, content, config;
  beforeEach('create app and route with sendSeekable', function () {
    app = new Express();
    app.get('/', sendSeekable, function (req, res) {
      res.sendSeekable(content, config);
    });
  });

  afterEach('clean up and reset', function () {
    content = undefined;
    config = undefined;
  });

  describe('when passed a buffer', function () {

    beforeEach('set test content to a Node buffer', function () {
      content = new Buffer('Where Alph, the sacred river, ran');
    });

    function testInvariantBehavior () {
      it('sets the `Accept-Ranges` res header to `bytes`', function (done) {
        test(app)
        .get('/')
        .expect('Accept-Ranges', 'bytes', done);
      });

      it('sets the `Content-Length` res header to the buffer byte length', function (done) {
        test(app)
        .get('/')
        .expect('Content-Length', content.length, done);
      });

      it('sets the `Date` res header to a nonempty string', function (done) {
        test(app)
        .get('/')
        .expect('Date', /.+/, done);
      });
    }

    describe('upon initial request', function () {

      it('sets a 200 status', function (done) {
        test(app)
        .get('/')
        .expect(200, done);
      });

      it('sets the `Content-Type` res header if configured', function (done) {
        const type = String(Math.random() * 999);
        config = { type: type };
        test(app)
        .get('/')
        .expect('Content-Type', type, done);
      });

      testInvariantBehavior();

    });

  });

});
