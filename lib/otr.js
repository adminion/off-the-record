
var config = require('config'),
    env = require('./env'),
    events = require('events'),
    util = require('util'),
    utils = require('techjeffharris-utils');

var debug = require('debug')(env.context());

module.exports = OffTheRecord;

function OffTheRecord (options) {

    // makes it work with or without new ! how neat!
    if (!(this instanceof OffTheRecord)) return new OffTheRecord();

    Object.defineProperty(this, 'config', { value: config });
    Object.defineProperty(this, 'env', { value: env });

    this.modules = { 
        enabled: ['data', 'http', 'realtime'], 
        instances : {},
        ready: 0
    }; 

    var self = this;

    this.kill = function () {

        // debug('Server recevied KILL command--ending now!');
        
        process.kill();

        return true;
    };

    this.start = function () {
        // debug('Starting Adminion Game Server...');

        
        this.emit('starting');

        this.on('ready', function () {
            self.emit('started');
        });

        return loadModule();
    };

    this.stop = function () {

        this.emit('stopping');

        realtime.stop();

        this.emit('stopped');
        
        return true;
    };

    function loadModule () {

        var constructor,
            instance,
            name = self.modules.enabled[self.modules.ready],

        // debug('loading module: ' + name + '...');

        // get the module constructor
        constructor = require('./' + name);

        // set the constructor's prototype to self
        constructor.prototype = self;

        // get an instance of the module
        instance = new constructor();
        
        // when the module is ready
        instance.on('ready', function onModuleReady () {
            // put it in the ready modules array
            self.modules.instances[name] = instance;
            self.modules.ready +=1;

            debug('...module loaded: ' + name + '!');
            // debug(name, instance);
            // debug('self.modules.ready', self.modules.ready);
            // debug('self.modules.instances', self.modules.instances);

            if (self.modules.enabled.length === self.modules.ready) {
                self.emit('ready');
                return true;

            } else {
                // load the next module
                loadModule();
            }
            
        });

        instance.start();

        return true;
        
    };

};

OffTheRecord.prototype = new events.EventEmitter();
