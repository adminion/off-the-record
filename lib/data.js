"use strict";

// node core modules
var events = require('events');

var async = require('async'),
  config = require('./config'),
  env = require('./env'),
  expressSession = require('express-session'),
  debug = require('debug')(env.package.name + ':data'), 
  mongoose = require('mongoose'),
  MongoStore = require('connect-mongo')(expressSession),
  passport = require('passport'),
  State = require('./state');


if (process.env.DEBUG) {
  // mongoose.set('debug', true);
}

module.exports = OffTheRecord_data

////////////////////////////////////////////////////////////////////////////////
//
// main module constructor
// 
////////////////////////////////////////////////////////////////////////////////

function OffTheRecord_data () {

  var db,
    self = this,
    sessionStore;

  // get database models
  this.user = require('./models/user')(),
  this.conversation = require('./models/conversation')(),
  this.privacy = require('./privacy');

  // create an instance of the db
  db = mongoose.connection;

  // debug('db', db);

  // setup event handlers for the db... 
  db.on('connecting', function () {
    debug('connecting to mongodb...');
    self.emit('connecting');
  });

  db.on('connected', function () {
    debug('connected to mongodb!');
    self.emit('connected');
  });

  db.on('disconnecting', function () {
    debug('disconnecting from mongodb...');
    self.emit('disconnecting');
  });

  db.on('disconnected', function () {
    debug('disconnected from mongodb!'); 
    self.emit('disconnected');
  });

  db.on('close', function () {
    debug('connection to mongodb closed!');
    self.emit('closed');
  });

  // if the db has an error, output the error:
  db.on('error', function (error) {
    debug('db error:', error);
    self.emit('error', error);
    process.exit();
  });

  // once the db is open
  db.on('open', init);

  this.start = function (done) {

    // if done is NOT a function
    if ('function' !== typeof done) {
      done = function () {}
    }

    debug('starting')
    this.emit('starting');

    this.once('started', done)

    db.open(config.mongoose.uri, config.mongoose.options);

    return true; 
  };

  this.stop = function (done) {
    done = done || function () {};

    debug('stopping');
    self.emit('stopping');

    this.once('closed', function () {
      debug('stopped');
      self.emit('stopped');
      done()
    })

    this.disconnect()

  };

  this.disconnect = function (done) {

    // if done is NOT a function
    if ('function' !== typeof done) {
      done = function () {}
    }

    return db.close(done);
  };

  this.getConnection = function () {
    return db;
  };

  this.getSessionStore = function () {
    return sessionStore;
  };

  function init () {

    sessionStore = new MongoStore({ mongooseConnection: db });

    // serializeUser() and deserializeUser() return the functions passport will use
    passport.serializeUser(self.user.serializeUser());
    passport.deserializeUser(self.user.deserializeUser());

    // debug('self.user', self.user);
    // debug('self.conversation', self.conversation);
    
    // this whole file / document loading thing probably belongs inside data.js...

    self.state = new State();

    async.parallel({
      // preload all conversations
      convos: function (done) {
        // get all conversations from the database
        self.conversation.find({}, '_id starter invitees', done);
      },
      // preload all friendships
      friendships: function (done) {
        self.user.Friendship.find(done);
      },
      // preload all users
      users: function (done) {
        // get all users from the database, only get their id, username, and privacy settings
        self.user.find({}, '_id username profile privacy', done);
      }
    }, function (err, results) {
      if (err) self.emit('error', err);

      results.users.forEach((user) => {
        self.state.users.add(user);
      });
      
      results.convos.forEach((convo) => {
        self.state.convos.add(convo);
      });
      
      results.friendships.forEach((friendship) => {
        if (friendship.status === 'Pending') {
          self.state.requests.add(friendship);
        } else {
          self.state.friendships.add(friendship);
        }
      });

      debug('started')
      self.emit('started');
    });
  }

}

OffTheRecord_data.prototype = new events.EventEmitter();
