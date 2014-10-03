
var config = require('config'),
    env = require('./env'),
    events = require('events'),
    util = require('util'),
    utils = require('techjeffharris-utils');

var debug = require('debug')(env.context());

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

    data.on('ready', function dataReady () {
        debug('data layer ready!');
           
        transport = new Transport(data);

        transport.on('ready', function transportReady () {
            
            debug('transport layer ready!');
            self.emit('ready');
        });

        transport.start();
    });

    var self = this;

    this.on('started', function () {
        console.log(env.package.name + ' server v' + env.package.version + ' started! >> %s', env.url(true));
    });
    
    this.env = function () {
        return env;
    };

    this.kill = function () {

        debug('Server recevied KILL command--ending now!');
        
        process.kill();

        return true;
    };

    this.start = function () {
        debug('Starting Server...');

        
        this.emit('starting');

        data.start();

        this.on('ready', function () {
            self.emit('started');
        });

        return true;
    };

    this.stop = function (cb) {

        debug('stopping server...')
        this.emit('stopping');

        transport.stop(function () {

            data.stop(function () {
                self.emit('stopped');
                debug('Server stopped.');

                cb();
            })
        });

        return true;
    };

    this.update = function () {
        data.updateCache(function () {
            self.emit('update');
        });
    };
    

};

OffTheRecord.prototype = new events.EventEmitter();
