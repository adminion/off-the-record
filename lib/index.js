
var events = require('events'),
    util = require('util'),
    utils = require('techjeffharris-utils');

var config = require('config'),
    env = require('./env');

var debug = require('debug')(env.context('server'));

debug('config', config);

var Data =          require('./data'),
    Transport =     require('./transport');

module.exports = OffTheRecord;

function OffTheRecord () {

    // makes it work with or without new ! how neat!
    if (!(this instanceof OffTheRecord)) return new OffTheRecord();

    var data,
        transport,
        self = this;

    data = new Data();

    debug('data', data)

    data.on('started', function dataReady () {
           
        transport = new Transport(data);

        transport.on('started', function transportReady () {
            
            self.emit('started');
        });

        transport.start();
    });

    var self = this;

    this.on('started', function () {

        process.stdout.write(env.banner);
    });
    
    this.env = function () {
        return env;
    };

    this.kill = function () {

        debug('server recevied KILL command--ending now!');
        
        process.kill();

        return true;
    };

    this.start = function () {
        debug('starting server...');

        
        this.emit('starting');

        data.start();

        return true;
    };

    this.stop = function (done) {

        debug('stopping server...')
        this.emit('stopping');

        transport.stop(function () {

            data.stop(function () {
                self.emit('stopped');
                debug('server stopped');

                done();
            });
        });

        return true;
    };
};

OffTheRecord.prototype = new events.EventEmitter();
