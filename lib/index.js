
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

  var self = this;

  var data      = new Data();
  var transport;

  data.once('started', function dataReady () {
    transport = new Transport(data)
    
    transport.once('started', function transportReady () {
      self.emit('started');
    });

    transport.once('stopped', function transportStopped() {
      data.stop();
    });

    transport.start();
  });

  data.once('stopped', function dataStopped() {
    debug('server stopped');
    self.emit('stopped');
  });
    
  
  this.env = function () {
    return env;
  };

  this.kill = function () {

    debug('server recevied KILL command--ending now!');
    
    process.kill();

    return true;
  };

  this.start = function (onceStarted) {
    debug('starting server...');

    if (typeof onceStarted === 'function') {
      this.once('started', onceStarted);
    }
    
    this.emit('starting');

    data.start();

    return true;
  };

  this.stop = function (onceStopped) {

    debug('stopping server...')

    if (typeof onceStopped === 'function') {
      this.once('stopped', onceStopped);
    }

    this.emit('stopping');

    transport.stop();

    return true;
  };

  this.once('started', function serverStarted() {
    process.stdout.write(env.banner);
  });
};

OffTheRecord.prototype = new events.EventEmitter();
