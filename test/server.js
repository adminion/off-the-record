"use strict";

/**
 * This file contains the test suite for OffTheRecord_Server
 */

require('should');

let test_env = require('./env');

let OffTheRecord_Server = require('../lib/');
let config = require('../lib/config');

module.exports = function () {

  describe('OffTheRecord_Server', () => {
    it('is a function named OffTheRecord_Server', () => {
      OffTheRecord_Server.should.be.a.Function;
      OffTheRecord_Server.should.have.a.property('name', 'OffTheRecord_Server');
    });
  });

  describe('server', () => {
    let server = new OffTheRecord_Server();

    describe('#status', () => {
      let status = server.status;

      it('is "ready"', () => {
        status.should.equal('ready');
      });
    });

    // #env run the tests for environment module
    test_env(server.env);

    describe('#start()', function () {
      
      it('is a function', () => {
        server.start.should.be.a.Function;
      });

      it('sets server.status to "starting" when called', done => { 
        server.start(() => server.stop(done));
        server.status.should.equal('starting');

      });

      it('causes server to emit the "starting" event', done => {
        server.on('starting', () => {
          server.once('started', () => {
            server.stop(done);
          });
        });

        server.start();
      });

      it('sets server.status to "started" once server has started.', done => {
        server.start(() => {
          server.status.should.equal('started');
          server.stop(done);
        });
      });

      
    });
  });

};
