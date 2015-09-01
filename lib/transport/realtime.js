
// node core modules
var events  = require('events');
var util    = require('util');
var url     = require('url');

// 3rd party modules
var async             = require('async');
var config            = require('config');
var debug             = require('debug');
var mongoose          = require('mongoose');
var passport          = require('passport');
var passportSocketIo  = require('passport.socketio');
var socketio          = require('socket.io');
var utils             = require('techjeffharris-utils');

var env       = require('../env');
var BinaryTransfer  = require('./binary');

var state;
var io;

////////////////////////////////////////////////////////////////////////////////
//
// main module constructor
// 
////////////////////////////////////////////////////////////////////////////////

function OffTheRecord_realtime (data, http) {

  var debug = require('debug')(env.context('server:transport:realtime'));

  var self = this;

  // passport.socketio authorization options
  // @see: http://github.com/jfromaniello/passport.socketio
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

  // start the realtime layer
  this.start = function (done) {

    // if a function was provided
    if (typeof done === 'function') {
      // create a one-time handler for the 'started' event
      this.once('started', done);
    }

    debug('starting realtime layer...');

    // in-memory operating cache to reduce database calls
    state = {
      // conversations keyed by their _id
      convos: {},
      // users keyed by their _id
      users: {}
    };

    async.parallel({
      convos: function (done) {
        // get all conversations from the database
        data.conversation.find(done);
      },
      users: function (done) {
        // get all users from the database
        data.user.find({}, '_id username privacy', done);
      }

    }, function (err, results) {
      if (err) self.emit('error', err);

       // create entry in state for each conversation
      results.convos.forEach(function (convo) {
        state.convos[convo._id] = convo;
      });

      results.users.forEach(function (user) {
        state.users[user._id] = user;
      });

      debug('state', state);
      debug('realtime layer started');

      // tell the world that the realtime module is ready!
      self.emit('started'); 

    });


    // create socket.io server from server started by http module
    io = socketio(http.server)
      // setup passport.socketio authorization for sockets
      .use(passportSocketIo.authorize(authOptions))
      // handle each socket connection
      .on('connect', socketConnect);

  };

  // stop the realtime module
  this.stop = function (done) {
    // if done is a function
    if (typeof done === 'function') {
      // set a one-time handler for 'stopped'
      this.once('stopped', done);
    }

    debug('stopping realtime layer...');

    // tell every connected user that the server is shutting down
    io.emit('shutdown');
    
    debug('realtime stopped!');
  
    // tell the world that the realtime module has stopped
    this.emit('stopped');
  };

  // when a socket connects 
  function socketConnect (socket) {

    debug('socket connect');

    // socket error constants
    var ERROR_NOT_ALLOWED = 'you are not allowed to join this conversation.';
    var ERROR_CONVO_NOT_FOUND = 'conversation found found';
    var ERROR_INVALID_INVITEES = 'invitees must be an array!';

    // convenience vars 
    var userId = socket.request.user._id;
    var user;

    // if the user is pending logoff (disconnected within the last second)
    if (state.user[userId].logoffTimeout) {
      // prevent a logoff event if pending
      clearTimeout(state.users[userId].logoffTimeout);
    }

    // if the user is logged on
    if (state.users[userId]) {
      // initialize their socket
      initSocket(socket);
    // if the user is NOT logged on
    } else {

      // add them to the cache
      state.users[userId] = socket.request.user;

      // save a reference to keep code clean
      user = state.users[userId];
      
      debug('user', user);

      // get a list of this user's friends
      user.getFriends({ projection: '_id username privacy'}, function (err, friends) {
        if (err) {
          debug('error getting friends', err);
        } else {
          
          // loop through the user's friends
          friends.forEach(function (friend) {

            // add each friend to the user's friends hash
            user.friends[friend._id] = friend;

          });
          
          // tell everyone listening to this user's events that they have logged on
          publish(userId, 'friends:logon', userId);
          
          // initialize their socket
          initSocket(socket);
        }
      });
    }
  };

  // this function add event handlers to a given socket.
  function initSocket (socket) {

    // save refs to the userId and the user for convenience
    var userId = socket.request.user._id;
    var user = state.users[userId];

    // add the socketId to this user's cache
    user.socketIds.push(socket.id);

    // loop through all convos
    for (var convoId in state.convos) {

      // save a convenience ref to the convo
      var convo = state.convos[convoId];

      // if the user may join the convo and they haven't already
      if (convo.mayJoin(userId) && !convo.isMember(userId)) {
        // join the user to the conversation
        joinConvo(userId, convoId);
      }
    }

    // loop through the user's friends
    for (var friendId in user.friends) {
      // join this socket to each friend's event feed
      socket.join(friendId);
    }

    /////////////////////////////////
    // initialization debug output //
    /////////////////////////////////

    debug('state', state);
    debug('user', user);
    debug('user.friends', user.friends);
    debug('user.convos', user.convos);
    debug('user.socketIds', user.socketIds);

    ///////////////////////////////////////
    // socket.io reserved event handlers //
    ///////////////////////////////////////

    socket.on('error', function socketError (err) {
      debug('socket error: ', err);
      console.trace(err);
    });

    socket.on('disconnect', function socketDisconnect () {
      // remove this socket's id from user.socketIds
      var index = user.socketIds.indexOf(socket.id);
      user.socketIds.splice(index, 1);

      debug('user ' + user.username + ' socket ' + socket.id + ' disconnected');
      debug('user.socketIds', user.socketIds);

      // if that was their last socket
      if (user.socketIds.length === 0) {

        // set a timeout for 1 second to log the user off.
        // if they logon within 1 second (i.e. page refresh), the timeout
        // will be cleared and they won't get logged off
        user.logoffTimeout = setTimeout(function logoffTimeout () {
          user.logoffTimeout = null;

          // tell everyone subscribed to this user that they have logged on
          publish(userId, 'friends:logoff', userId);

          // loop through conversations this user has joined
          for (var convoId in user.convos) {

            // remove the user from the conversation
            leaveConvo(userId, convoId);
          }; 

          // remove the user from the state
          delete state.users[userId];          
        }, 1000);

      }
    });

    /////////////////////////////////////
    // friend request related handlers //
    /////////////////////////////////////

    socket.on('requests:send', function (username, done) {
      data.user.findByUsername(username, function  (err, requestedUser) {
        if (err || !requestedUser) return done(err);
        
        user.friendRequest(requestedUser._id, function (err, request) {
          if (err) return done(err);

          notify(userId, 'requests:sent', request);

          if (state.users[requestedUser._id]) {
            notify(requestedUser._id, 'requests:received', request);
          }

          done(null, request);
        });
        
      });
    });

    socket.on('requests:accept', function (username, done) {
      data.user.findByUsername(username, function  (err, requestedUser) {
        if (err || !requestedUser) {
          done(err);
        } else {
          user.acceptRequest(requestedUser._id, function (err, friendship) {
            if (err) return done(err);

            // add the new friend to their hash of friends
            state.users[userId].friends[requestedUser._id] = requestedUser;

            subscribe(userId, requestedUser._id);

            notify(userId, 'requests:accepted', friendship);

            // if the new friend is online
            if (state.users[requestedUser._id]) {
              // add the user to the new friend's hash of friends
              state.users[requestedUser._id].friends[userId] = user;

              subscribe(requestedUser._id, userId);

              notify(requestedUser._id, 'requests:accepted', friendship);
            }

            done(null, friendship);
          });
        }
      });
    });

    socket.on('requests:cancel', function (username, done) {
      data.user.findByUsername(username, function  (err, requestedUser) {
        if (err || !requestedUser) return done(err);

         user.getFriendship(requestedUser._id, function (err, request) {
          if (err) return done(err);
          
          user.cancelRequest(requestedUser._id, function (err, result) {
            if (err) return done(err);

            notify(userId, 'requests:canceled', request);

            // if they are online
            if (state.users[requestedUser._id]) {
              notify(requestedUser._id, 'requests:canceled', request);
            }

            done(null, result);
          });
        });
      });
    });

    socket.on('requests:deny', function (username, done) {
      data.user.findByUsername(username, function  (err, requestedUser) {
        if (err || !requestedUser)  return done(err); 

        user.getFriendship(requestedUser._id, function (err, friendship) {
          if (err) return done(err);

          debug('friendship', friendship);

          user.denyRequest(requestedUser._id, function (err, result) {
            if (err) return done(err);

            notify(userId, 'requests:denied', friendship);

            if (state.users[requestedUser._id]) {
              notify(requestedUser._id, 'requests:denied', friendship);
            }

            done(null, result);
          });
        });
        
      });
    });

    socket.on('requests:get', function (done) {
      user.getRequests(null, 'username', done);
    });

  /////////////////////////////
  // friend related handlers //
  /////////////////////////////

    socket.on('friends:get', function (done) {
      user.getFriends({ projection: 'username' }, function gotFriends (err, friends) {
        if (err) return done(err);

        var results = {
          friends: [],
          interactions: []
        };

        // done();

        async.each(friends, function (friend, next) {
          friend.getConsentedInteractions(user, function (err, consentedInteractions) {
            if (err) return next(err);
            results.friends.push(friend.toObject());
            results.interactions.push(consentedInteractions);
            debug('results', results);
            next();
          });
        }, function (err) {
          done(err, results);
        });
      });
    });
    
    socket.on('friends:unfriend', function (username, done) {
      data.user.findByUsername(username, function  (err, requestedUser) {
        if (err || !requestedUser) return done(err);
        
        user.endFriendship(requestedUser._id, function (err, result) {
          if (err) return done (err);

          // remove the non-friend from the user's hash of friends
          delete state.users[userId].friends[requestedUser._id];

          if (state.users[requestedUser._id]) {

            // unsubscribe each convoSocket of the now non-friend from the user's activity room
            unsubscribe(userId, requestedUser._id);

            // make-unfriending sneaky; don't notify them that they have been un-friended
          }

          notify(userId, 'friends:unfriended', requestedUser);

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

    //////////////////////
    // profile handlers //
    //////////////////////

    socket.on('profile:update', function (updates, done) {
      if ('function' !== typeof done) {
        done = function () {};
      }

      debug('updates to '+userId+"'s profile", updates);

      var updatesToUser = { profile: updates };

      data.user.findByIdAndUpdate(userId, updatesToUser, done);
    });

    socket.on('profile:view', function (username, done) {

      data.user.findOne({username: username}, function (err, requestedUser) {
        user.viewProfile(requestedUser, done);
      });
    });

    //////////////////////
    // privacy handlers //
    //////////////////////

    socket.on('privacy:update', function (updates, done) {
      if ('function' !== typeof done) {
        done = function () {};
      }

      debug('updates to '+userId+"'s privacy:", updates);

      var updatesToUser = { privacy: updates };

      data.user.findByIdAndUpdate(user, updatesToUser, done);
    });

    //////////////////////
    // search for users //
    //////////////////////

    socket.on('search:users', function (findParams, done) {

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

    socket.on('users:online', function () {
      socket.emit('users:online', getOnlineFriends());
    });

  ///////////////////////////
  // conversation handlers //
  ///////////////////////////

    // get conversations related to the user (started or invited)
    socket.on('convos:get', function (done) {

      var conditions = { _id: {'$in': user.convoIds} };

      data.conversation.find(conditions)
        .populate('starter', '_id username privacy')
        .populate('invitees', '_id username privacy')
        .exec(function (err, conversations) {
          if (err) { 
            debug('err getting conversations', err);
            return done(err);
          } else {
            return done(null, conversations);
          }
        });

    });

    // start a conversation with one or more other users
    socket.on('convos:start', function (invitees, done) {

      if (!Array.isArray(invitees)) {
        return done (new Error(ERROR_INVALID_INVITEES));
      }

      // make sure the invitees allow the user to invite them
      invitees.forEach(function (invitee) {

      });

      debug(user.username + ' wants to start a conversation with ' + invitees.join(', '));

      debug('invitees', invitees);

      // create the conversation document
      var conversation = new data.conversation({
        starter: userId,
        invitees: invitees
      }).save(function (err, savedConversation) {
        if (err) return done(err);

        state.convos[conversation._id] = conversation;
        
        state.convos.members.push(userId);
        user.convos[conversation._id] = state.convos[conversation._id];
      
        // join this socket to the conversation 
        subscribe(userId, convoId);

      });
    });

    // end a conversation
    socket.on('convos:end', function (convoId, done) { 

      if (!state.convos[convoId]) {
        return done(new Error(ERROR_CONVO_NOT_FOUND));
      }

      // only the conversation starter is allowed to end conversations
      if (!state.convos[convoId].starter.equals(userId)) {
        return done(new Error(ERROR_NOT_ALLOWED));
      }

      // notify users that the conversation has been ended by starter
      io.to(convoId).emit('convos:ended', convoId);

      // make each socket for each user leave the conversation
      state.convos[convoId].members.forEach(function (member) {
        leaveConvo(member, convoId);
      });

      // remove the conversation from the database
      state.convos[convoId].remove(function (err, result) {
        if (err) return done(err);
        
        // remove the conversation from state
        delete state.convos[convoId];

        done(null, result);

      });

    });

    // boot a user from a conversation
    socket.on('convos:boot', function (convoId, user, done) {

      // remove the user from conversation.invitees
      // 
      // make all of the booted user's sockets leave the room
      // 
      
      

    });

    // invite one ore more users to an existing conversation
    socket.on('convos:invite', function (convoId, invitees, done) {

      // var conversation = state.convos[convoId];

      // if (conversation.convo.isStarter)

      // if (!Array.isArray(invitees)) {
      //   if (invitees instanceof mongoose.Schema.Types.ObjectId) {

      //   }
      // } 

    });

    // send a message to a conversation
    socket.on('convos:text', function (convoId, message, done) {

      var convo = state.convos[convoId];

      // 
      if (convo.isStarter(userId) || convo.isInvited(userId)) {
        io.in(convoId).emit('convos:text', {
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
    socket.on('convos:binary:init', function (convoId, filesInfo, ready) {

      debug('request to transfer %s files: ', filesInfo.length);

      // create a new BinaryTransfer instance for the given filesInfo
      var transfer = new BinaryTransfer(filesInfo);
      
      // save the transfer to the conversation's list of active transfers
      state.convos[convoId].transfers[transfer.id] = transfer;

      // subscribe all current members of the conversation to this transfer's id.
      // this ensures that members that join in the middle of the transfer won't 
      // get a partial transfer
      state.convos[convoId].members.forEach(function (member) {
        subscribe(member, transfer.id);
      });

      // when the transfer has finished
      transfer.on('complete', function () {
        // unsubscribe users from the transfer now that its done
        state.convos[convoId].members.forEach(function (member) {
          unsubscribe(member, transfer.id);
        });

        // delete the transfer
        transfer = undefined;

        // remove the transfer.id key from the conversation's list of transfers
        delete state.convos[convoId].transfers[transfer.id];
      });
      
      debug('transfer %s ready', transfer.id);

      // tell all users in the conversation that there is an incoming binary transfer
      publish(convoId, 'convos:binary:incoming', convoId, userId, transfer);

    });

    socket.on('convos:binary:chunk', function (convoId, transferId, fileId, chunkId, chunk) {

      try {

        // confirm with the sending socket that this chunk was received (don't send the chunk)
        socket.emit('convos:binary:chunk', convoId, userId, transferId, fileId, chunkId);

        // send the chunk to all sockets (except the sending socket) who were 
        // connected when the transfer was initialized. 
        socket.broadcast.to(transferId).emit('convos:binary:chunk', convoId, userId, transferId, fileId, chunkId, chunk);
        
        // track the progress of the transfer by calling the chunk function
        state.convos[convoId].transfers[transferId].chunk(fileId, chunkId, chunk);

      }

      catch (err) {
        publish(transferId, 'convos:binary:error', {transferId: transferId, error: err });
      }
    });

    socket.emit('ready', user);

  };

  function getOnlineFriends () {
    var onlineFriends = [];

    user.friends.forEach(function (friend) {
      if (state.users[friend._id]) {
        onlineFriends.push(friend);
      }
    });

    return onlineFriends;
    
  };

  function joinConvo (userId, convoId) {

    // add the userId to list of users that have joined this convo
    state.convos[convoId].members.push(userId);

    // add the convo to the user's hash of convos
    state.users[userId].convos[convoId] = state.convos[convoId];

    // tell everyone in the conversation that this user has joined
    publish(convoId, 'convos:entered', { convo: convoId, user: userId });

  };

  function leaveConvo (userId, convoId) {
    // notify the convo that the user has left
    publish(convoId, 'left', { convo: convoId, user: user.username });

    // remove the user from the convo state
    var index = state.convos[convoId].members.indexOf(userId);
    state.convos[convoId].members.splice(index, 1);

    delete state.users[userId].convos[convoId];
  };

  function notify (userId, name, params) {
    state.users[userId].socketIds.forEach(function (socketId) {
      io.connected[socketId].emit(name, params);
    });
  }

  function publish (feed, eventName, eventParams) {
    io.to(feed).emit(eventName, eventParams);
  };

  function subscribe (subscriber, feed) { 
    state.users[subscriber].socketIds.forEach(function (socketId) {
      io.connected[socketId].join(feed);
    });
  };

  function unsubscribe (subscriber, feed) {
    state.user[subscriber].socketIds.forEach(function (socketId) {
      io.connected[socketId].leave(feed);
    });
  };


};

OffTheRecord_realtime.prototype = new events.EventEmitter();

module.exports = OffTheRecord_realtime;
