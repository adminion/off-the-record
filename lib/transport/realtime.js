
// node core modules
var events  = require('events');
var util    = require('util');
var url     = require('url');

// 3rd party modules
var async             = require('async');
var debug             = require('debug');
var mongoose          = require('mongoose');
var passport          = require('passport');
var passportSocketIo  = require('passport.socketio');
var socketio          = require('socket.io');
var utils             = require('techjeffharris-utils');

var config          = require('../config');
var env             = require('../env');
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
    key:            config.http.session.key,
    passport:       passport,
    secret:         config.http.session.secret, 
    store:          data.getSessionStore(),
    fail:           function (data, message, error, next) {
      debug('socket.io auth err:', message);
      next(new Error(message));
    }
  };

  // start the realtime layer
  this.start = function (done) {

    this.emit('starting');

    // if a function was provided
    if (typeof done === 'function') {
      // create a one-time handler for the 'started' event
      this.once('started', done);
    }

    debug('starting');

    // in-memory operating cache to reduce database calls
    state = {
      // conversations keyed by their _id
      convos: {},
      // sockets keyed by their user's username
      sockets: {},
      // users keyed by their username
      users: {}
    };

    http.on('newUser', function newUser (username, userCached) {
      data.user.findOne({ username: username}, '_id username privacy', function (err, user) {
        if (err) return userCached(err);

        debug('user', user);

        state.users[username] = user;

        user.getFriends({ projection: '_id username privacy'}, function (err, friends) {
          if (err) userCached(err);
            
          // loop through the user's friends
          friends.forEach(function (friend) {

            // add each friend to the user's friends list
            state.users[username].friends.push(friend.username);

          });                

          debug('state.users[' + username + ']', state.users[username]);

          userCached();

        });
      });
    });

    async.parallel({
      convos: function (done) {
        // get all conversations from the database
        data.conversation.find(function (err, convos) { 
          if (err) return done(err)

          convos.forEach(function (convo) {
            state.convos[convo._id] = convo;
          });

          done();
        });
      },
      users: function (done) {
        // get all users from the database, only get their _id, username, and privacy settings
        data.user.find({}, '_id username privacy', function (err, users) { 
          if (err) return done(err)

          // asyncly loop through the users
          async.each(users, function (user, next) {
            // add each user to the cache
            state.users[user.username] = user;

            // get a list of this user's friends
            user.getFriends({ projection: 'username'}, function (err, friends) {
              if (err) next(err);
                
              // loop through the user's friends
              friends.forEach(function (friend) {

                // add each friend to the user's friends list
                state.users[user.username].friends.push(friend.username);

              });                
            
              next();
            });
          }, function (err) {
            if (err) return done(err);
            done();
          });
        });
      }

    }, function (err, results) {
      if (err) self.emit('error', err);

      debug('state', state);
      debug('started');

      // create socket.io server from server started by http module
      io = socketio(http.server)
        // setup passport.socketio authorization for sockets
        .use(passportSocketIo.authorize(authOptions))
        // handle each socket connection
        .on('connect', socketConnect);

      // tell the transport layer that the realtime module is ready!
      self.emit('started'); 

    });
  };

  // stop the realtime module
  this.stop = function (done) {
    // if done is a function
    if (typeof done === 'function') {
      // set a one-time handler for 'stopped'
      this.once('stopped', done);
    }

    debug('stopping');

    // tell every connected socket that the server is shutting down
    io.emit('shutdown');

    delete state.convos;
    delete state.users;
    
    debug('stopped');
  
    // tell the transport layer that the realtime module has stopped
    this.emit('stopped');
  };

  // when a socket connects 
  function socketConnect (socket) {

    debug('socket connect');

    // convenience vars 
    var username = socket.request.user.username;
    
    // if the user is logged on
    if (online(username)) {
      // if the user is pending logoff (disconnected within the last second)
      if (state.users[username].logoffTimeout) {
        // prevent a logoff event if pending
        clearTimeout(state.users[username].logoffTimeout);
      }

    // if the user is NOT logged on
    } else {

      // make sure the user exists
      if (!state.users[username]) {
        socket.emit('error', new Error(self.ERROR_USER_NOT_FOUND));
      }

      logon(username);
      
      debug('state.users[' + username + ']', state.users[username]);

    }

    // set socket.user to reference state.users[username]
    socket.user = state.users[username];

    // add the socketId to this user's cache
    state.sockets[username].push(socket.id);

    // loop through all convos
    for (var convoId in state.convos) {

      // save a convenience ref to the convo
      var convo = state.convos[convoId];

      // if the user may join the convo and they haven't already
      if (convo.mayJoin(username) && !convo.isMember(username)) {
        // join the user to the conversation
        joinConvo(username, convoId);
      }
    }

    // join each user to their friends' event feeds
    socket.user.friends.forEach(function (username) {
      socket.join(username);
    });

    // initialize their socket
    initSocket(socket);
  };

  // this function add event handlers to a given socket.
  function initSocket (socket) {

    /////////////////////////////////
    // initialization debug output //
    /////////////////////////////////

    debug('state', state);
    debug('socket.user', socket.user);
    debug('socket.user.friends', socket.user.friends);
    debug('socket.user.convos', socket.user.convos);
    debug('state.sockets', state.sockets);

    ///////////////////////////////////////
    // socket.io reserved event handlers //
    ///////////////////////////////////////

    socket.on('error', function socketError (err) {
      debug('socket error: ', err);
      console.trace(err);
    });

    socket.on('disconnect', function socketDisconnect () {
      // remove this socket's id from state.sockets
      var index = state.sockets[socket.user.username].indexOf(socket.id);
      state.sockets[socket.user.username].splice(index, 1);

      debug('user ' + socket.user.username + ' socket ' + socket.id + ' disconnected');
      debug('state.sockets[socket.user.username]', state.sockets[socket.user.username]);

      // if that was their last socket
      if (state.sockets[socket.user.username].length === 0) {

        // set a timeout for 1 second to log the user off.
        // if they logon within 1 second (i.e. page refresh), the timeout
        // will be cleared and they won't get logged off
        socket.user.logoffTimeout = setTimeout(function logoffTimeout () {
          socket.user.logoffTimeout = null;

          // loop through conversations this user has joined
          for (var convoId in socket.user.convos) {

            // remove the user from the conversation
            leaveConvo(socket.user.username, convoId);
          }; 

          // logoff the user
          logoff(socket.user.username);
          
        }, 1000);

      }
    });

    /////////////////////////////////////
    // friend request related handlers //
    /////////////////////////////////////

    // whent the client emits the 'requests:send' event
    socket.on('requests:send', function (requestedUsername, done) {
      
      // get the requested user 
      var requested = state.users[requestedUsername];

      // if the user doesn't exist, then pass an error to the callback
      if (!requested) return done(new Error(self.ERROR_USER_NOT_FOUND));

      // if the requested user allows the requester to send a friend request
      requested.consents(socket.user._id, 'friendRequest', function (err, consent) {
        if (err) return done(err);

        // if the requested user does not give consent, we won't send the request
        if (!consent) return done(null, new Error(self.ERROR_NOT_ALLOWED));

        // send the friend
        socket.user.friendRequest(requested._id, function (err, request) {
          if (err) return done(err);

          // notify the requester that the request was sent
          notify(socket.user.username, 'requests:sent', request);

          // if the requested user is online notify them too
          if (state.users[requested.username]) {
            notify(requested.username, 'requests:received', request);
          }

          // pass the request to the socket that initiated it.
          done(null, request);
        });
      });
    });

    socket.on('requests:accept', function (requesterUsername, done) {

      // get the requester
      var requester = state.users[requesterUsername];

      // if the requester doesn't exist, then pass an error to the callback
      if (!requester) return done(new Error(self.ERROR_USER_NOT_FOUND));

      // make sure the request exists
      data.user.getFriendship(socket.user._id, requester._id, function  (err, request) {
        if (err) return done (err);
        if (!request) return done(new Error(self.ERROR_REQUEST_NOT_FOUND));

        socket.user.acceptRequest(requester._id, function (err, friendship) {
          if (err) return done(err);

          // add the users to each other's hash of friends
          state.users[socket.user.username].friends.push(requester.username);
          state.users[requester.username].friends.push(socket.user.username);

          // subscribe each user to the other's feed
          subscribe(socket.user.username, requester.username);
          subscribe(requester.username, socket.user.username);

          // notify each user that the request was accepted
          notify(socket.user.username, 'requests:accepted', friendship);
          notify(requester.username, 'requests:accepted', friendship);

          done(null, friendship);
        });
      });
    });

    socket.on('requests:cancel', function (requestedUsername, done) {

      // get the requested user 
      var requested = state.users[requestedUsername];

      // if the user doesn't exist, then pass an error to the callback
      if (!requested) return done(new Error(self.ERROR_USER_NOT_FOUND));

      // make sure the request exists
      data.user.getFriendship(socket.user._id, requester._id, function  (err, request) {
        if (err) return done (err);
        if (!request) return done(new Error(self.ERROR_REQUEST_NOT_FOUND));

        socket.user.cancelRequest(requester._id, function (err, results) {
          if (err) return done(err);

          // make canceling sneaky; only notify the user that canceled the request
          notify(socket.user.username, 'requests:canceled', request);
          
          done(null, request);
        });
      });
    });

    
    socket.on('requests:deny', function (requesterUsername, done) {

      // get the requester
      var requester = state.users[requesterUsername];

      // if the requester doesn't exist, then pass an error to the callback
      if (!requester) return done(new Error(self.ERROR_USER_NOT_FOUND));

      // make sure the request exists
      data.user.getFriendship(socket.user._id, requester._id, function  (err, request) {
        if (err) return done (err);
        if (!request) return done(new Error(self.ERROR_REQUEST_NOT_FOUND));

        socket.user.denyRequest(requester._id, function (err, friendship) {
          if (err) return done(err);

          // make denying sneaky; only notify the user that denied the request
          notify(socket.user.username, 'requests:denied', friendship);
          
          done(null, friendship);
        });
      });
    });


    socket.on('requests:get', function (done) {
      socket.user.getRequests(null, 'username', done);
    });

  /////////////////////////////
  // friend related handlers //
  /////////////////////////////

    socket.on('friends:get', function (done) {

      var friends = {};

      socket.user.friends.forEach(function (username) {
        if (state.users[username]) {
          friends[username] = state.users[username]
        }
      });

      done(null, friends);

    });
    
    socket.on('friends:unfriend', function (friendUsername, done) {

      var friend = state.users[friendUsername];

      if (!friend) return done(err);

      if (socket.user.friends.indexOf(friend.username)) {
        socket.user.endFriendship(friend._id, function (err, result) {
          if (err) return done (err);

          var index = state.users[socket.user.username].friends.indexOf(friend.username);
          // remove the non-friend from the user's hash of friends
          state.users[socket.user.username].friends.splice(index, 1);

          var index = state.users[friend.username].friends.indexOf(socket.user.username);
          // remove the non-friend from the user's hash of friends
          state.users[friend.username].friends.splice(index, 1);
          
          // unsubscribe the users from each other's activity feeds
          unsubscribe(socket.user.username, requestedUser.username);
          unsubscribe(requestedUser.username, socket.user.username);

          // make-unfriending sneaky; only notify the user that unfriended
          notify(username, 'friends:unfriended', requestedUser);

          done(null, result);
        });
        
      }
      
      
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

      debug('updates to '+socket.user.username+"'s profile", updates);

      var updatesToUser = { profile: updates };

      data.user.findByIdAndUpdate(username, updatesToUser, function(err, updatedUser) {
        if (err) return done(err);
        
        socket.user.profile = updates;
        done(null, updatedUser);
      });
    });

    socket.on('profile:view', function (username, done) {

      data.user.findOne({username: username}, function (err, requestedUser) {
        socket.user.viewProfile(requestedUser, done);
      });
    });

    //////////////////////
    // privacy handlers //
    //////////////////////

    socket.on('privacy:update', function (updates, done) {
      if ('function' !== typeof done) {
        done = function () {};
      }

      debug('updates to '+socket.user.username+"'s privacy:", updates);

      var updatesToUser = { privacy: updates };

      data.user.findByIdAndUpdate(user, updatesToUser, function(err, updatedUser) {
        if (err) return done(err);
        
        socket.user.privacy = updates;
        done(null, updatedUser);
      });
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
    
      socket.user.search(findParams, done);
    });

    socket.on('users:online', function () {
      socket.emit('users:online', getOnlineFriends());
    });

  ///////////////////////////
  // conversation handlers //
  ///////////////////////////

    // get conversations related to the user (started or invited)
    socket.on('convos:get', function (done) {

      var conditions = { _id: {'$in': socket.user.convos} };

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
        return done (new Error(self.ERROR_INVALID_INVITEES));
      }

      // make sure the invitees allow the user to invite them
      invitees.forEach(function (invitee) {

      });

      debug(socket.user.username + ' wants to start a conversation with ' + invitees.join(', '));

      debug('invitees', invitees);

      // create the conversation document
      var conversation = new data.conversation({
        starter: username,
        invitees: invitees
      }).save(function (err, savedConversation) {
        if (err) return done(err);

        state.convos[conversation._id] = conversation;
        
        state.convos.members.push(username);
        socket.user.convos[conversation._id] = state.convos[conversation._id];
      
        // join this socket to the conversation 
        subscribe(username, convoId);

      });
    });

    // end a conversation
    socket.on('convos:end', function (convoId, done) { 

      if (!state.convos[convoId]) {
        return done(new Error(self.ERROR_CONVO_NOT_FOUND));
      }

      // only the conversation starter is allowed to end conversations
      if (!state.convos[convoId].starter.equals(username)) {
        return done(new Error(self.ERROR_NOT_ALLOWED));
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
      if (convo.isStarter(username) || convo.isInvited(username)) {
        io.in(convoId).emit('convos:text', {
          convoId: convoId,
          username: username,
          message: message,
          date: Date.now()
        });

        return done();
      } else {
        return done(new Error(self.ERROR_NOT_ALLOWED));
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
      publish(convoId, 'convos:binary:incoming', convoId, username, transfer);

    });

    socket.on('convos:binary:chunk', function (convoId, transferId, fileId, chunkId, chunk) {

      try {

        // confirm with the sending socket that this chunk was received (don't send the chunk)
        socket.emit('convos:binary:chunk', convoId, username, transferId, fileId, chunkId);

        // send the chunk to all sockets (except the sending socket) who were 
        // connected when the transfer was initialized. 
        socket.broadcast.to(transferId).emit('convos:binary:chunk', convoId, username, transferId, fileId, chunkId, chunk);
        
        // track the progress of the transfer by calling the chunk function
        state.convos[convoId].transfers[transferId].chunk(fileId, chunkId, chunk);

      }

      catch (err) {
        publish(transferId, 'convos:binary:error', {transferId: transferId, error: err });
      }
    });

    socket.on('account:delete', function (done) {
      debug('account:delete', socket.user.username);

      var username = socket.user.username;

      //  leave any conversations
      socket.user.convos.forEach(function (convoId) {
        leaveConvo(username, convoId);
      });

      // remove from cache
      delete state.users[username];

      // remove from db
      socket.user.remove(function (err, results) {
        if (err) return done(err);
        debug('looks like I got removed!');
        done();

        // disconnect all sockets
        state.sockets[username].forEach(function (socketId) {
          io.connected[socketId].disconnect();
        });
      });
    });

    socket.emit('ready', socket.user);

  };

  function online (username) {
    return (state.sockets[username]);
  }

  function logon (username) {
    debug(username + ' logged on');
    // create a list of sockets for this user
    state.sockets[username] = []
    publish(username, 'friends:logon', username);
  }

  function logoff (username) {

    debug(username + 'logged off');
    publish(username, 'friends:logoff', username);

    // remove the username
    delete state.sockets[username];
  }

  // get a list of distinct friends of the user's friends
  function getFriendsOfFriends (username) {

    var friendsOfFriends = [];

    var user = state.users[username];

    user.friends.forEach(function (friendUsername) {
      if (state.users[friendUsername]) {
        state.users[friendUsername].friends.forEach(function (friendUsernameOfFriend) {
          // if the friendOfFriend is not one of the user's friends
          if (!~user.friends.indexOf(friendUsernameOfFriend)
              // and if the friendOfFriend hasn't already been found
              && !~friendsOfFriends.indexOf(friendUsernameOfFriend)) {
            friendsOfFriends.push(friendUsernameOfFriend);
          }
          
        });
      }
    });

    return friendsOfFriends;
  }

  function getOnlineFriends (username) {
    var onlineFriends = [];

    state.users[username].friends.forEach(function (friendUsername) {
      if (online(friendUsername)) {
        onlineFriends.push(friendUsername);
      }
    });

    return onlineFriends;
    
  };

  function joinConvo (username, convoId) {

    // add the username to hash of users that have joined this convo
    state.convos[convoId].members.push(username);

    // add the convo to the user's hash of convos
    state.users[username].convos.push(convoId);

    // tell everyone in the conversation that this user has joined
    publish(convoId, 'convos:entered', { convo: convoId, user: username });

    // subscribe this user to the convo's event feed
    subscribe(username, convoId);

  };

  function leaveConvo (username, convoId) {
    // unsubscribe the user from the convo's event feed
    unsubscribe(username, convoId);

    // notify the convo that the user has left
    publish(convoId, 'convos:exited', { convo: convoId, user: username });

    // remove the username from the convos members list
    var index = state.convos[convoId].members.indexOf(username);
    state.convos[convoId].members.splice(index, 1);

    // remove the convo from the user's convos list
    var index = state.users[username].convos.indexOf(convoId);
    state.users[username].convos.splice(index, 1);

  };

  function notify (username, name, params) {
    state.users[username].socketIds.forEach(function (socketId) {
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
    state.users[subscriber].socketIds.forEach(function (socketId) {
      io.connected[socketId].leave(feed);
    });
  };


};

OffTheRecord_realtime.prototype = new events.EventEmitter();

OffTheRecord_realtime.prototype.ERROR_NOT_ALLOWED       = 'you are not allowed to join this conversation.';
OffTheRecord_realtime.prototype.ERROR_CONVO_NOT_FOUND   = 'conversation found found';
OffTheRecord_realtime.prototype.ERROR_REQUEST_NOT_FOUND = 'request not found';
OffTheRecord_realtime.prototype.ERROR_USER_NOT_FOUND    = 'user not found';
OffTheRecord_realtime.prototype.ERROR_INVALID_INVITEES  = 'invitees must be an array!';

module.exports = OffTheRecord_realtime;
