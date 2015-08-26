
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

var cache     = require('./cache');
var env       = require('../env');
var Transfer  = require('./transfer');

var io;

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

  this.start = function (done) {

    if (typeof done === 'function') {
      this.once('started', done);
    }

    debug('starting realtime layer...');

    io = socketio(http.server)
      .use(passportSocketIo.authorize(authOptions))
      .on('connect', socketConnect);

    // get all conversations from the database
    data.conversation.find(function (err, conversations) {

      if (err) throw err;

      // create entry in cache for each conversation
      conversations.forEach(function (conversation) {
        cache.convos[conversation._id] = conversation;
      });

      debug('cache.convos', cache.convos);
      
      debug('realtime layer started');
      self.emit('started'); 
    });

  };

  this.stop = function (done) {

    if (typeof done === 'function') {
      this.once('stopped', done);
    }

    debug('stopping realtime layer...');

    io.emit('shutdown');
    
    debug('realtime stopped!');
  
    this.emit('stopped');
  };
};

OffTheRecord_realtime.prototype = new events.EventEmitter();

module.exports = OffTheRecord_realtime;

// when a socket connects 
function socketConnect (socket) {

  var ERROR_NOT_ALLOWED = 'you are not allowed to join this conversation.';

  var user = socket.request.user;
  var userId = user._id;
  var userCache = cache.users[userId];
  
  // join the socket to the room that is the user's _id
  // this allows us to emit logon and logoff events for a given user.
  // friends may join this room to receive these updates
  socket.join(userId);

  if (!online(userId)) {
    logon();
  }

  // save the socketId to the cache
  userCache.sockets.push(socket.id);

  debug('userCache', userCache);

  // get a list of this user's friends
  user.getFriends(function (err, friends) {
    if (err) {
      debug('error getting friends', err);
    } else {

      friends.forEach(function (friend) {
        // add the friend to this user's cache of friends
        userCache.friends[friend._id] = friend;

        // join the friend's room to receive logon/logoff notifications for that friend
        socket.join(friend._id);
      });
    }

    addEventHandlers(socket);

  });
};

