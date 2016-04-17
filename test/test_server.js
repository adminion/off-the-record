"use strict";

/**
 * This file contains the test suite for OffTheRecord_Server
 */

require('should');

let EventEmitter = require('events').EventEmitter

let test_config = require('./test_server_config')
let test_data = require('./test_server_data')
let test_env = require('./test_server_env')
let test_ssl = require('./test_server_ssl')
let test_BinaryTransfer = require('./test_server_binary')
let test_TextMessage = require('./test_server_text')

let OffTheRecord_Server = require('../lib/');
// let config = require('../lib/config');

module.exports = function () {

  describe('OffTheRecord_Server', () => {
    it('is a function named OffTheRecord_Server', () => {
      OffTheRecord_Server.should.be.a.Function;
      OffTheRecord_Server.should.have.a.property('name', 'OffTheRecord_Server');
    });

    describe('#prototype', function () {
      it('is an instance of EventEmitter', function () {
        OffTheRecord_Server.prototype.should.be.an.instanceof(EventEmitter)
      })

      describe('#setStatus', function () {
        let setStatus = OffTheRecord_Server.prototype.setStatus

        it('is a Function named "setStatus"', function () {
          setStatus.should.be.a.Function
          setStatus.should.have.a.property('name', 'setStatus')
        })
      })
    })
  });

  describe('server', () => {
    let server = new OffTheRecord_Server();

    it('is an instance of OffTheRecord_Server', function () {
      server.should.be.an.instanceof(OffTheRecord_Server)
    })

    describe('#status', () => {
      let status = server.status;

      it('is "ready" upon instantiation', () => {
        status.should.equal('ready');
      });
    });


    describe('#start()', function () {
      this.timeout(5000)
      
      it('is a function', () => {
        server.start.should.be.a.Function;
      });

      it('sets server.status to "starting" when called', function (done) { 
        server.start(() => server.stop(done));
        server.status.should.equal('starting');

      });

      it('causes server to emit the "starting" event', function (done) {

        server.once('starting', () => { 
          server.once('started', () => {
            server.stop(done)
          })
        })

        server.start();
      });

      it('sets server.status to "started" once server has started', function (done) {
        server.start(function () {
          server.status.should.equal('started');
          server.stop(done);
        });
      });

      it('causes server to emit the "started" event', function (done) {

        server.once('started', () => {
          server.stop(done)
        })

        server.start();
      });

      it('accepts an optional Function to be called once the server has started', function (done) {
        server.start(() => {
          server.stop(done)
        })
      })

      
    });

    describe('#stop()', function () {
      this.timeout(5000)
      
      it('is a function', () => {
        server.stop.should.be.a.Function;
      });

      it('sets server.status to "stopping" when called', function (done) { 
        server.start(() => {
          server.stop(done);
          server.status.should.equal('stopping');
        });
      });

      it('causes server to emit the "stopping" event', function (done) {

        server.once('stopping', () => {
          if (server.status === 'stopped') {
            done()
          } else {
            server.once('stopped', done)
          }
        })

        server.start(() => {
          server.stop()
        });

      });

      it('sets server.status to "stopped" once server has stopped', function (done) {

        server.start(function () {
          server.stop(() => {
            server.status.should.equal('stopped');
            done()
          });
        });
      });

      it('causes server to emit the "stopped" event', function (done) {

        server.once('stopped', done)

        server.start(() => server.stop());
      });

      it('accepts an optional Function to be called once the server has stopped', function (done) {
        server.start(() => server.stop(done))
      })

      
    });

    // #config run the tests for the config module
    test_config()

    // #data run the tests for the data module
    test_data(server)

    // #env run the tests for environment module
    test_env(server.env);

    // test the ssl module
    test_ssl()

    // test the BinaryTransfer module
    test_BinaryTransfer()

    // test the TextMessage module
    test_TextMessage()


  });



};
