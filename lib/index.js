
var events  = require('events');
var util    = require('util');

var config  = require('config');
var env     = require('./env');
var debug   = require('debug')(env.context('server'));
var utils   = require('techjeffharris-utils');

debug('config', config);

var Data      = require('./data');
var Transport = require('./transport');

module.exports = OffTheRecord;

function OffTheRecord () {

  // makes it work with or without new ! how neat!
  if (!(this instanceof OffTheRecord)) return new OffTheRecord();

  // create reference to the context of the given instance
  var self = this;

  // create private vars to store the data and transport layer instances
  var data;
  var transport;    
  
  // return the environment module
  this.env = function () {
    return env;
  };

  // define one-time handler for 'started' event
  this.once('started', function () {
    debug('started');

    // output our fancy logo/banner
    process.stdout.write(env.banner);
  });

  // once the server has stopped
  this.once('stopped', function () {
    debug('stopped');
    process.exit(0);
  });

  this.once('timeout', function () {
    debug('shutdown timeout');
  });

  // start the server
  this.start = function (onceStarted) {
    debug('starting');

    // emit the starting event
    this.emit('starting');

    // if onceStarted is a function
    if (typeof onceStarted === 'function') {
      // define one-time handler for 'started' event
      this.once('started', function () {
        // call onceStarted 
        onceStarted();
      });
    }

    // create a new data layer instance
    data = new Data();
  
    // handle data layer error events
    data.on('error', function (err) {
      // pass the error along, hoping it is handled at the server instance level
      self.emit('error', err);
    });

    // set one-time handler for when the data layer has started
    data.once('started', function dataReady () {

      // create a transport layer instance, passing it the data layer
      transport = new Transport(data)

      // handle transport layer errors
      transport.on('error', function (err) {
        // pass the error along, hoping it is handled at the server instance level
        self.emit('error', err);
      });
      
      // set one-time handler for the started event
      transport.once('started', function transportReady () {
        // once transport is started, the server is ready to handle incoming connections
        self.emit('started');
      });

      // set one-time handler for the started event
      transport.once('stopped', function transportStopped() {
        // once the transport layer has stopped, stop the data layer
        data.stop();
      });

      // start the transport layer
      transport.start();
    });

    // once the data layer has stopped
    data.once('stopped', function dataStopped() {
      // the server is ready to perform user-specified shutdown proceedures
      self.emit('stopped');
    });
    
    // start the data layer
    data.start();

    return true;
  };

  this.stop = function (onceStopped) {

    debug('stopping')

    // if onceStopped is a function
    if (typeof onceStopped === 'function') {
      // once the server has stopped
      this.once('stopped', function () {
        // call onceStopped
        onceStopped();
      });
    }

    // emit the stopping event
    this.emit('stopping');

    // set a timeout (default 5s) to wait for the server to shutdown before
    // pulling the plug
    shutdownTimer = setTimeout(function shutdownTimeout() {
      // output to debug that shutdown has reached its timeout
      debug('shutdown timeout');
      // emit the timeout event
      self.emit('timeout'); 

      // stop the process with exit code 0
      process.exit(0);
    }, config.shutdownTimeout);

    // 
    transport.stop();

    return true;
  };
};

OffTheRecord.prototype = new events.EventEmitter();
