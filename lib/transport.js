
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
var shortid           = require('shortid');
var socketio          = require('socket.io');

module.exports = Offtherecord_transport;

function Offtherecord_transport (data) {

  var ERROR_NOT_ALLOWED       = 'you are not allowed to do that.';
  var ERROR_CONVO_NOT_FOUND   = 'conversation found found';
  var ERROR_REQUEST_NOT_FOUND = 'request not found';
  var ERROR_USER_NOT_FOUND    = 'user not found';
  var ERROR_INVALID_INVITEES  = 'invitees must be an array with at least one element that must not contain the starter\'s username!';
  var ERROR_SAVING_USER       = 'encountered an error while saving the user to mongodb';
  var ERROR_AUTH_FAIL         = 'Authentication failed: invalid username and/or password provided';

  var self = this;

  var app;
  var clients = new Set();
  var io;
  var server;
  var sessionConfig;
  var state;
  var status;

  this.start = function (done) {

    debug('starting');

    if (typeof done === 'function') {
      this.once('started', done);
    }

    this.status = 'starting';
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
        debug(user.username + "'s sockets: ", user.sockets);
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

      debug('state', state);
      debug('state.users.byUserName', state.users.byUserName);

      startHttp();

    });

  };

  this.stop = function (done) {
    var self = this;

    if (typeof done === 'function') {
      this.once('stopped', done);
    }

    status = 'stopping';
    debug(status);
    this.emit('stopping');

    // tell every connected socket that the server is shutting down
    io.emit('shutdown');

    debug('%s socket.io clients connected, closing...', io.sockets.length);

    // tell the socket.io server to close 
    // closes all socket.io clients and closes the underlying http server
    io.server.close();

    // it appears that socket.io opens and keeps open several http clients even after
    // upgrading the transports...
    debug('%s http client(s) connected, closing...', clients.size);

    // close them all!
    clients.forEach((client) => {
      client.end();
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
          'off-the-record': '/',
          dashboard: '/dashboard',
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
        error: (request.query.error) ? ERROR_AUTH_FAIL : undefined, 
        redirect: request.query.redirect
      });
    });

    // GET requests for /logoff will kill the users session and redirect to root
    app.get('/logoff', function (request, response) {
      if (request.user) {
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
    app.post('/logon', function (request, response) {
      var failRedirect = '/logon?error=true&redirect=' + request.query.redirect;

      if (!request.body.username || !request.body.password) {
        return response.redirect(failRedirect);
      }

      data.user.findByUsername(request.body.username, function (err, user) {
        if (err) return response.redirect(failRedirect); 

        user.authenticate(request.body.password, function (err, user) {
          if (err || !user) return response.redirect(failRedirect); 

          request.login(user, function (err) {
            if (err) return response.redirect(failRedirect);

            response.redirect(request.query.redir || '/home');
          });
        });
      });
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

    app.get('/dashboard', verifySession, function (request, response) {
      response.render('dashboard');
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

      clients.add(client);

      debug('%s http client(s) connected', clients.size);

      client.once('close', function () {

        clients.delete(client);
      
        debug('%s http client(s) connected', clients.size);

        if (status === 'stopping' && clients.size === 0) {
          debug('stopped');
          status = 'stopped';
          self.emit('stopped');
        }
      });
    });

    // server.on('close', function httpServerClosed () {
    // });

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
        debug('%s is authenticated', request.user.username);
        return next();

      } else  {
        debug('client is NOT authenticated');
        response.redirect('/logon?redirect=' + request.url);
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
    status = 'started';
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
        return socket.emit('error', ERROR_USER_NOT_FOUND);
      }

      // if the user is logged on
      if (state.online.has(socket.user.id)) {

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
      state.sockets.connect(socket.user.id, socket.id);

      // join user to their friends' event feeds
      socket.user.friends.forEach((userId) => socket.join(userId));

      // join user to their convos' event feeds
      state.convos.byUserId.get(socket.user.id).forEach((userId) => socket.join(userId));

      // debug(socket.user.username + '\'s state:', state.users.get(socket.user.id));
      // debug(socket.user.username + '\'s sockets:', socket.user.sockets);

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

      socket.on('friends:permissions',  friendsPermissions);
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

      socket.emit('ready', getClientUser(socket.user.id));

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
          return done(ERROR_CONVO_NOT_FOUND);
        }

        // only the conversation starter is allowed to end conversations
        if (!convo.starter.equals(socket.user.id)) {
          return done(ERROR_NOT_ALLOWED);
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
          return done(ERROR_INVALID_INVITEES);
        }

        debug(socket.user.username + ' wants to start a conversation with ' + invitees);

        var invited = [];
        var convo;
        
        invitees.forEach(function (invitee, key) {

          debug('invitees[%s]: %s', key, invitee);

          if (~getPermissions(socket.user.id, invitee.toString()).indexOf('startConversation')) {
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
        var convo = state.convos.add(new data.conversation({
          starter: socket.user._id,
          invitees: invited
        }));

        // save the convo to the db        
        convo.save(function (err, savedConvo) {
          if (err) console.error(err);
          else debug('savedConvo', savedConvo);
        });

        var convoId = convo.id;

        var clientConvo = getClientConvo(convoId);

        publish(convoId, 'convos:started', clientConvo);

        convo.members.forEach(function (member) {

          var memberId = member.id;

          if (state.online.has(memberId)) {
            // subscribe this user to the convo's event feed
            subscribe(memberId, convoId);

            // tell everyone in the conversation that this user has joined
            publish(convoId, 'convos:entered', { convo: convoId, user: member.username });
          }
        });

        done(null, clientConvo);
        
      }; // convosStart

      function convosText (convoId, message, done) {

      // send a message to a conversation

        var convo = state.convos[convoId];

        // 
        if (convo.isStarter(username) || convo.isInvited(username)) {

          io.in(convoId).emit('convos:text', new TextMessage(convoId, username, message));
          return done();

        } else {
          return done(ERROR_NOT_ALLOWED);
        }
     
      }; // convosText

      function friendsPermissions (done) {

        debug('friends - ' + socket.user.username);

        var permissions = {
          friends: {},
          sent: {},
          received: {}
        };

        debug('socket.user.friends', socket.user.friends);

        socket.user.friends.forEach((friend) => {
          permissions.friends[friend.username] = getPermissions(socket.user.id, friend.id);
        });

        socket.user.requests.sent.forEach((requested) => {
          permissions.sent[requested.username] = getPermissions(sock.user.id, requested.id);
        });

        socket.user.requests.received.forEach((requester) => {
          permissions.received[requester.username] = getPermissions(sock.user.id, requester.id);
        });        

        debug('permissions', permissions);
        
        done(null, permissions);

      }; // friends

      function friendsOnline (done) {
        var onlineFriends = [];

        socket.user.friends.forEach((friend) => {
          if (state.online.has(friend.id)) {
            onlineFriends.push(friend.username);
          }
        });

        done(null, onlineFriends);

      }; // getOnlineFriends

      function friendsUnfriend (friendUsername, done) {

        var friend = state.users.byUserName.get(friendUsername);
        var friendship = state.friendships.getByUserIds(socket.user.id, friend.id);

        debug('friend', friend);
        debug('friendship', friendship);
        
        if (!friend || !friendship) return done(ERROR_NOT_ALLOWED);

        debug(socket.user.username + ' wants to unfriend ' + friendUsername);
   
        state.friendships.remove(friendship.id);

        // unsubscribe the users from each other's activity feeds
        unsubscribe(socket.user.id, friend.id);
        unsubscribe(friend.id, socket.user.id);

        notify([socket.user.id, friend.id], 'friends:unfriended', socket.user.username, friend.username);
        
        done(null, friend.username);

        debug('socket.user.friends', socket.user.friends);
        debug('friend.friends', friend.friends);

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
          if (err) console.error(err);
          else debug(results);
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

        var requested = state.users.byUserName.get(username);

        if (!requested) return done(ERROR_USER_NOT_FOUND);

        var permissions = getPermissions(socket.user.id, requested.id);

        // if NOT allowed to view their profile
        if (!~permissions.indexOf('profile')) return done(ERROR_NOT_ALLOWED);

        var userInfo = {
          user: {
            profile: requested.profile,
            username: requested.username
          },
          permissions: permissions
        };

        done(null, userInfo);
        
      }; // profileView

      function requestsAccept (username, done) {

        // get the requester
        var requester = state.users.byUserName.get(username);

        // if the requester doesn't exist, then pass an error to the callback
        if (!requester) return done(ERROR_USER_NOT_FOUND);

        var request = state.requests.byUserId.get(socket.user.id).get(requester.id);

        if (!request) return done(ERROR_REQUEST_NOT_FOUND);

        var friendship = state.requests.accept(request.id);

        debug('friendship', friendship);

        debug(util.format('%s accepted %s\'s friend request', 
              socket.user.username, 
              requester.username));

        debug(socket.user.username, socket.user);
        debug(requester.username, requester);

        var clientFriendship = friendship.toObject();

        clientFriendship.requester = requester.username;
        clientFriendship.requested = socket.user.username;
        
        debug('clientFriendship', clientFriendship);

        // subscribe each user to the other's feed
        subscribe(socket.user.id, requester.id);
        subscribe(requester.id, socket.user.id);

        // notify each user that the request was accepted
        notify([socket.user.id, requester.id], 'requests:accepted', friendship);

        done(null, clientFriendship);

        socket.user.acceptRequest(requester.id, function (err, results) {
          if (err) console.error(err);
          else debug('results', results);
        });
      }; // requestsAccept

      function requestsCancel (username, done) {

        // get the requested user 
        var requested = state.users.byUserName.get(username);

        // if the user doesn't exist, then pass an error to the callback
        if (!requested) return done(ERROR_USER_NOT_FOUND);

        var request = state.requests.byUserId.get(socket.user.id).get(requested.id);

        if (!request) return done(ERROR_REQUEST_NOT_FOUND);

        state.requests.remove(request.id);

        debug(util.format('%s canceled their friend request to %s', 
              socket.user.username, 
              requested.username));

        debug('request', request);
        debug('request', state.requests.get(request.id));

        debug(socket.user.username, socket.user);
        debug(requested.username, requested);

        var clientRequest = request.toObject();

        clientRequest.requester = socket.user.username;
        clientRequest.requested = requested.username;
        
        debug('clientRequest', clientRequest);

        notify([socket.user.id, requested.id], 'requests:canceled', clientRequest);
        
        done(null, clientRequest);

        socket.user.cancelRequest(requested.id, function (err, results) {
          if (err) console.error(err);
          else debug('results', results.result);
        });

      }; // requestsCancel

      function requestsDeny (username, done) {

        // get the requester user 
        var requester = state.users.byUserName.get(username);

        // if the user doesn't exist, then pass an error to the callback
        if (!requester) return done(ERROR_USER_NOT_FOUND);

        var request = state.requests.byUserId.get(socket.user.id).get(requester.id);

        if (!request) return done(ERROR_REQUEST_NOT_FOUND);

        state.requests.remove(request.id);

        debug(util.format('%s denied %s\'s friend request', 
              socket.user.username, 
              requester.username));

        debug('request', request);
        debug('request', state.requests.get(request.id));

        debug(socket.user.username, socket.user);
        debug(requester.username, requester);

        var clientRequest = request.toObject();

        clientRequest.requested = socket.user.username;
        clientRequest.requester = requester.username;
        
        debug('clientRequest', clientRequest);

        notify([socket.user.id, requester.id], 'requests:canceled', clientRequest);
        
        done(null, clientRequest);

        socket.user.cancelRequest(requester.id, function (err, results) {
          if (err) console.error(err);
          else debug('results', results.result);
        });
      }; // requestsDeny

      function requestsSend (username, done) {

        // get the requested user 
        var requested = state.users.byUserName.get(username);
        
        debug(util.format('%s wants to send %s a friend request', 
              socket.user.username,
              requested.username
              ));
        
        var friendship = socket.user.friends.has(requested.id);
        var pendingRequest = state.requests.byUserId.get(socket.user.id).get(requested.id);

        // if the user doesn't exist, then pass an error to the callback
        if (!requested) {
          debug(ERROR_USER_NOT_FOUND);
          return done(ERROR_USER_NOT_FOUND);
        // if the requested user allows the requester to send a friend request
        } else if (!~getPermissions(socket.user.id, requested.id).indexOf('friendRequest')) {
          debug(ERROR_NOT_ALLOWED);
          return done(ERROR_NOT_ALLOWED);
        // make sure they aren't friends or have a pending request
        } else if (friendship || pendingRequest) {
          debug(ERROR_NOT_ALLOWED);
          return done (ERROR_NOT_ALLOWED);
        }

        var request = state.requests.add(new data.user.Friendship({
          requester: socket.user._id,
          requested: requested._id,
        }));

        debug('request', request);

        var clientRequest = request.toObject();

        clientRequest.requester = socket.user.username;
        clientRequest.requested = requested.username;
        
        debug('clientRequest', clientRequest);

              
        debug(socket.user.username, socket.user);
        debug(requested.username, requested);

        // notify the requester that the request was sent
        notify(socket.user.id, 'requests:sent', requested.username, getPermissions(socket.user.id, requested.id));
        notify(requested.id, 'requests:received', socket.user.username, getPermissions(requested.id, socket.user.id));

        debug(socket.user.username + ' sent a friend request to ' + requested.username);
        
        done(null, clientRequest);

        socket.user.friendRequest(requested.id, function (err, results) {
          if (err) console.error(err);
          else debug('results', results);
        });
        
      }; // requestsSend

      function socketDisconnect () {
        var user = socket.user;

        // debug(user.username + '\'s sockets', user.sockets);

        // remove the socket from the state
        state.sockets.disconnect(socket.id)

        // debug('user ' + user.username + ' socket ' + socket.id + ' disconnected');
        
        // debug(user.username + '\'s sockets', user.sockets);

        // if that was their last socket
        if (user.sockets.size === 0) {

          // set a timeout for 1 second to log the user off.
          // if they logon within 1 second (i.e. page refresh), the timeout
          // will be cleared and they won't get logged off
          user.logoffTimeout = setTimeout(function logoffTimeout () {
            // logoff the user
            user.logoffTimeout = null;

            state.online.delete(user.id);

            debug(user.username + ' logged off');
            publish(user.id, 'friends:logoff', user.username);
            
          }, 1000);

        }

        debug('%s socket.io clients connected', io.sockets.length);

      }; // socketDisconnect

      function socketError (err) {
        debug('socket error: ', err);
        console.trace(err);
      }; // socketError

      function usersDelete (done) {
        debug('account:delete', socket.user.username);

        // disconnect all sockets
        socket.user.sockets.forEach(function (socketId) {
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

        var permissions = {};

        if (!Array.isArray(usernames)) {
          usernames = [usernames];
        }

        usernames.forEach((username) => {
          var userId = state.users.byUserName.get(username).id;

          permissions[username] = getPermissions(socket.user.id, userId);

        });

        done(null, permissions);
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

  function getClientUser (userId) {
    var user = state.users.get(userId);

    // debug('user', user);
    // debug('user.friends', user.friends);
    // debug('user.requests', user.requests);
    // debug('user.convos', user.convos);

    var clientUser = {
      username: user.username,
      profile: user.profile,
      privacy: user.privacy,
      friends: [],
      requests: { 
        sent: [], 
        received: [] 
      },
      convos: {},
      permissions: {}
    };

    // get client-friendly list of the user's friends
    user.friends.forEach((friend) => {

      // add the friend's username to the clientUser's friends array
      clientUser.friends.push(friend.username);

      // get the user's permissions for the friend
      clientUser.permissions[friend.username] = getPermissions(userId, friend.id);
    });

    // get client-friendly list of the user's sent requests
    user.requests.sent.forEach((user) => {

      // add the user's username to the clientUser's sent requests array
      clientUser.requests.sent.push(user.username);

      // if we don't have the user's permissions for the user
      if (!(user.username in clientUser.permissions) ) {
        // get the user's permissions for the user
        clientUser.permissions[user.username] = getPermissions(userId, user.id);
      };
    });

    // get client-friendly list of the user's received requests
    user.requests.received.forEach((user) => {

      // add the user's username to the clientUser's received requests array
      clientUser.requests.received.push(user.username);

      // if we don't have the user's permissions for the user
      if (!(user.username in clientUser.permissions) ) {
        // get the user's permissions for the user
        clientUser.permissions[user.username] = getPermissions(userId, user.id);
      };
    });    

    // get client-friendly list of the user's convos
    user.convos.forEach((convo) => {
      // get the convo formatted for the client
      clientUser.convos[convo.id] = getClientConvo(convo.id);

      convo.members.forEach((member) => {

        // if we don't have the user's permissions for the member
        if (!(member.username in clientUser.permissions) ) {
          // get the user's permissions for the member
          clientUser.permissions[member.username] = getPermissions(userId, member.id);
        };
      });
    });

    // debug('clientUser', clientUser);

    return clientUser;
  }

  function getClientFriends () {};

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


  function getPermissions (requesterId, requestedId) {

    var permissions = [];

    debug('requesterId', requesterId);
    debug('requestedId', requestedId);

    var requester = state.users.get(requesterId);
    var requested = state.users.get(requestedId);

    debug('requester', requester);
    debug('requested', requested);

    var relationship = getRelationship(requesterId, requestedId);

    debug('relationship', relationship);

    // debug('relationships', data.user.relationships);

    // debug('data.privacy', data.privacy);

    for (var property in requested.privacy.toObject()) {
        
      debug('property', property);

      var value = requested.privacy[property];

      debug('value', value);
    
      // friend requests are a bit different in that privacy settings really 
      // only apply to SENDING friend requests.  If userA is not allowed to 
      // friend request userB and userB sends a request to userA, userA certainly
      // may accept/deny the request.
      // 
      // likewise if they are friends, they can always un-friend the other
      if (property === 'friendRequest') {

        // if they are friends
        if (relationship === data.user.relationships.FRIENDS) {
          permissions.push('unfriend');

        // if they are pendingFriends
        } else if (relationship === data.user.relationships.PENDING_FRIENDS) {

          var request = state.requests.byUserId.get(requester.id).get(requested.id);

          if (requester._id.equals(request.requester._id)) {
            permissions.push('cancelRequest');

          } else {
            permissions.push('acceptRequest');
            permissions.push('denyRequest');
          }

        // if they're not friends
        } else if (relationship >= value) {
          permissions.push('friendRequest');
        } 

      } else {

        if (relationship >= value) {
          permissions.push(property);
        }
      }
      

    };

    debug(util.format('%s has given %s the following permissions: %j', 
          requested.username, 
          requester.username, 
          permissions));

    return permissions;
  }; // getPermissions


///////////////
///////////////
////////////
/// UPDATE TO REFLECT SETS/MAPS
///////////////
//////////////
//////////////

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
    
    user1_requests = Array.from(user1.requests.sent).concat(Array.from(user1.requests.received));

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

    // check user1's friends' friends first
    while (i < user1.friends.length) {

      friend = state.users.get(user1.friends[i]);

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
