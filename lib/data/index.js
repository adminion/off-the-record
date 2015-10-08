
// node core modules
var events = require('events'), 
  util = require('util');

var config = require('../config'),
  env = require('../env'),
  expressSession = require('express-session'),
  debug = require('debug')(env.context('server:data')), 
  mongoose = require('mongoose'),
  MongoStore = require('connect-mongo')(expressSession),
  passport = require('passport');

if (process.env.DEBUG) {
  mongoose.set('debug', true);
}

module.exports = OffTheRecord_data

////////////////////////////////////////////////////////////////////////////////
//
// main module constructor
// 
////////////////////////////////////////////////////////////////////////////////

function OffTheRecord_data () {

  var connection,
    self = this,
    sessionStore;

  // get database models
  this.user = require('./user')(),
  this.conversation = require('./conversation')(),

  // create an instance of the connection
  connection = mongoose.connection;

  // debug('connection', connection);

  // setup event handlerz for the connection... 
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
    debug('connection error:', error);
    self.emit('error', error);
    process.exit();
  });

  // once the connection is open
  connection.once('open', init);

  this.start = function () {

    debug('starting')
    this.emit('starting');

    mongoose.connect(config.mongoose.uri, config.mongoose.options);

    return true; 
  };

  this.stop = function (done) {
    done = done || function () {};

    debug('stopping');
    self.emit('stopping');

    self.on('stopped', done);

    connection.close(function () {
      debug('stopped');
      self.emit('stopped');
    });

  };

  this.disconnect = function () {
    return connection.close();
  };

  this.getConnection = function () {
    return connection;
  };

  this.getSessionStore = function () {
    return sessionStore;
  };

  function init () {

    sessionStore = new MongoStore({ mongooseConnection: connection });

    // createStrategy() returns the built-in strategy
    passport.use(self.user.createStrategy());
    // serializeUser() and deserializeUser() return the functions passport will use
    passport.serializeUser(self.user.serializeUser());
    passport.deserializeUser(self.user.deserializeUser());

    // debug('self.user', self.user);
    // debug('self.conversation', self.conversation);

    debug('started')
    self.emit('started');
    
    return true;
  };

};

OffTheRecord_data.prototype = new events.EventEmitter();
