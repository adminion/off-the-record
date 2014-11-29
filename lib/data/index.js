
// node core modules
var events = require('events'), 
    util = require('util');

var config = require('config'),
    env = require('../env'),
    debug = require('debug')(env.context('server:data')), 
    mongoose = require('mongoose'),
    passport = require('passport');

module.exports = OffTheRecord_data

////////////////////////////////////////////////////////////////////////////////
//
// main module constructor
// 
////////////////////////////////////////////////////////////////////////////////

function OffTheRecord_data () {

    var connection,
        self = this;

    this.accounts = require('./account'),
    this.conversations = require('./conversation'),

    // create an instance of the connection
    connection = mongoose.connection;

    // debug('connection', connection);

    connection.on('connecting', function () {
        debug('connecting to mongodb...');
        self.emit('connecting');
    });

    connection.on('connected', function () {
        debug('connected to mongodb!');
        self.emit('connected');
    });

    connection.on('disconnecting', function () {
        debug('disconnecting from mongodb...');
        self.emit('disconnecting');
    });

    connection.on('disconnected', function () {
        debug('disconnected from mongodb!'); 
        self.emit('disconnected');
    });

    connection.on('close', function () {
        debug('connection to mongodb closed!');
        self.emit('closed');
    });

    // if the connection has an error, output the error:
    connection.on('error', function (error) {
        console.error('connection error:', error);
        self.emit('error', error);
        process.exit();
    });

    // once the connection is open
    connection.once('open', init);

    this.start = function () {

        debug('starting data layer...')
        this.emit('starting');

        mongoose.connect(config.mongodb.uri, config.mongodb.options);

        return true; 
    };

    this.stop = function (done) {
        done = done || function () {};

        debug('s.topping data layer...');
        self.emit('stopping');

        self.on('stopped', done);

        connection.close(function () {
            debug('data layer stopped');
            self.emit('stopped');
        });

    };

    this.disconnect = function () {
        return connection.close();
    };

    this.getConnection = function () {
        return connection;
    };

    function init () {

        // createStrategy() returns the built-in strategy
        passport.use(self.accounts.createStrategy());
        // serializeUser() and deserializeUser() return the functions passport will use
        passport.serializeUser(self.accounts.serializeUser());
        passport.deserializeUser(self.accounts.deserializeUser());

        // debug('self.accounts', self.accounts);
        // debug('Conversations', Conversations);

        debug('data layer started')
        self.emit('started');
        
        return true;
    };

};

OffTheRecord_data.prototype = new events.EventEmitter();
