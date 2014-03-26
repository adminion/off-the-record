
var defaults = require('../config.default.json'),
    environment = require('./env'),
    events = require('events'),
    util = require('util'),
    utils = require('techjeffharris-utils');

module.exports = OffTheRecord;

function OffTheRecord (options) {

    // makes it work with or without new ! how neat!
    if (!(this instanceof OffTheRecord)) return new OffTheRecord();

    var configuration, modules, keyRing;

    modules = { 
        enabled: ['data', 'http', 'realtime'], 
        instances : {},
        ready: 0
    };

    // the keyRing provides access to each
    keyRing = {
        config: configuration,
        env:    environment,
        utils:  utils,
    };

    var self = this;

    this.configure = function (options) {

        if (options) {
            if (utils.getType(options) ==='object') {
                configuration = utils.extend(defaults, options);
            } else {
                throw new Error('err: invalid parameter `options`: Object expected');
            }
        } else {
            return configuration;
        }

    };

    this.kill = function () {

        // debug.emit('msg', 'Server recevied KILL command--ending now!');
        
        process.kill();

        return true;
    };

    this.start = function () {
        // debug.emit('msg', 'Starting Adminion Game Server...');

        
        this.emit('starting');

        loadModule();

        this.on('ready', function () {
            self.emit('started');
        });

        return true;
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
            name = modules.enabled[modules.ready],
            path = './' + name;

        // debug.emit('msg', 'loading module: ' + name + '...');

        // get the module constructor 
        constructor = require(path);

        // construct a new instance of the module
        instance = new constructor(keyRing);

        
        // when the module is ready
        instance.on('ready', function onModuleReady () {
            // put it in the ready modules array
            modules.instances[name] = instance;
            modules.ready +=1;

            // then add it to the keyRing
            keyRing[name] = instance;

            debug.emit('msg', '...module loaded: ' + name + '!');
            // debug.emit('val', name, instance);
            // debug.emit('val', 'modules.ready', modules.ready);
            // debug.emit('val', 'modules.instances', modules.instances);

            if (modules.enabled.length === modules.ready) {
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

    this.configure(options);

};

util.inherits(OffTheRecord, events.EventEmitter);
