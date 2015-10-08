
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
      // conversations keyed by their id
      convos: {},
      // sockets keyed by their user's username
      sockets: {},
      // users keyed by their username
      users: {}
    };

    http.on('newUser', function newUser (username, userCached) {
      data.user.findOne({ username: username}, '_id username privacy convos friends requests', function (err, user) {
        if (err) return userCached(err);

        debug('user', user);

        state.users[username] = user;

        userCached();
      });
    });

    async.parallel({
      convos: function (done) {
        // get all conversations from the database
        data.conversation.find(done);
      },
      users: function (done) {
        // get all users from the database, only get their id, username, and privacy settings
        data.user.find({}, '_id username privacy convos friends requests', done);
      }
    }, function (err, results) {
      if (err) self.emit('error', err);

      results.convos.forEach(function (convo) {
        state.convos[convo.id] = convo;
      });

      results.users.forEach(function (user) { 
        // add each user to the cache
        state.users[user.username] = user;
      });

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

      debug(username + ' logged on');

      // create a list of sockets for this user
      state.sockets[username] = []
      
      publish(username, 'friends:logon', username);

    }

    // set socket.user to reference state.users[username]
    socket.user = state.users[username];

    // add the socketId to this user's cache
    state.sockets[username].push(socket.id);

    // join each user to their friends' event feeds
    socket.user.friends.forEach(function (username) {
      socket.join(username);
    });

    debug(username + '\'s state:', getStateByUsername(username));

    // unset the username property to prevent confusion.  
    // from here on out, we access socket.user username
    username = undefined;

    ///////////////////////////////////////
    // socket.io reserved event handlers //
    ///////////////////////////////////////

    socket.on('error', socketError);
    socket.on('disconnect', socketDisconnect);

    ///////////////////////////
    // conversation handlers //
    ///////////////////////////

    socket.on('convos:get',           convosGet);
    socket.on('convos:start',         convosStart);
    socket.on('convos:end',           convosEnd);
    socket.on('convos:join',          convosJoin);
    socket.on('convos:boot',          convosBoot);
    socket.on('convos:invite',        convosInvite);
    socket.on('convos:text',          convosText);
    socket.on('convos:binary:init',   convosBinaryInit);
    socket.on('convos:binary:chunk',  convosBinaryChunk);

    /////////////////////////////
    // friend related handlers //
    /////////////////////////////

    socket.on('friends',              friends);
    socket.on('friends:unfriend',     friendsUnfriend);

    /////////////////////////////////////
    // friend request related handlers //
    /////////////////////////////////////

    // whent the client emits the 'requests:send' event
    socket.on('requests:send',        requestsSend);
    socket.on('requests:accept',      requestsAccept);
    socket.on('requests:cancel',      requestsCancel);
    socket.on('requests:deny',        requestsDeny);
  
    //////////////////////
    // privacy handlers //
    //////////////////////

    socket.on('privacy:update',       privacyUpdate);
    
    //////////////////////
    // profile handlers //
    //////////////////////

    socket.on('profile:update',       profileUpdate);
    socket.on('profile:view',         profileView);

    //////////////////////
    // search for users //
    //////////////////////

    socket.on('users:delete',         usersDelete);
    socket.on('users:search',         usersSearch);
    socket.on('users:online',         usersOnline);
    socket.on('users:permissions',    usersPermissions);

    socket.emit('ready', socket.user);

    function convosBinaryChunk (convoId, transferId, fileId, chunkId, chunk) {

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
    };

    function convosBinaryInit (convoId, filesInfo, ready) {

    // send a file to a conversation

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

    };

    // boot a user from a conversation
    function convosBoot (convoId, user, done) {

      // remove the user from conversation.invitees
      // 
      // make all of the booted user's sockets leave the room
      // 
      
      

    };

    function convosEnd (convoId, done) { 

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

    };

    function convosGet (done) {

      var convos = [];

      socket.user.convos.forEach(function (convoId) {
        convos.push(state.convos[convoId]);
      });

      done(null, conversations);

    };

    // invite one ore more users to an existing conversation
    function convosInvite (convoId, invitees, done) {

      // var conversation = state.convos[convoId];

      // if (conversation.convo.isStarter)

      // if (!Array.isArray(invitees)) {
      //   if (invitees instanceof mongoose.Schema.Types.ObjectId) {

      //   }
      // } 

    };

    function convosJoin (convoId, username, done) {

        // add the convo to the user's hash of convos
      state.users[username].convos.push(convoId);

      
    };

    function convosStart (invitees, done) {

      if (!Array.isArray(invitees) || invitees.length === 0) {

        return done (self.ERROR_INVALID_INVITEES);
      }

      debug('invitees before checking privacy', invitees);

      // make sure the invitees allow the user to invite them
      invitees.forEach(function (invitee, key) {
        state.users[invitee].may(socket.user, 'startConversation', function (err, answer) {
          if (err) return done(err);

          if (!answer) {
            var index = invitees.indexOf(invitee);
            invitees.splice(index, 1);
          } else {
            invitees[key] = state.users[invitee].id;
          }
        });
      });

      debug(socket.user.username + ' wants to start a conversation with ' + invitees.join(', '));

      debug('invitees', invitees);

      // create the conversation document
      var conversation = new data.conversation({
        starter: username,
        invitees: invitees
      }).save(function (err, savedConversation) {
        if (err) return done(err);

        debug('savedConversation', savedConversation);

        state.convos[conversation.id] = conversation;
        
        state.convos.members.push(username);
        socket.user.convos.push(conversation.id);
      
        // join this socket to the conversation 
        subscribe(username, convoId);

        savedConversation.populate('starter invitees', 'username', function (populatedConvo) {
          invitees.forEach(function (invitee) {
            notify(invitee, 'convos:invited', populatedConvo);
          });
        })
      });
    };

    function convosText (convoId, message, done) {

    // send a message to a conversation

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
   
    };

    function friends (done) {

      debug('friends - ' + socket.user.username);

      var permissions = {};

      debug('socket.user.friends', socket.user.friends);

      async.parallel({
        friends: function (next) {
          usersPermissions(socket.user.friends, next);
        },
        sent: function (next) {
          usersPermissions(socket.user.requests.sent, next);
        },
        received: function (next) {
          usersPermissions(socket.user.requests.received, next);
        }
      }, function (err, permissions) {
        if (err) return done(err);

        debug('permissions', permissions);

        done(null, permissions);
      });
    };

    function friendsUnfriend (friendUsername, done) {

      debug(socket.user.username + ' wants to unfriend ' + friendUsername);

      var friend = state.users[friendUsername];

      debug('friend', friend);

      if (!friend) return done(err);

      if (~socket.user.friends.indexOf(friend.username)) {

        debug('found ' + friendUsername + ' in ' + socket.user.username + '\'s friends list');

        socket.user.endFriendship(friend.id, function (err, result) {
          if (err) return done (err);

          var index = socket.user.friends.indexOf(friend.username);
          // remove the non-friend from the user's hash of friends
          socket.user.friends.splice(index, 1);

          debug(socket.user.username + '.friends', socket.user.friends);

          var index = friend.friends.indexOf(socket.user.username);
          // remove the non-friend from the user's hash of friends
          friend.friends.splice(index, 1);

          debug(friend.username + '.friends', friend.friends);

          async.parallel({
            saveSocketUser: function (finished) {
              socket.user.save(finished);
            },
            saveFriend: function (finished) {
              friend.save(finished);
            }
          }, function (err, results) {
            if (err) return done(err);
            
            // unsubscribe the users from each other's activity feeds
            unsubscribe(socket.user.username, friend.username);
            unsubscribe(friend.username, socket.user.username);

            var toNotify = [socket.user.username, friend.username];

            notify(toNotify, 'friends:unfriended', socket.user.username, friend.username);
            
            done(null, friend.username);
          });
          
        });
      } else {
        debug('did not find ' + friend.username + ' in ' + socket.user.username + '\'s friends list!');
        done(new Error(self.ERROR_NOT_ALLOWED));
      }

    };

    function privacyUpdate(updates, done) {
      if ('function' !== typeof done) {
        done = function () {};
      }

      debug('updates to '+socket.user.username+"'s privacy:", updates);

      var conditions = { username: socket.user.username };
      var updatesToUser = { privacy: updates };

      data.user.findOneAndUpdate(conditions, updatesToUser, function (err, updatedUser) {
        if (err) return done(err);
        
        socket.user.privacy = updates;
        done(null, updatedUser);
      });
    };

    function profileUpdate (updates, done) {  
      if ('function' !== typeof done) {
        done = function () {};
      }

      debug('updates to '+socket.user.username+"'s profile", updates);

      var conditions = { username: socket.user.username };
      var updatesToUser = { profile: updates };

      data.user.findOneAndUpdate(conditions, updatesToUser, function(err, updatedUser) {
        if (err) return done(err);
        
        socket.user.profile = updates;
        done(null, updatedUser);
      });
    };

    function profileView (username, done) {

      data.user.findOne({username: username}, function (err, requestedUser) {
        socket.user.viewProfile(requestedUser, done);
      });
    }

    function requestsAccept (requesterUsername, done) {

      // get the requester
      var requester = state.users[requesterUsername];

      // if the requester doesn't exist, then pass an error to the callback
      if (!requester) return done(new Error(self.ERROR_USER_NOT_FOUND));

      // make sure the request exists
      data.user.getFriendship(socket.user.id, requester.id, function  (err, request) {
        if (err) return done (err);
        if (!request) return done(new Error(self.ERROR_REQUEST_NOT_FOUND));

        socket.user.acceptRequest(requester.id, function (err, friendship) {
          if (err) return done(err);

          // remove the requester's username from the user's received requests list 
          var index = socket.user.requests.received.indexOf(requester.username);
          socket.user.requests.received.splice(index, 1);

          // remove the user's username from the requester's received request list
          index = requester.requests.sent.indexOf(socket.user.username);
          requester.requests.sent.splice(index, 1);

          // add the users to each other's hash of friends
          state.users[socket.user.username].friends.push(requester.username);
          state.users[requester.username].friends.push(socket.user.username);

          async.parallel({ 
            requester: function (finished) {
              requester.save(finished);
            },
            requested: function (finished) {
              socket.user.save(finished);
            },
            populateFriendship: function (finished) {
              request.populate({
                path: 'requester requested',
                select: '_id username',
              }, finished);
            }
          }, function (err, results) {
            if (err) return done(err);

            // subscribe each user to the other's feed
            subscribe(socket.user.username, requester.username);
            subscribe(requester.username, socket.user.username);

            debug(socket.user.username + ' accepted ' + requester.username + '\' friend request');

            debug(socket.user.username + '.requests', socket.user.requests);
            debug(socket.user.username + '.friends', socket.user.friends);

            debug(requester.username + '.requests', requester.requests);
            debug(requester.username + '.friends', requester.friends);

            var toNotify = [socket.user.username, requester.username];

            // notify each user that the request was accepted
            notify(toNotify, 'requests:accepted', results.populateFriendship);

            done(null, friendship);
          });
        });
      });
    };

    function requestsCancel (requestedUsername, done) {

      // get the requested user 
      var requested = state.users[requestedUsername];

      // if the user doesn't exist, then pass an error to the callback
      if (!requested) return done(new Error(self.ERROR_USER_NOT_FOUND));

      // make sure the request exists
      data.user.getFriendship(socket.user.id, requested.id, function  (err, request) {
        if (err) return done (err);
        if (!request) return done(new Error(self.ERROR_REQUEST_NOT_FOUND));

        socket.user.cancelRequest(requested.id, function (err, results) {
          if (err) return done(err);


          var index = socket.user.requests.sent.indexOf(requested.username);
          socket.user.requests.sent.splice(index, 1);

          index = requested.requests.received.indexOf(socket.user.username);
          requested.requests.received.splice(index, 1);

          async.parallel({ 
            requester: function (finished) {
              socket.user.save(finished);
            },
            requested: function (finished) {
              requested.save(finished);
            },
            populateRequest: function (finished) {
              request.populate({
                path: 'requester requested',
                select: '_id username',
              }, finished);
            }
          }, function (err, results) {
            if (err) return done(err);

            debug(socket.user.username + ' canceled their friend request to ' + requested.username);

            debug(socket.user.username + '.requests', socket.user.requests);
            debug(requested.username + '.requests', requested.requests);

            var toNotify = [socket.user.username, requested.username];

            notify(toNotify, 'requests:canceled', results.populateRequest);
            
            done(null, request);
          });

        });
      });
    };

    function requestsDeny (requesterUsername, done) {

      // get the requester
      var requester = state.users[requesterUsername];

      // if the requester doesn't exist, then pass an error to the callback
      if (!requester) return done(new Error(self.ERROR_USER_NOT_FOUND));

      // make sure the request exists
      data.user.getFriendship(socket.user.id, requester.id, function  (err, request) {
        if (err) return done (err);
        if (!request) return done(new Error(self.ERROR_REQUEST_NOT_FOUND));

        socket.user.denyRequest(requester.id, function (err, result) {
          if (err) return done(err);

          var index = socket.user.requests.received.indexOf(requester.username);
          socket.user.requests.received.splice(index, 1);

          index = requester.requests.sent.indexOf(socket.user.username);
          requester.requests.sent.splice(index, 1);

          async.parallel({ 
            requester: function (finished) {
              requester.save(finished);
            },
            requested: function (finished) {
              socket.user.save(finished);
            },
            populateRequest: function (finished) {
              request.populate({
                path: 'requester requested',
                select: '_id username',
              }, finished);
            }
          }, function (err, results) {
            if (err) return done(err);

            debug(socket.user.username + ' denied ' + requester.username + '\'s friend request');

            debug(socket.user.username + '.requests', socket.user.requests);
            debug(requester.username + '.requests', requester.requests);

            var toNotify = [socket.user.username, requester.username];

            notify(toNotify, 'requests:denied', results.populateRequest);
            
            done(null, request);
          });
        });
      });
    };

    function requestsSend(requestedUsername, done) {
      
      // get the requested user 
      var requested = state.users[requestedUsername];

      // if the user doesn't exist, then pass an error to the callback
      if (!requested) return done(new Error(self.ERROR_USER_NOT_FOUND));

      // if the requested user allows the requester to send a friend request
      requested.may(socket.user.id, 'friendRequest', function (err, consent) {
        if (err) return done(err);

        // if the requested user does not give consent, we won't send the request
        if (!consent) return done(null, new Error(self.ERROR_NOT_ALLOWED));


        // send the friend request
        socket.user.friendRequest(requested.id, function (err, request) {
          if (err) return done(err);

          // add the request to each user's list of requests sent/received
          socket.user.requests.sent.push(requested.username);
          requested.requests.received.push(socket.user.username);

          async.parallel({
            saveRequester: function (finished) {
              socket.user.save(finished);
            },
            saveRequested: function (finished) {
              requested.save(finished);
            },
            populateRequest: function (finished) {
              request.populate({
                path: 'requester requested',
                select: '_id username',
              }, finished);
            }
          },function (err, results) {
            if (err) return done(err);

            debug(socket.user.username + ' sent a friend request to ' + requestedUsername);
            
            debug(socket.user.username + '.requests', socket.user.requests);
            debug(requested.username + '.requests', requested.requests);

            // notify the requester that the request was sent
            notify(socket.user.username, 'requests:sent', requested.username);

            // if the requested user is online notify them too
            if (state.users[requested.username]) {
              notify(requested.username, 'requests:received', socket.user.username);
            }

            // pass the request to the socket that initiated it.
            done(null, results.populateRequest);
          });
        });
      });
    };

    function socketDisconnect () {
      // remove this socket's id from state.sockets
      var index = state.sockets[socket.user.username].indexOf(socket.id);
      state.sockets[socket.user.username].splice(index, 1);

      debug('user ' + socket.user.username + ' socket ' + socket.id + ' disconnected');
      debug('state.sockets[' + socket.user.username + ']', state.sockets[socket.user.username]);

      // if that was their last socket
      if (state.sockets[socket.user.username].length === 0) {

        // set a timeout for 1 second to log the user off.
        // if they logon within 1 second (i.e. page refresh), the timeout
        // will be cleared and they won't get logged off
        socket.user.logoffTimeout = setTimeout(function logoffTimeout () {
          socket.user.logoffTimeout = null;

          debug('state.users[' + socket.user.username + '].convos', socket.user.convos);

          // loop through conversations this user has joined
          socket.user.convos.forEach(function (convoId) {

            debug('convoId', convoId);

            // remove the user from the conversation
            leaveConvo(socket.user.username, convoId);
          }); 

          // logoff the user
          logoff(socket.user.username);
          
        }, 1000);

      }
    };

    function socketError (err) {
      debug('socket error: ', err);
      console.trace(err);
    };

    function usersDelete(done) {
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
    };

    function usersPermissions (usernames, done) {

      var permissions = {};

      if (!Array.isArray(usernames)) {
        usernames = [ usernames ];
      }
        
      async.each(usernames, function (username, finished) {

        state.users[username].permits(socket.user, function (err, interactions) {
          if (err)  return finished(err);

          debug('interactions', interactions);
          
          permissions[username] = interactions;

          debug('permissions', permissions);

          finished();
        });
      }, function (err) {
        if (err)  return done(err);
        else      return done(null, permissions);
      });
    };

    function usersSearch (findParams, done) {

      debug('searching for users');

      debug('findParams', findParams);

      findParams = utils.extend({}, findParams);

      findParams.conditions = utils.extend({}, findParams.conditions);
      
      var username  = findParams.conditions.username;
      findParams.conditions.username = new RegExp(username, "i");
      
      findParams.projection = '_id username privacy';
      
      debug('findParams', findParams);
    
      socket.user.search(findParams, function (err, results) {
        if (err) return done(err);

        debug('results', results);
        done(null, results);
      });
    }

    function usersOnline () {
      socket.emit('users:online', getOnlineFriends());
    }

  };

  function online (username) {
    return (state.sockets[username]);
  }

  function logoff (username) {

    debug(username + ' logged off');

    debug(username + '\'s state:', getStateByUsername(username));

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

  function getStateByUsername (username) {
    return {
      user: state.users[username],
      sockets: state.sockets[username],
    };
  };

  function joinConvo (username, convoId) {

    // add the username to hash of users that have joined this convo
    state.convos[convoId].members.push(username);

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

  function notify (usernames, eventName, eventParams) {

    if (!Array.isArray(usernames)) {
      usernames = [ usernames ];
    }

    usernames.forEach(function (username) {
      if (state.sockets[username]) {
        state.sockets[username].forEach(function (socketId) {
          io.connected[socketId].emit(eventName, eventParams);
        });
      }
    });

  }

  function publish (feed, eventName, eventParams) {
    io.to(feed).emit(eventName, eventParams);
  };

  function subscribe (subscriber, feed) {
    if (state.sockets[subscriber]) {
      state.sockets[subscriber].forEach(function (socketId) {
        io.connected[socketId].join(feed);
      });
    }
  };

  function unsubscribe (subscriber, feed) {
    if (state.sockets[subscriber]) {
      state.sockets[subscriber].forEach(function (socketId) {
        io.connected[socketId].leave(feed);
      });
    }
  };


};

OffTheRecord_realtime.prototype = new events.EventEmitter();

OffTheRecord_realtime.prototype.ERROR_NOT_ALLOWED       = 'you are not allowed to join this conversation.';
OffTheRecord_realtime.prototype.ERROR_CONVO_NOT_FOUND   = 'conversation found found';
OffTheRecord_realtime.prototype.ERROR_REQUEST_NOT_FOUND = 'request not found';
OffTheRecord_realtime.prototype.ERROR_USER_NOT_FOUND    = 'user not found';
OffTheRecord_realtime.prototype.ERROR_INVALID_INVITEES  = 'invitees must be an array!';

module.exports = OffTheRecord_realtime;
