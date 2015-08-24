
// node core modules
var events  = require('events');
var util    = require('util');
var url     = require('url');

// 3rd party modules
var config            = require('config');
var debug             = require('debug');
var mongoose          = require('mongoose');
var passport          = require('passport');
var passportSocketIo  = require('passport.socketio');
var socketio          = require('socket.io');

var env     = require('../env'),
  Transfer  = require('./transfer');

module.exports = OffTheRecord_realtime;

////////////////////////////////////////////////////////////////////////////////
//
// main module constructor
// 
////////////////////////////////////////////////////////////////////////////////

function OffTheRecord_realtime (data, http) {

  var debug = require('debug')(env.context('server:transport:realtime'));

  var self = this;

  var authOptions = {
    key:            config.session.key,
    passport:       passport,
    secret:         config.session.secret, 
    store:          data.getSessionStore(),
    fail:           function (data, message, error, next) {
      debug('socket.io auth err:', message);
      next(new Error(message));
    }
  };

  var cache = {
    convos: {},
    users: {}
  };

  Object.defineProperty(cache, 'addUser', {
    value: function addUser (user) {
      // add an array who's name is the user's id to the cache to hold the user's sockets
      cache.sockets[user._id] = [];

      // create an entry in users cache to hold the user and the ids of the 
      // conversations they have started or joined
      cache.users[user._id] = {
        // the user document
        user: user,
        // a list of ids of the user's connected sockets
        sockets: [],
        convos: {
          // ids of conversations the user has started
          started: [],
          // ids of conversations the user has joined
          joined: []
        }
      };
    }
  });
  
  io = socketio(http.server);

  io.of('/users')
    .use(passportSocketIo.authorize(authOptions))
    .on('connect', usersNspConnect);

   io.of('/convos')
    .use(passportSocketIo.authorize(authOptions))
    .on('connect', convosNspConnect);

  this.start = function (done) {

    if (typeof done === 'function') {
      this.once('started', done);
    }

    debug('starting realtime layer...');

    cache.convos  = {};
    cache.sockets = {};
    cache.users   = {};

    // get all conversations from the database
    data.conversation.find(function (err, conversations) {

      // should probably emit the error event and handle it elsewhere... lol
      if (err) throw err;

      // create entry in cache for each conversation
      conversations.forEach(function (conversation) {
        cache.convos[conversation._id] = conversation;
      });

      debug('cache.convos', cache.convos);
      debug('cache.sockets', cache.sockets);
      debug('cache.users', cache.users);
      
      debug('realtime layer started');
      self.emit('started'); 
    });

  };

  this.stop = function (done) {

    if (typeof done === 'function') {
      this.once('stopped', done);
    }

    debug('stopping realtime layer...');


    io.of('/users').emit('shutdown');
    io.of('/convos').emit('shutdown');
    debug('realtime stopped!');
  
    this.emit('stopped');
  };
    

  // when a socket connects to the /users namespace
  function usersNspConnect (socket) {

    debug('socket connect');

    socket.on('error', socketError);

    var userId = socket.request.user._id;

    debug('socket.request.user', socket.request.user);

    socket.on('disconnect', function () {

      debug('socket disconnect');
    });

    socket.on('request-send', function (username, done) {

      data.user.findByUsername(username, function  (err, requestedUser) {
        if (err || !requestedUser) {
          done(err);
        } else {
          user.friendRequest(requestedUser._id, done);
        }
      });
    });

    socket.on('request-accept', function (username, done) {
      data.user.findByUsername(username, function  (err, requestedUser) {
        if (err || !requestedUser) {
          done(err);
        } else {
          user.acceptRequest(requestedUser._id, done);
        }
      });
    });

    socket.on('request-cancel', function (username, done) {
      data.user.findByUsername(username, function  (err, requestedUser) {
        if (err || !requestedUser) {
          done(err);
        } else {
          user.cancelRequest(requestedUser._id, done);
        }
      });
    });

    socket.on('request-deny', function (username, done) {
      data.user.findByUsername(username, function  (err, requestedUser) {
        if (err || !requestedUser) {
          done(err);
        } else {
          user.denyRequest(requestedUser._id, done);
        }
      });
    });

    socket.on('end-friendship', function (username, done) {
      data.user.findByUsername(username, function  (err, requestedUser) {
        if (err || !requestedUser) {
          done(err);
        } else {
          user.endFriendship(requestedUser._id, done);
        }
      });
    });

    socket.on('get-consented-interactions', function getConsentedInteractions (username, done) {
      data.user.findByUsername(username, function  (err, requestedUser) {
        if (err || !requestedUser) {
          done(err);
        } else {
          data.user.getConsentedInteractions(user, requestedUser, done);
        }
      });
    });

    socket.on('get-friends', function (done) {
      user.getFriends(done);
    });

    socket.on('get-requests', function (done) {
      user.getRequests(done);
    });

    socket.on('requests-sent', function (done) {
      user.getSentRequests(done);
    });

    socket.on('requests-pending', function (done) {
      user.getReceivedRequests(done);
    });

    socket.on('update-profile', function (updates, done) {
      if ('function' !== typeof done) {
        done = function () {};
      }

      debug('updates to '+userId+"'s profile", updates);

      var updatesToUser = { profile: updates };

      data.user.findByIdAndUpdate(userId, updatesToUser, done);
    });

    socket.on('update-privacy', function (updates, done) {
      if ('function' !== typeof done) {
        done = function () {};
      }

      debug('updates to '+userId+"'s privacy:", updates);

      var updatesToUser = { privacy: updates };

      data.user.findByIdAndUpdate(user, updatesToUser, done);
    });

    socket.on('view-profile', function (username, done) {

      data.user.findOne({username: username}, function (err, requestedUser) {
        user.viewProfile(requestedUser, done);
      });
    });

    socket.on('search', function (findParams, done) {

      debug('searching...');

      debug('findParams', findParams);

      findParams = utils.extend({}, findParams);

      findParams.conditions = utils.extend({}, findParams.conditions);
      
      var username  = findParams.conditions.username;
      findParams.conditions.username = new RegExp(username, "i");
      
      findParams.projection = '_id username privacy';
      
      debug('findParams', findParams);
    
      user.search(findParams, done);
    });

  };

  // when a socket connects to the /conversations namespace
  function convosNspConnect (socket) {

    var ERROR_NOT_ALLOWED = 'you are not allowed to join this conversation.';

    var user = socket.request.user;
    var userId = user._id;
    
    // join the socket to the room that is the user's _id
    // this allows us to emit logon and logoff events for a given user
    // and other users may (depending on privacy preferences) join this room
    // and receive these updates
    socket.join(userId);

    // if the user doesn't exist in cache, they are not logged on
    if (cache.users[userId] === undefined) {
      logon(user);
    }

    // save the socketId to the cache
    cache.users[userId].sockets.push(socket.id);

    debug('cache.users[' + userId + ']', cache.users[userId]);

    socket.on('error', socketError);
    socket.on('disconnect', function socketDisconnect () {

      // make this socket leave all conversations that it has joined
      cache.users[userId].convos.joined.forEach(function (convoId) {
        if (leaveConversation(convoId)) {
          debug(user.username + ' left conversation ' + convoId + ' successfully');
        } else {
          debug(user.username + ' cannot leave ' + convoId + ' because they have not joined');
        }
      });

      // get the index of this socket id from the list of this users's socket ids 
      var index = cache.users[userId].sockets.indexOf(socket.id);

      // double-check to make sure the socket is in the cache
      if (index >= 0) {
        // remove this socket's id from the list of this users's socket ids 
        cache.users[userId].sockets.splice(index, 1);
      }

      // if the user has no more sockets connected
      if (cache.users[userId].sockets.length === 0) {
        logoff(user);
      }

    });

    socket.on('online', function () {

      var onlineFriends = []

      user.getFriends(function (err, friends) {

        if (err) {
          console.log('error getting online friends: ', err);
        }

        friends.forEach(function (friend) {
          if (friend._id in cache.users) {
            onlineFriends.push(friend);
          }
        });

        socket.emit('online-friends', onlineFriends);
      });
    });

    // get conversations which the user has either started or has been invited
    socket.on('get', function (convoId, done) {

      var conditions = {
        _id: convoId,
        "$or": [
          { starter: userId },
          { invitees: { "$in": [userId] } }
        ]
      };

      data.conversation.find(conditions, function (err, conversations) {
        if (err) { 
          debug('err getting conversations', err);
          return done(err);
        } else {
          return done(null, conversations);
        }
      });

    });

    // start a conversation with one or more other users
    socket.on('start', function (invitees, done) {

      if ( utils.getType(invitees) !== 'array' ) {
        return done (new Error('invitees must be an array!'))
      }

      debug(user.username + ' wants to start a conversation with ' + invitees.join(', '));

      debug('invitees', invitees);

      // create the conversation document
      var conversation = new data.conversation({
        starter: userId,
        invitees: invitees
      }).save(function (err, savedConversation) {
        if (err) return done(err);

        // add the conversation to cache
        cache.convos[conversation._id] = conversation;

        // send invitation to all of each invitee's sockets
        invitees.forEach(function (invitee) {
          cache.sockets[invitee].forEach(function (socket) {
            socket.emit('invite', userId, conversation._id);
          });
        });

        // join this socket to the conversation 
        joinConversation(convoId, done);
      });
    });

    // end a conversation
    socket.on('end', function (convoId, done) { 

      // only the conversation starter is allowed to end conversations
      if (!cache.convos[convoId].starter.equals(userId)) {
        return done(new Error('only the conversation starter may end the conversation.'));
      }

      // notify users that the conversation has been ended by starter
      io.of('/convos').in(convoId).emit('end', convoId);

      // make each socket for each user leave the conversation
      cache.convos[convoId].members.forEach (function (member) {
        member.forEach(function (socket) {
          socket.leave(convoId);
        });
      });

      // remove the conversation from the database
      cache.convos[convoId].remove(function (err, result) {
        if (err) return done(err);
        
        // remove the conversation from cache
        delete cache.convos[convoId];

      });

    });

    // join a conversation
    socket.on('join', function (convoId, done) {

      var conversation = cache.convos[convoId];

      // make sure the user is either the conversation starter OR  has been invited to join the conversation
      if (conversation.convo.isStarter(userId) || conversation.convo.isInvited(userId)) {
        joinConversation(convoId);
        
        done(null, convesation.convo);
      } else { 
        return done(new Error(ERROR_NOT_ALLOWED));
      }
    });

    // leave a conversation
    socket.on('leave', function (convoId, done) {
      leaveConversation(convoId);
      done();
    });

    // boot a user from a conversation
    socket.on('boot', function (convoId, user, done) {

      // remove the user from conversation.invitees
      // 
      // make all of the booted user's sockets leave the room
      // 
      
      

    });

    // invite one ore more users to an existing conversation
    socket.on('invite', function (convoId, invitees, done) {

      var conversation = cache.convos[convoId];

      if (conversation.convo.isStarter)

      if (!Array.isArray(invitees)) {
        if (invitees instanceof mongoose.Schema.Types.ObjectId) {

        }
      } 

    });

    // send a message to a conversation
    socket.on('text', function (convoId, message, done) {

      var conversation = cache.convos[convoId]

      // 
      if (conversation.convo.isStarter(userId) || conversation.convo.isInvited(userId)) {
        io.of('/convos').in(convoId).emit('text', {
          convoId: convoId,
          userId: userId,
          message: message,
          date: Date.now()
        });

        return done();
      } else {
        return done(new Error(ERROR_NOT_ALLOWED));
      }
   
    });

    // send a file to a conversation
    socket.on('binary', function (convoId, filesInfo, ready) {

      debug('request to transfer %s files: ', filesInfo.length);

      var transfer = new Transfer(filesInfo);
      
      transfers[transfer.id] = transfer;

      transfer.on('progress', function (fileId) {
        var file = transfer.files[fileId]

        debug(transfer.id + ': ' + transfer.progress + '%, ' + file.name + ': ' + file.progress + '%')

        io.of('/convos').in(convoId).emit('transfer-progress', transfer.id, transfer.progress, fileId, file.progress);
      });

      transfer.on('complete', function () {
        io.of('/convos').in(convoId).emit('transfer-complete', transfer.id);

        // transfer.removeAllListeners();

        // delete the transfer data
        delete transfer,
          transfers[transfer.id];
      });
      
      debug('transfer %s ready', transfer.id);

      socket.broadcast.in(convoId).emit('binary', transfer);
      ready(transfer);

    });

    socket.on('transfer-data', function (convoId, transferId, fileId, chunkId, chunk) {

      try {
        transfers[transferId].chunk(fileId, chunkId, chunk);
        socket.broadcast.in(convoId).emit('data', transferId, fileId, chunkId, chunk);

      }

      catch (err) {
        socket.emit('transfer-error', err);
      }


    });

    function logon () {
      // add the user to cache
      cache.addUser(user);

      // loop through all convos
      for (var convoId in cache.convos) {
        // if this user started the convo
        if (userId.equals(cache.convos[convoId].starter)) {
          // add this convoId to the the cache of this user's started convos
          cache.users[userId].convos.started.push(convoId);
        }
      }

      // tell everyone who cares that this user has logged on
      socket.broadcast.to(userId).emit('logon', userId);
    };

    function logoff () {
      // remove the user from the cache
      delete cache.users[user._id];

      // tell everyone who cares that this user has logged off
      socket.broadcast.to(user._id).emit('logoff', user._id);

    };

    function joinConversation (convoId) {

      var members = cache.convos[convoId].members;

      // if this user is not yet a member of the conversation
      if (members[userId] === undefined) {
        // create an array to store the socketIds for each of the user's sockets that have joined
        members[userId] = [];

        // notify all sockets in the conversation that the user has joined
        io.of('/convos').in(convoId).broadcast.emit('joined', userId);
      }

      // add the socket id to the list of sockets for this user in this conversation
      members[userId].push(socket.id);

      // if the user has not already joined this conversation, add it to the list
      // of conversations that this user has joined
      if (cache.users[userId].convos.joined.indexOf(convoId) < 0) {
        cache.users[userId].convos.joined.push(convoId);
      }

    };

    function leaveConversation (convoId) {
      // get the index of this socket in the list of sockets for this user in this conversation
      var index = cache.convos[convoId].members[userId].indexOf(socket.id);

      if (index < 0) {
        return false;
      }

      // remove the socketId from the list of sockets for this user in this conversation
      cache.convos[convoId].members[userId].splice(index, 1);

      // if this socket was the last socket for this user in this conversation 
      if (cache.convos[convoId].members[userId].length === 0) {

        // delete the list of sockets for this user in this conversation
        delete cache.convos[convoId].members[userId];

        // get the index of this convoId in this user's list of joined conversations
        var index = cache.users[userId].convos.joined.indexOf(convoId);

        // remove the convoId from this user's list of joined conversations
        cache.users[userId].convos.joined.splice(index, 1);

        // notify all sockets in the conversation that this user has left
        io.of('/convos').in(convoId).broadcast.emit('left', userId);
      }

      return true;
    };

  };

  function socketError (err) {
    debug('socket error: ', err);
  };

};

OffTheRecord_realtime.prototype = new events.EventEmitter();
