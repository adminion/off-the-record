
// node core modules
var events  = require('events');
var util    = require('util');

// adminion server modules
var Offtherecord_http     = require('./http');
var Offtherecord_realtime = require('./realtime');
var config = require('config');
var env = require('../env');

// 3rd party
var debug = require('debug')(env.context('server:transport'));

module.exports = Offtherecord_transport;

function Offtherecord_transport (data) {

  var http,
    realtime,
    self = this;

  http      = new Offtherecord_http(data);
  realtime  = new Offtherecord_realtime(data, http);

  http.on('error', function (err) {
    self.emit('error', err);
  });

  http.once('started', realtime.start);
  
  http.once('stopped', function httpStopped (done) {

    if ('function' === typeof done) {
      self.once('stopped', done);
    }

    debug('stopped');
    self.emit('stopped');
  });

  realtime.on('error', function (err) {
    self.emit('error', err);
  });

  realtime.once('started', function realtimeStarted() {
    debug('started')
    self.emit('started');
  });

  realtime.once('stopped', http.stop);

  this.start = function (done) {

    debug('starting');

    if (typeof done === 'function') {
      this.once('started', done);
    }

    this.emit('starting');

    http.start();
  };

  this.stop = function (done) {
    var self = this;

    if (typeof done === 'function') {
      this.once('stopped', done);
    }

    debug('stopping');

    this.emit('stopping');

    realtime.stop();
  };

};

Offtherecord_transport.prototype = new events.EventEmitter();