// this function add event handlers to a given socket.
function addEventHandlers (socket) {

  socket.on('error', socketError);
  socket.on('disconnect', function socketDisconnect () {

    // make this socket leave all conversations that it has joined
    userCache.convos.joined.forEach(function (convoId) {
      if (leaveConversation(convoId)) {
        debug(user.username + ' left conversation ' + convoId + ' successfully');
      } else {
        debug(user.username + ' cannot leave ' + convoId + ' because they have not joined');
      }
    });

    // get the index of this socket id from the list of this users's socket ids 
    var index = userCache.sockets.indexOf(socket.id);

    // remove this socket's id from the list of this users's socket ids 
    userCache.sockets.splice(index, 1);

    // if the user has no more sockets connected
    if (userCache.sockets.length === 0) {
      logoff();
    }

  });

  socket.on('request-send', function (username, done) {
    data.user.findByUsername(username, function  (err, requestedUser) {
      if (err || !requestedUser) return done(err);
      
      user.friendRequest(requestedUser._id, function (err, request) {
        if (err) return done(err);

        if (online(requestedUser._id)) {
          notifyUser(requestedUser._id, 'request-received', request);
        }

        done(null, request);
      });
      
    });
  });

  socket.on('request-accept', function (username, done) {
    data.user.findByUsername(username, function  (err, requestedUser) {
      if (err || !requestedUser) {
        done(err);
      } else {
        user.acceptRequest(requestedUser._id, function (err, request) {
          if (err) return done(err);

          // if the user is online
          if (online(userId)) {
            // add the new friend to their hash of friends
            userCache.friends[requestedUser._id] = requestedUser;

            subscribeUserToUser(userId, requestedUser._id);
            
          }

          // if the new friend is online
          if (online(requestedUser._id)) {
            // add the user to the new friend's hash of friends
            cache.users[requestedUser._id].friends[userId] = user;

            subscribeUserToUser(requestedUser._id, userId);
          }

          done(null, request);
        });
      }
    });
  });

  socket.on('request-cancel', function (username, done) {
    data.user.findByUsername(username, function  (err, requestedUser) {
      if (err || !requestedUser) return done(err);
        
      user.cancelRequest(requestedUser._id, function (err, request) {
        if (err) return done(err);

        if (online(requestedUser._id)) {
          notifyUser(requestedUser._id, 'request-canceled', request);
        }

        done(null, request);
      });
    });
  });

  socket.on('request-deny', function (username, done) {
    data.user.findByUsername(username, function  (err, requestedUser) {
      if (err || !requestedUser)  return done(err);
      
      user.denyRequest(requestedUser._id, function (err, request) {
        if (err) return done(err);

        if (online(requestedUser._id)) {
          notifyUser(requestedUser._id, 'request-canceled', request);
        }

        done(null, request);
      });
    });
  });

  socket.on('end-friendship', function (username, done) {
    data.user.findByUsername(username, function  (err, requestedUser) {
      if (err || !requestedUser) return done(err);
      
      user.endFriendship(requestedUser._id, function (err, result) {
        if (err) return done (err);

        if (online(userId)) {
        // remove the non-friend from the user's hash of friends
          delete userCache.friends[requestedUser._id];
        }

        if (online(requestedUser._id)) {

          // unsubscribe each convoSocket of the now non-friend from the user's activity room
          cache.users[requestedUser._id].sockets.forEach(function (convoSocketId) {
            io.connected[convoSocketId].leave(user._id);
          });

          // make-unfriending sneaky; don't notify the user that they have been un-friended
        }

        done(null, result);
      });
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
    user.getFriends(null, 'username', done);
  });

  socket.on('get-requests', function (done) {
    user.getRequests(null, 'username', done);
  });

  socket.on('requests-sent', function (done) {
    user.getSentRequests(null, 'username', done);
  });

  socket.on('requests-pending', function (done) {
    user.getReceivedRequests(null, 'username', done);
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

  socket.on('search-users', function (findParams, done) {

    debug('searching for users');

    debug('findParams', findParams);

    findParams = utils.extend({}, findParams);

    findParams.conditions = utils.extend({}, findParams.conditions);
    
    var username  = findParams.conditions.username;
    findParams.conditions.username = new RegExp(username, "i");
    
    findParams.projection = '_id username privacy';
    
    debug('findParams', findParams);
  
    user.search(findParams, done);
  });

  socket.on('online-users', function () {
    socket.emit('online-users', getOnlineFriends());
  });

  // get conversations related to the user (started or invited)
  socket.on('get-convos', function (convoId, done) {

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
  socket.on('convo-start', function (invitees, done) {

    if (!Array.isArray(invitees)) {
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
      joinConversation(convoId);

    });
  });

  // end a conversation
  socket.on('convo-end', function (convoId, done) { 

    // only the conversation starter is allowed to end conversations
    if (!cache.convos[convoId].starter.equals(userId)) {
      return done(new Error('only the conversation starter may end the conversation.'));
    }

    // notify users that the conversation has been ended by starter
    io.in(convoId).emit('end', convoId);

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
      done(null, result);

    });

  });

  // join a conversation
  socket.on('convo-join', function (convoId, done) {

    var convo = cache.convos[convoId];

    // make sure the user is either the conversation starter OR  has been invited to join the conversation
    if (convo.isStarter(userId) || convo.isInvited(userId)) {
      joinConversation(convoId);
      
      done(null, convo);
    } else { 
      return done(new Error(ERROR_NOT_ALLOWED));
    }
  });

  // leave a conversation
  socket.on('convo-leave', function (convoId, done) {
    leaveConversation(convoId);
    done();
  });

  // boot a user from a conversation
  socket.on('convo-boot', function (convoId, user, done) {

    // remove the user from conversation.invitees
    // 
    // make all of the booted user's sockets leave the room
    // 
    
    

  });

  // invite one ore more users to an existing conversation
  socket.on('convo-invite', function (convoId, invitees, done) {

    // var conversation = cache.convos[convoId];

    // if (conversation.convo.isStarter)

    // if (!Array.isArray(invitees)) {
    //   if (invitees instanceof mongoose.Schema.Types.ObjectId) {

    //   }
    // } 

  });

  // send a message to a conversation
  socket.on('convo-text', function (convoId, message, done) {

    var convo = cache.convos[convoId];

    // 
    if (convo.isStarter(userId) || convo.isInvited(userId)) {
      io.in(convoId).emit('convo-text', {
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
  socket.on('convo-binary', function (convoId, filesInfo, ready) {

    debug('request to transfer %s files: ', filesInfo.length);

    var transfer = new Transfer(filesInfo);
    
    transfers[transfer.id] = transfer;

    transfer.on('progress', function (fileId) {
      var file = transfer.files[fileId]

      debug(transfer.id + ': ' + transfer.progress + '%, ' + file.name + ': ' + file.progress + '%')

      io.in(convoId).emit('transfer-progress', transfer.id, transfer.progress, fileId, file.progress);
    });

    transfer.on('complete', function () {
      io.in(convoId).emit('transfer-complete', transfer.id);

      // transfer.removeAllListeners();

      // delete the transfer data
      delete transfer,
        transfers[transfer.id];
    });
    
    debug('transfer %s ready', transfer.id);

    socket.broadcast.in(convoId).emit('binary', transfer);
    ready(transfer);

  });

  socket.on('convo-transfer-data', function (convoId, transferId, fileId, chunkId, chunk) {

    try {
      transfers[transferId].chunk(fileId, chunkId, chunk);
      socket.broadcast.in(convoId).emit('data', transferId, fileId, chunkId, chunk);

    }

    catch (err) {
      socket.emit('transfer-error', err);
    }


  });

  function getOnlineFriends () {
    var onlineFriends = []

    friends.forEach(function (friend) {
      if (friend._id in cache.users) {
        onlineFriends.push(friend);
      }
    });

    return onlineFriends;
    
  };

  function logon () {
    // add the user to cache
    cache.addUser(user);

    // loop through all convos
    for (var convoId in cache.convos) {
      // if this user started the convo
      if (userId.equals(cache.convos[convoId].starter)) {
        // add this convoId to the the cache of this user's started convos
        userCache.convos.started.push(convoId);
      }
    }

    // tell everyone who cares that this user has logged on
    socket.broadcast.to(userId).emit('logon', userId);
  };

  function logoff () {
    // remove the user from the cache
    cache.removeUser(user);

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
      io.in(convoId).broadcast.emit('joined', userId);
    }

    // add the socket id to the list of sockets for this user in this conversation
    members[userId].push(socket.id);

    // if the user has not already joined this conversation, add it to the list
    // of conversations that this user has joined
    if (userCache.convos.joined.indexOf(convoId) < 0) {
      userCache.convos.joined.push(convoId);
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
      var index = userCache.convos.joined.indexOf(convoId);

      // remove the convoId from this user's list of joined conversations
      userCache.convos.joined.splice(index, 1);

      // notify all sockets in the conversation that this user has left
      io.in(convoId).broadcast.emit('left', userId);
    }

    return true;
  };

  // is the user online now?
  function online (id) {
    return (cache.users[id] !== undefined);
  };

  function notifyUser(id, eventName, params) {
    cache.users[id].sockets.forEach(function (convoSocketId) {
      io.connected[convoSocketId].emit(eventName, params);
    });
  };

  function subscribeUserToUser(userA, userB) {
    cache.users[userA].sockets.forEach(function (socketId) {
      io.connected[convoSocketId].join(userB);
    });
  }

};

function socketError (err) {
  debug('socket error: ', err);
};
