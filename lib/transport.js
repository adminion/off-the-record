
// node core modules
var events  = require('events');
var http    = require('http');
var https   = require('https'); 
var url     = require('url');
var util    = require('util');

// off-the-record core modules
var config          = require('./config');
var env             = require('./env');
var ssl             = require('./ssl');
var utils           = require('techjeffharris-utils');
var BinaryTransfer  = require('./BinaryTransfer');
var State           = require('./state');
var TextMessage     = require('./TextMessage');

// 3rd party
var async             = require('async');
var bodyParser        = require('body-parser');
var cookieParser      = require('cookie-parser');
var debug             = require('debug')(env.package.name + ':transport');
var express           = require('express'); 
var expressSession    = require('express-session');
var flash             = require('connect-flash');
var methodOverride    = require('method-override');
var mongoose          = require('mongoose');
var passport          = require('passport');
var passportSocketIo  = require('passport.socketio');
var serveStatic       = require('serve-static');
var socketio          = require('socket.io');

module.exports = Offtherecord_transport;

function Offtherecord_transport (data) {

  var ERROR_NOT_ALLOWED       = 'you are not allowed to join this conversation.';
  var ERROR_CONVO_NOT_FOUND   = 'conversation found found';
  var ERROR_REQUEST_NOT_FOUND = 'request not found';
  var ERROR_USER_NOT_FOUND    = 'user not found';
  var ERROR_INVALID_INVITEES  = 'invitees must be an array with at least one element that must not contain the starter\'s username!';

  var self = this;

  var app;
  var clients = [];
  var io;
  var server;
  var sessionConfig;
  var state;

  this.start = function (done) {

    debug('starting');

    if (typeof done === 'function') {
      this.once('started', done);
    }

    this.emit('starting');

    state = new State();

    async.parallel({
      convos: function (done) {
        // get all conversations from the database
        data.conversation.find({}, '_id starter invitees', done);
      },
      friendships: function (done) {
        data.user.Friendship.find(done);
      },
      users: function (done) {
        // get all users from the database, only get their id, username, and privacy settings
        data.user.find({}, '_id username privacy convos friends requests', done);
      },
    }, function (err, results) {
      if (err) self.emit('error', err);

      debug('state', state);

      results.users.forEach((user) => {
        state.users.add(user);
        debug(user.username + "'s sockets: ", state.sockets.byUserId.get(user.id));
      });
      
      results.convos.forEach((convo) => {
        debug('adding convo to state: ', convo);

        debug('typeof starter', typeof convo.starter);

        state.convos.add(convo);
      });
      
      results.friendships.forEach((friendship) => {
        if (friendship.status === 'Pending') {
          state.requests.add(friendship);
        } else {
          state.friendships.add(friendship);
        }
      });

      startHttp();

    });

  };

  this.stop = function (done) {
    var self = this;

    if (typeof done === 'function') {
      this.once('stopped', done);
    }

    debug('stopping');

    this.emit('stopping');

    // tell every connected socket that the server is shutting down
    io.emit('shutdown');

    // disconnect all clients
    while (clients.length) {
      debug(clients.length + ' client(s) connected, destroying...');

      client = clients.shift();

      client.end();
    }

    server.close(function httpServerClosed () {
      debug('stopped');
      self.emit('stopped');
    });

  };

  function startHttp () {

    // create the express app
    app = express();

    app.set('port', config.http.port);
    app.set('views', 'lib/views');
    app.set('view engine', 'jade');

    // app middlewarez
    app.use(bodyParser.urlencoded({ extended: true }));
    
    app.use(cookieParser());

    // setup session configuration
    sessionConfig = config.http.session
    sessionConfig.store = data.getSessionStore();

    app.use(expressSession(sessionConfig));

    app.use(flash());

    // setup passport
    app.use(passport.initialize());
    app.use(passport.session());

    // redirect all http traffic to https
    app.all('*', function redirectSec(req, res, next) {
      if (req.headers['x-forwarded-proto'] == 'http') {
          res.redirect('https://' + req.headers.host + req.path);
      } else {
          return next();
      }
    });

    // setup local variables for use in jade templates
    app.use(function (request, response, next){
      response.locals = {
        env: env,
        links: {
          friends: '/friends',
          conversations: '/convos',
          search: '/search'
        },
        privacy: data.user.privacy,
        relationships: data.user.relationships,
        request: request
      };

      next();
    });

    app.param('username', function (request, response, next, username) {
      data.user.findOne({username: username}, 'username profile created privacy', function (err, user) {
        if (err) return next(err);

        debug('user', user);

        request.requestedUser = user;            

        next(null, user);
      });
    });

    ////////////////////////////////////////////////////////////////////////////////
    //
    //  PUBLICALLY ACCESSIBLE ROUTES
    //
    ////////////////////////////////////////////////////////////////////////////////

    app.get('/', function (request, response) {
      response.render('root');
    });

    // GET requests for /logon will respond with the logon form
    app.get('/logon', function (request, response) {
      response.render('logon', { 
        error: request.flash('error'), 
        redir: request.flash('redir')[0]
      });
    });

    // GET requests for /logoff will kill the users session and redirect to root
    app.get('/logoff', function (request, response) {
      if (request.user) {
        // console.log("[%s] %s logged out.",
        //     Date(),
        //     request.user.username);
        request.logOut();
      }

      response.redirect('/');
    });

    app.get('/register', function (request, response) {
      response.render('register', {
        err: false, 
        redir: request.flash('redir')[0] || '/profile'
      });
    });

    // POST requests for /logon will attempt to authenticate the given user
    app.post('/logon', passport.authenticate(
      'local', { 
        failureFlash: 'Authentication Failure.  Please try again.',
        failureRedirect: '/logon', 
      }), function (request, response) {

      var redir = request.body.redir || '/profile'

      response.redirect(redir);
    });

    app.post('/register', function (request, response) {
      
      // define the new user
      var newUser = {
        username: request.body.username,
        profile: {
          firstName : request.body.firstName, 
          lastName : request.body.lastName
        }
      };

      if (request.body.password !== request.body.verifyPassword) {
        response.render('register', {
          request :   request, 
          err: 'Passwords do not match!'
        });
      } else {
        data.user.register(newUser, request.body.password, function onceRegistered (err, user) {
          if (err) return fiveHundred(err, request, response);
          
          // add the new user to the state
          state.users.add(user);

          response.redirect('/profile');
        });
      }

    }); 

    
    ////////////////////////////////////////////////////////////////////////////////
    //
    //  ROUTES REQUIRING AUTHENTICATION
    //
    ////////////////////////////////////////////////////////////////////////////////

    app.get('/home', verifySession, function (request, response) {
      response.render('home');
    });

    app.get('/profile', verifySession, function (request, response) {
       response.render('profile');
    });

    app.get('/profile/:username', verifySession, function (request, response) {
      debug('request.user', request.user);
      debug('request.profile', request.profile);

      request.requestedUser.may(request.user, 'profile', function (err, consent) {
        if (err) {
          fiveHundred(err, request, response);
        } else if (consent) {
          response.render('user');
        } else {
          response.render('errors/404');
        }
      });
    });

    app.get('/search', verifySession, function (request, response) {
      response.render('search');
    });

    app.get('/convos', verifySession, function (request, response) {
      response.render('convos');
    });

    // GET requests for /convos/:convoID will verifySession, then attempt to connect
    app.get('/convos/:convoID', verifySession, function (request, response) {
      response.render('convo'); 
    });

    app.get('/friends', verifySession, function (request, response) {
      response.render('friends');
    });

    app.get('/friend-requests', verifySession, function (request, response) {
      response.render('requests');
    });

    app.get('/friend-requests/:requestId', verifySession, function (request, response) {
      response.render('request')
    });

    app.get('/online', verifySession, function (request, response) {
      throw new Error('setup online friends request');
    });

    ////////////////////////////////////////////////////////////////////////////////
    //
    //  OTHER REQUESTS
    //
    ////////////////////////////////////////////////////////////////////////////////

    // serve static content if no routes were found
    app.use(express.static('lib/static'));

    // render 404 if a static file is not found
    app.use(function (request, response) {

      debug('request.session', request.session);

      response.render('errors/404');
    });
    

    // create the ssl-enabled http server instance
    server = https.createServer(ssl.data, app )

    /** 
     *  The nature of the server causes clients to stay connected via socket.io.
     * When we close an node-https server, it waits for connections to close before 
     * un-refing the server allowing the process to exit.  We can force a closure 
     * by storing clients in an array as they connect and issuing a .destroy() 
     * command when its time to shutdown the server.
     *
     * @see: OffTheRecord_http.stop() 
     */ 
    server.on('connection', function (client) {
      debug('client connection');
      clients.push(client);

      client.on('close', function () {
        debug('client closed');
        var index = clients.indexOf(client);
        clients.splice(index, 1);
      });
    });

    server.on('closed', function () {
      self.emit('stopped');
    });

    server.once('listening', startRealtime);

    server.listen(config.http.port, config.http.host || undefined );

    ////////////////////////////////////////////////////////////////////////////////
    //
    //  ROUTE HANDLERS
    //
    ////////////////////////////////////////////////////////////////////////////////

    function fiveHundred (err, request, response) {
      console.trace(err);
      response.render('errors/500', { err: err });
    };    

    function verifySession (request, response, next) {
      if (request.isAuthenticated()) {
        debug ('request.user', request.user);
        debug('%s has authenticated', request.user.username);
        return next();

      } else  {
        debug('client has NOT authenticated');

        var redir = request.url;
        debug('redir', redir);

        request.flash('redir', redir);
        request.flash('error', 'You need to logon before you can visit ' + redir );
        
        response.redirect('/logon');
      }
    };
  };

  function startRealtime () {

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

    // create socket.io server from server started by http module
    io = socketio(server)
      // setup passport.socketio authorization for sockets
      .use(passportSocketIo.authorize(authOptions))
      // handle each socket connection
      .on('connect', socketConnect);

    debug('started');

    self.emit('started'); 

    // when a socket connects 
    function socketConnect (socket) {

      ///////////////////////////////////////
      // socket.io reserved event handlers //
      ///////////////////////////////////////

      // socket.on('error', socketError);
      socket.on('disconnect', socketDisconnect);

      debug('socket connect');

      // get the user from cache 
      socket.user = state.users.get(socket.request.user.id.toString());

      // make sure the user is not undefined
      if (!socket.user) {
        return socket.emit('error', new Error(ERROR_USER_NOT_FOUND));
      }

      // if the user is logged on
      if (online(socket.user.id)) {

        // if the user is pending logoff (disconnected within the last second)
        if (socket.user.logoffTimeout) {
          // cancel pending logoff
          clearTimeout(socket.user.logoffTimeout);
          socket.user.logoffTimeout = null;
        }

      // if the user is NOT logged on
      } else {

        debug(socket.user.username + ' logged on');

        publish(socket.user.id, 'friends:logon', socket.user.username);

      }

      // add the socketId to this user's cache
      state.sockets.add(socket.user.id, socket.id);

      // join user to their friends' event feeds
      socket.user.friends.forEach((userId) => socket.join(userId));

      // join user to their convos' event feeds
      state.convos.byUserId.get(socket.user.id).forEach((userId) => socket.join(userId));

      debug(socket.user.username + '\'s state:', state.users.get(socket.user.id));
      debug(socket.user.username + '\'s sockets:', state.sockets.byUserId.get(socket.user.id));

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
      socket.on('friends:online',       friendsOnline);
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
      socket.on('users:permissions',    usersPermissions);

      socket.emit('ready', socket.user);

      function convosBinaryChunk (convoId, transferId, fileId, chunkId, chunk) {

        try {

          // confirm with the sending socket that this chunk was received (don't send the chunk)
          socket.emit('convos:binary:chunk', convoId, username, transferId, fileId, chunkId);

          // send the chunk to all sockets (except the sending socket) who were 
          // connected when the transfer was initialized. 
          socket.broadcast.to(transferId).emit('convos:binary:chunk', convoId, socket.user.username, transferId, fileId, chunkId, chunk);
          
          // track the progress of the transfer by calling the chunk function
          state.transfers.get(transferId).chunk(fileId, chunkId, chunk);

        }

        catch (err) {
          publish(transferId, 'convos:binary:error', {transferId: transferId, error: err });
        }
      }; // convosBinaryChunk

      function convosBinaryInit (convoId, filesInfo, ready) {

      // send a file to a conversation

        debug('request to transfer %s files: ', filesInfo.length);

        var convo = state.convos.get(convoId);

        // create a new BinaryTransfer instance for the given filesInfo
        var transfer = new BinaryTransfer(filesInfo);
        
        // save the transfer to the conversation's list of active transfers
        convo.transfers.set(transfer.id, transfer);

        // subscribe all current members of the conversation to this transfer's id.
        // this ensures that members that join in the middle of the transfer won't 
        // get a partial transfer
        convo.members.forEach(function (member) {
          subscribe(member, transfer.id);
        });

        // when the transfer has finished
        transfer.on('complete', function () {
          // unsubscribe users from the transfer now that its done
          unsubscribe(convo.members, transfer.id);

          // delete the transfer
          transfer = undefined;

          // remove the transfer.id key from the conversation's list of transfers
          convo.transfers.delete(transfer.id);
        });
        
        debug('transfer %s ready', transfer.id);

        // tell all users in the conversation that there is an incoming binary transfer
        publish(convoId, 'convos:binary:incoming', convoId, socket.user.username, transfer);

      }; // convosBinaryInit

      // boot a user from a conversation
      function convosBoot (convoId, user, done) {

        // remove the user from conversation.invitees
        // 
        // make all of the booted user's sockets leave the room
        // 
        
        

      }; // convosBoot

      function convosEnd (convoId, done) { 

        var convo = state.convos.get(convoId);

        if (!convo) {
          return done(new Error(ERROR_CONVO_NOT_FOUND));
        }

        // only the conversation starter is allowed to end conversations
        if (!convo.starter.equals(socket.user.id)) {
          return done(new Error(ERROR_NOT_ALLOWED));
        }

        // notify users that the conversation has been ended by starter
        io.to(convoId).emit('convos:ended', convoId);

        // remove the conversation from the database
        convo.remove(function (err, result) {
          if (err) return done(err);
          
          // remove the conversation from state
          state.convos.remove(convoId);

          done(null, result);

        });

      }; // convosEnd

      function convosGet (done) {

        var convos = [];

        socket.user.convos.forEach(function (convoId) {
          convos.push(getClientConvo(convoId));
        });

        done(null, convos);

      }; // convosGet

      // invite one ore more users to an existing conversation
      function convosInvite (convoId, invitees, done) {

        // var conversation = state.convos[convoId];

        // if (conversation.convo.isStarter)

        // if (!Array.isArray(invitees)) {
        //   if (invitees instanceof mongoose.Schema.Types.ObjectId) {

        //   }
        // } 

      }; // convosInvite

      // used to handle when a newly invited user has joined the conversation 
      function convosJoin (convoId, userId, done) {




      }; // convosJoin 

      function convosStart (invitees, done) {

        debug('invitees', invitees);

        if (!Array.isArray(invitees) || invitees.length === 0) {
          return done (ERROR_INVALID_INVITEES);
        }

        debug(socket.user.username + ' wants to start a conversation with ' + invitees);

        var invited = [];
        var convo;
        
        invitees.forEach(function (invitee, key) {

          debug('invitees[%s]: %s', key, invitee);

          if (getPermissions(socket.user, invitee).indexOf('startConversation')) {
            var msg = uti.format('%s %s %s to start a conversation',
              invitee,
              (answer) ? 'allows' : 'does not allow',
              socket.user.username
            );

            debug(msg);

            if (!answer) {
              invitees.splice(key, 1);
            } else {

              debug('state.users[%s]: %s', invitee, state.users.byUserName.get(invitee) );

              invited.push(state.users.byUserName.get(invitee)._id)
            }
          }
        });
      
        debug('invitees', invitees);
        debug('invited', invited);

        // create the conversation document
        var convo = new data.conversation({
          starter: socket.user._id,
          invitees: invited
        });

        var convoId = convo.id

        state.convos.add(convo);

        var members = [socket.user._id].concat(convo.invited);
        
        convo.save(function (err, savedConvo) {
          if (err) return done(err);

          debug('savedConvo', savedConvo);

          var clientConvo = getClientConvo(convoId);

          publish(convoId, 'convos:started', clientConvo);

          members.forEach(function (member) {

            member = member.toString();

            if (online(member)) {
              // subscribe this user to the convo's event feed
              subscribe(member, convoId);

              // tell everyone in the conversation that this user has joined
              // publish(convoId, 'convos:entered', { convo: convoId, user: state.users.get(member).username });
            }
          });

          done(null, clientConvo);

        });
        
      }; // convosStart

      function convosText (convoId, message, done) {

      // send a message to a conversation

        var convo = state.convos[convoId];

        // 
        if (convo.isStarter(username) || convo.isInvited(username)) {

          io.in(convoId).emit('convos:text', new TextMessage(convoId, username, message));
          return done();

        } else {
          return done(new Error(ERROR_NOT_ALLOWED));
        }
     
      }; // convosText

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
      }; // friends

      function friendsOnline (done) {
        var onlineFriends = [];

        state.friends.get(socket.user.id).forEach((friendId) => {
          if (online(friendId)) {
            onlineFriends.push(state.users.get(friendId).username);
          }
        });

        done(null, onlineFriends);

      }; // getOnlineFriends

      function friendsUnfriend (friendUsername, done) {

        var friend = state.users.byUserName.get(friendUsername);
        var friendship = state.friendships.getByUserIds(socket.user.id, friend.id);
        
        if (!friend || !friendship) return done(new Error(ERROR_NOT_ALLOWED));

        debug(socket.user.username + ' wants to unfriend ' + friendUsername);
   
        state.friendships.remove(friendship.id);

        async.parallel({
          endFriendship: function (finished) {
            socket.user.endFriendship(friend.id, finished);
          },
          saveSocketUser: function (finished) {
            socket.user.save(finished);
          },
          saveFriend: function (finished) {
            friend.save(finished);
          }
        }, function (err, results) {
          if (err) return done(err);
          
          // unsubscribe the users from each other's activity feeds
          unsubscribe(socket.user.id, friend.id);
          unsubscribe(friend.id, socket.user.id);

          var toNotify = [socket.user.id, friend.id];

          notify(toNotify, 'friends:unfriended', socket.user.username, friend.username);
          
          done(null, friend.username);
        });
      }; // friendsUnfriend

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
      }; // privacyUpdate

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
      }; // profileUpdate

      function profileView (username, done) {

        data.user.findOne({username: username}, function (err, requestedUser) {
          socket.user.viewProfile(requestedUser, done);
        });
      }; // profileView

      function requestsAccept (requesterUsername, done) {

        // get the requester
        var requester = state.users.byUserName.get(requesterUsername);

        // if the requester doesn't exist, then pass an error to the callback
        if (!requester) return done(new Error(ERROR_USER_NOT_FOUND));

        // make sure the request exists
        data.user.getFriendship(socket.user.id, requester.id, function  (err, request) {
          if (err) return done (err);
          if (!request) return done(new Error(ERROR_REQUEST_NOT_FOUND));

          socket.user.acceptRequest(requester.id, function (err, friendship) {
            if (err) return done(err);

            // remove the requester's username from the user's received requests list 
            var index = socket.user.requests.received.indexOf(requester.username);
            socket.user.requests.received.splice(index, 1);

            // remove the user's username from the requester's received request list
            index = requester.requests.sent.indexOf(socket.user.username);
            requester.requests.sent.splice(index, 1);

            // add the users to each other's hash of friends
            socket.user.friends.push(requester.id);
            state.users.get(requester.id).friends.push(socket.user.id);

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
              subscribe(socket.user.id, requester.id);
              subscribe(requester.id, socket.user.id);

              debug(socket.user.username + ' accepted ' + requester.username + '\' friend request');

              debug(socket.user.username + '.requests', socket.user.requests);
              debug(socket.user.username + '.friends', socket.user.friends);

              debug(requester.username + '.requests', requester.requests);
              debug(requester.username + '.friends', requester.friends);

              var toNotify = [socket.user.id, requester.id];

              // notify each user that the request was accepted
              notify(toNotify, 'requests:accepted', results.populateFriendship);

              done(null, friendship);
            });
          });
        });
      }; // requestsAccept

      function requestsCancel (requestedUsername, done) {

        // get the requested user 
        var requested = state.users.byUserName.get(requestedUsername);

        // if the user doesn't exist, then pass an error to the callback
        if (!requested) return done(new Error(ERROR_USER_NOT_FOUND));

        // make sure the request exists
        data.user.getFriendship(socket.user.id, requested.id, function  (err, request) {
          if (err) return done (err);
          if (!request) return done(new Error(ERROR_REQUEST_NOT_FOUND));

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

              var toNotify = [socket.user.id, requested.id];

              notify(toNotify, 'requests:canceled', results.populateRequest);
              
              done(null, request);
            });

          });
        });
      }; // requestsCancel

      function requestsDeny (requesterUsername, done) {

        // get the requester
        var requester = state.users.byUserName.get(requesterUsername);

        // if the requester doesn't exist, then pass an error to the callback
        if (!requester) return done(new Error(ERROR_USER_NOT_FOUND));

        // make sure the request exists
        data.user.getFriendship(socket.user.id, requester.id, function  (err, request) {
          if (err) return done (err);
          if (!request) return done(new Error(ERROR_REQUEST_NOT_FOUND));

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

              var toNotify = [socket.user.id, requester.id];

              notify(toNotify, 'requests:denied', results.populateRequest);
              
              done(null, request);
            });
          });
        });
      }; // requestsDeny

      function requestsSend (requestedUsername, done) {
        
        // get the requested user 
        var requested = state.users.byUserName.get(requestedUsername);

        // if the user doesn't exist, then pass an error to the callback
        if (!requested) return done(new Error(ERROR_USER_NOT_FOUND));

        // if the requested user allows the requester to send a friend request
        requested.may(socket.user.id, 'friendRequest', function (err, consent) {
          if (err) return done(err);

          // if the requested user does not give consent, we won't send the request
          if (!consent) return done(null, new Error(ERROR_NOT_ALLOWED));


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
              notify(socket.user.id, 'requests:sent', requested.username);
              notify(requested.id, 'requests:received', socket.user.username);

              // pass the request to the socket that initiated it.
              done(null, results.populateRequest);
            });
          });
        });
      }; // requestsSend

      function socketDisconnect () {

        // remove the socket from the state
        state.sockets.remove(socket.id);

        var user = socket.user;

        debug('user ' + user.username + ' socket ' + socket.id + ' disconnected');
        debug(user.username + '\'s sockets', state.sockets.byUserId.get(user.id));

        // if that was their last socket
        if (state.sockets.byUserId.get(user.id).size === 0) {

          // set a timeout for 1 second to log the user off.
          // if they logon within 1 second (i.e. page refresh), the timeout
          // will be cleared and they won't get logged off
          user.logoffTimeout = setTimeout(function logoffTimeout () {
            // logoff the user
            user.logoffTimeout = null;

            publish(user.id, 'friends:logoff', user.username);
            
          }, 1000);

        }
      }; // socketDisconnect

      function socketError (err) {
        debug('socket error: ', err);
        console.trace(err);
      }; // socketError

      function usersDelete (done) {
        debug('account:delete', socket.user.username);

        // disconnect all sockets
        state.sockets.byUserId(socket.user.id).forEach(function (socketId) {
          io.connected[socketId].disconnect();
        });

        state.users.remove(socket.user.id);

        // remove from db
        socket.user.remove(function (err, results) {
          if (err) return done(err);
          debug('looks like I got removed!');
          done();

        });
      }; // usersDelete

      function usersPermissions (usernames, done) {

        done(null, getPermissions(usernames));
      }; // usersPermissions


      function usersSearch (findParams, done) {

        debug('searching for users');

        debug('findParams', findParams);

        findParams = utils.extend({}, findParams);

        findParams.conditions = utils.extend({}, findParams.conditions);
        
        var username  = findParams.conditions.username;
        findParams.conditions.username = new RegExp(username, "i");
        
        findParams.projection = '_id username privacy';
        
        debug('findParams', findParams);
      
        socket.user.search(findParams, function (err, searchResults) {
          if (err) return done(err);

          debug('searchResults', searchResults);
          done(null, searchResults);
        });
      }; // usersSearch

      

    }; // socketConnect

  }; // startRealtime

  function getClientConvo (convoId) {
    var convo = state.convos.get(convoId);

    var clientConvo = {
      id: convo.id,
      starter: state.users.get(convo.starter.toString().username),
      invitees: new Set(),
      members: new Set(),
    };

    convo.invitees.forEach(function (invitee) {
      clientConvo.invitees.add(state.users.get(invitee).username)
    });

    convo.members.forEach(function (member) {
      clientConvo.members.add(state.users.get(member).username)
    });

    return clientConvo;
    
  }; // getClientConvo

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
  }; // getFriendsOfFriends


  function getPermissions (requester, usernames) {

    // var permissions = {};

    if (!Array.isArray(usernames)) {
      usernames = [ usernames ];
    }
      
    usernames.forEach((username) => {

      var user = state.users.byUserName.get(username);

      var relationship = getRelationship(requester.id, user.id);

      debug('relationship', relationship);

      debug('data.privacy', data.privacy);

      for (var value in data.privacy.values) {

        var property = data.privacy[value];
      
        // friend requests are a bit different in that privacy settings really 
        // only apply to SENDING friend requests.  If userA is not allowed to 
        // friend request userB and userB sends a request to userA, userA certainly
        // may accept/deny the request.
        // 
        // likewise if they are friends, they can always un-friend the other
        if (property === 'friendRequest') {

          // if they are friends
          if (results.relationship === data.user.relationships.FRIENDS) {
            permissions[username].push('unfriend');
            return done()

          // if they are pendingFriends
          } else if (results.relationship === data.user.relationships.PENDING_FRIENDS) {
            requester.isRequester(results.friendship._id, function (err, answer) {
              if (err) return done(err);

              if (answer) {
                permissions[username].push('cancelRequest');
              } else {
                permissions[username].push('acceptRequest');
                permissions[username].push('denyRequest');
              }
              return done();
            });
          // if they're not friends
          } else if (results.relationship >= value) {
            permissions[username].push('friendRequest');
            return done();
          } else {
            return done();
          }
        } else {

          if (results.relationship >= value) {
            permissions[username].push(property);
          }        

          return done();
        }

      };

    });
  }; // getPermissions


  function getRelationship (userId1, userId2) {
    var user1 = state.users.get(userId1);
    var user2 = state.users.get(userId2);

    var user1_requests
    var friend;
    var i = 0;
    var j = 0;

    // are the users friends?
    while (i < user1.friends.length) {
      if (user2.id === user1.friends[i].id) {
        return data.user.relationships.FRIENDS;
      }

      i++;
    }

    // they aren't friends, but are they pending friends?
    
    user1_requests = user1.requests.sent.concat(user1.requests.received);

    i = 0;

    while (i < user1_requests.length) {
      if (user2.id === user1_requests[i].id) {
        return data.user.relationships.PENDING_FRIENDS;
      }

      i++;

    }

    // they aren't pending friends, but are they friends-of-friends?
    i = 0;
    j = 0;

    debug('user1.friends', user1.friends);
    
    // check user1's friends' friends first
    while (i < user1.friends.length) {

      friend = state.users.get(user1.friends[i]);

      debug('friend', friend);

      while ( j < friend.friends.length) {
        if (user2.id === friend.friends[j]) {
          return data.user.relationships.FRIENDS_OF_FRIENDS;
        }

        j++;
      }        

      i++;
    }

    // then check user2's friends' friends

    i = 0;
    j = 0;
    
    // check user1's friends' friends frist
    while (i < user2.friends.length) {

      // if ()

      friend = state.users.get(user2.friends[i]);

      while ( j < friend.friends.length) {
        if (user1.username === friend.friends[j]) {
          return data.user.relationships.FRIENDS_OF_FRIENDS;
        }

        j++;
      }

      i++;
    }

    // they are NOT-FRIENDS
    
    return data.user.relationships.NOT_FRIENDS;
  
  };

  function leaveConvo (userIds, convoId) {

    if (!Array.isArray(userIds)) {
      userIds = [ userIds ];
    }

    userIds.forEach(function (userId) {
      if (userId instanceof mongoose.Schema.Types.ObjectId) {
        userId = userId.toString();
      }

      if (convoId instanceof mongoose.Schema.Types.ObjectId) {
        convoId = convoId.toString();
      }

      // unsubscribe the user from the convo's event feed
      unsubscribe(userId, convoId);

      // notify the convo that the user has left
      publish(convoId, 'convos:exited', { convo: convoId, user: state.users.get(userId).username });

      // remove the userId from the convos members list
      state.convos.members.get(convoId).delete(userId);

      // remove the convo from the user's convos list
      state.convos.by.get(userId).convos.delete(convoId);    
    });  
  }; // leaveConvo

  function online (userId) {
    return state.sockets.byUserId.has(userId);
  }; 


  function notify (userIds, eventName, eventParams) {

    debug('userIds', userIds);

    if (!Array.isArray(userIds)) {
      userIds = [ userIds ];
    }

    debug('state.sockets.byUserId', state.sockets.byUserId);

    userIds.forEach(function (userId) {
      if (userId instanceof mongoose.Schema.Types.ObjectId) {
        userId = userId.toString();
      }

      state.sockets.byUserId.get(userId).forEach(function (socketId) {
        io.connected[socketId].emit(eventName, eventParams);
      });
    });
  }; // notify

  function publish (feed, eventName, eventParams) {
    io.to(feed).emit(eventName, eventParams);
  }; // publish

  function subscribe (userIds, feed) {
    if (!Array.isArray(userIds)) {
      userIds = [ userIds ];
    }

    userIds.forEach(function (userId) {
      if (userId instanceof mongoose.Schema.Types.ObjectId) {
        userId = userId.toString();
      }

      debug('userId', userId);

      state.sockets.byUserId.get(userId).forEach(function (socketId) {
        io.connected[socketId].join(feed);
      });
    });
  }; // subscribe

  function unsubscribe (userIds, feed) {
    if (!Array.isArray(userIds)) {
      userIds = [ userIds ];
    }

    userIds.forEach(function (userId) {
      if (userId instanceof mongoose.Schema.Types.ObjectId) {
        userId = userId.toString();
      }

      debug('userId', userId);

      state.sockets.byUserId.get(userId).forEach(function (socketId) {
        io.connected[socketId].leave(feed);
      });
    });
  }; // unsubscribe

};

Offtherecord_transport.prototype = new events.EventEmitter();
