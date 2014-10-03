
// node core modules
var events = require('events'), 
    util = require('util');

// adminion server modules
var Offtherecord_http = require('./http'),
    Offtherecord_realtime = require('./realtime'),
    config = require('config'),
    env = require('../env');

// 3rd party
var debug = require('debug')(env.context('transport'));

module.exports = Offtherecord_transport;

function Offtherecord_transport (data) {

    var http,
        realtime,
        self = this;

    http = new Offtherecord_http(data);

    realtime = new Offtherecord_realtime(data, http);

    this.start = function () {

        http.start();
        http.on('ready', function () {
            self.emit('ready');
        });
    };

    this.stop = function (done) {
        var self = this;

        done = done || function () {} ;

        debug('stopping transport...');

        this.emit('stopping');

        realtime.stop(http.stop);

        http.on('stopped', function httpStopped () {
            debug('transport stopped!');
            self.emit('stopped');
            done();
        })
    };

};

Offtherecord_transport.prototype = new events.EventEmitter();
