
// node core modules
var events  = require('events');
var fs      = require('fs');
var http    = require('http');
var https   = require('https'); 
var url     = require('url');
var util    = require('util');

// off-the-record core modules
var config            = require('./config');
var env               = require('./env');
var ssl               = require('./ssl');
var utils             = require('techjeffharris-utils');
var BufferReadStream  = require('./BufferReadStream');
var BinaryTransfer    = require('./BinaryTransfer');
var State             = require('./state');
var TextMessage       = require('./TextMessage');

// 3rd party
var async             = require('async');
var bodyParser        = require('body-parser');
var cookieParser      = require('cookie-parser');
var debug             = require('debug')(env.package.name + ':transport');
var express           = require('express'); 
var expressSession    = require('express-session');
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
  var cachedResponses = {};
  var clients = new Set();
  var io;
  var routesToCache = ['index', 'logon', 'register', 'app', '404', '500'];
  var server;
  var sessionConfig;
  var state;
  
  this.status = 'idle';

  this.start = function (done) {

    debug('starting');

    if (typeof done === 'function') {
      this.once('started', done);
    }

    this.status = 'starting';
    this.emit('starting');

    // this whole file / document loading thing probably belongs inside data.js...

    state = new State();

    async.parallel({
      // load the HTML source for our cached routes into memory
      cachedResponses: function (done) {
        // run the iterator for each item in the array in parallel
        async.each(routesToCache, function (route, complete) {
          // read the route's html file
          fs.readFile('./static/' + route + '.html', function (err, fileBuffer) {
            // if there's an error, I want to know about it!
            if (err) return complete(err);

            // once we're finished reading each file add it to cachedResponses
            cachedResponses[route] = fileBuffer;

            // now tell async.each that we're done with this entry in the array
            complete();
          });
          // once all the files have been loaded into memory, cachedResponses task is done
        }, done);
      },
      // preload all conversations
      convos: function (done) {
        // get all conversations from the database
        data.conversation.find({}, '_id starter invitees', done);
      },
      // preload all friendships
      friendships: function (done) {
        data.user.Friendship.find(done);
      },
      // preload all users
      users: function (done) {
        // get all users from the database, only get their id, username, and privacy settings
        data.user.find({}, '_id username privacy convos friends requests', done);
      },
    }, function (err, results) {
      if (err) self.emit('error', err);

      results.users.forEach((user) => {
        state.users.add(user);
      });
      
      results.convos.forEach((convo) => {
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

    this.status = 'stopping';
    debug(this.status);
    this.emit('stopping');

    // tell every connected socket that the server is shutting down
    io.server.emit('shutdown');

    debug('%s socket.io clients connected, closing...', io.sockets.length);

    // tell the HTTP server (to which socket.io has attached route handlers)
    // to stop accepting new connections
    server.close();

    // it appears that socket.io (or perhaps chrome?) opens and keeps open several http clients even after
    // upgrading the transports...
    debug('%s http client(s) connected', clients.size);

    if (clients.size === 0) {
      this.status = 'stopped';
      self.emit('stopped');
    } else {
      // close them all!
      clients.forEach((client) => {
        debug('closing http client...');
        client.end();
      });
    }
  };

  function startHttp () {

    // create the express app
    app = express();

    // tell the app what port we're using (even though we )
    app.set('port', config.http.port);

    // setup the body and cookie parsers
    app.use(bodyParser.urlencoded({ extended: true }));
    app.use(cookieParser());

    // setup session configuration
    sessionConfig = config.http.session
    sessionConfig.store = data.getSessionStore();

    // tell the app to handle sessions
    app.use(expressSession(sessionConfig));

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

    ////////////////////////////////////////////////////////////////////////////////
    //
    //  PUBLICALLY ACCESSIBLE ROUTES
    //
    ////////////////////////////////////////////////////////////////////////////////
    
    app.get('/', pipeCachedResponse);
    app.get('/404', pipeCachedResponse);
    app.get('/500', pipeCachedResponse);
    
    app.get('/logon', function (request, response) {
      if (request.isAuthenticated()) response.redirect('/app');
      else pipeCachedResponse(request, response);
    });

    app.get('/register', function (request, response) {
      if (request.isAuthenticated()) response.redirect('/app');
      else pipeCachedResponse(request, response);
    });

    // GET requests for /logoff will kill the users session and redirect to root
    app.get('/logoff', function (request, response) {
      if (request.isAuthenticated()) request.logOut();
      else response.redirect('/');
    });

    // POST requests for /logon will attempt to authenticate the given user
    app.post('/logon', function (request, response) {
      var failRedirect = '/logon?error=true&redirect=' + request.query.redirect;

      // make sure they entered both a username and password
      if (!request.body.username || !request.body.password) {
        return response.redirect(failRedirect);
      }

      // get the user from the state
      var user = state.users.byUserName.get(request.body.username);

      // make sure the user is not undefined 
      if (!user) return response.redirect(failRedirect);

      // try to authenticate the user with the provided password
      user.authenticate(request.body.password, function (err, user) {
        // if authentication fails, redirect to logon
        if (err || !user) return response.redirect(failRedirect); 

        // if we made it this far, we have authenticated the user, so log on the user
        request.login(user, function (err) {
          // in the event that there's some kind of error...
          if (err) return response.redirect(failRedirect);

          // if no error, they are logged in, so redirect them to /app
          response.redirect(request.query.redir || '/app');
        });
      });  
    });

    app.post('/register', function (request, response) {

      var failRedirect = '/register?error=true';
      
      // define the new user 
      // who needs input validation?  NOT THIS GUY!
      var newUser = {
        username: request.body.username,
        profile: {
          firstName : request.body.firstName, 
          lastName : request.body.lastName
        }
      };

      // no, this isn't clunky at all..
      if (request.body.password !== request.body.verifyPassword) {
        return response.redirect(failRedirect);
      } 

      // register the new user
      data.user.register(newUser, request.body.password, function onceRegistered (err, user) {
        if (err) return response.redirect(failRedirect);

        // add the new user to the state
        state.users.add(user);

        response.redirect('/app');
      });
    }); 

    
    ////////////////////////////////////////////////////////////////////////////////
    //
    //  Main application route - requires authentication
    //
    ////////////////////////////////////////////////////////////////////////////////

    app.get('/app', verifySession, pipeCachedResponse);

    ////////////////////////////////////////////////////////////////////////////////
    //
    //  OTHER REQUESTS
    //
    ////////////////////////////////////////////////////////////////////////////////

    // serve static content if no routes were found
    // yes, this content is read from disk per-response, could be cached
    app.use(express.static('lib/static'));

    // render 404 if a static file is not found
    app.use(function (request, response) {

      response.redirect('/404');
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

      debug('http client connected');
      debug('%s http client(s) connected', clients.size);

      client.once('close', function () {

        debug('http client disconnected');

        clients.delete(client);
      
        debug('%s http client(s) connected', clients.size);

        if (self.status === 'stopping' && clients.size === 0) {
          debug('stopped');
          self.status = 'stopped';
          self.emit('stopped');
        }
      });
    });

    server.once('listening', startRealtime);

    server.listen(config.http.port, config.http.host || undefined );

    ////////////////////////////////////////////////////////////////////////////////
    //
    //  route middleware
    //
    ////////////////////////////////////////////////////////////////////////////////
    
    function pipeCachedResponse (request, response) {

      var route = request.path.split('/')[1];

      var cachedResponse = cachedResponses[route];

      response.writeHead({
        200,
        "OK",
        {
          "Content-Type": "text/html",
          "Content-Length": cachedResponse.length
        }
      });

      // Create a new instance of the BufferReadStream to wrap the cached buffer. Then,
      // pipe that stream into the HTTP response.
      // --
      // NOTE: Once the BufferReadStream "ends", it will automatically end the HTTP
      // response stream as well!
      new BufferReadStream(cachedResponse).pipe(request);

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
    // io will be equal to the default namespace after as returned by
    // .use and .on
    io = socketio(server)

      // setup passport.socketio authorization for sockets
      .use(passportSocketIo.authorize(authOptions))

      // handle each socket connection
      .on('connect', socketConnect);

    debug('started');
    self.status = 'started';
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
      socket.user = state.users.get(socket.request.user.id);

      // make sure the user is not undefined
      if (!socket.user) {
        return socket.emit('error', ERROR_USER_NOT_FOUND);
      }

      // if the user is logged on
      if (!state.online.has(socket.user.id)) {

        debug(socket.user.username + ' logged on');

        publish(socket.user.id, 'friends:logon', socket.user.username);

      }

      // add the socketId to this user's cache
      state.sockets.connect(socket.user.id, socket);

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
          // track the progress of the transfer by calling the chunk function
          state.transfers.get(transferId).chunk(fileId, chunkId, chunk);
        }

        catch (err) {
          publish(transferId, 'convos:binary:error', {transferId: transferId, error: err });
        }
        
        // confirm with the sending socket that this chunk was received (don't send the chunk)
        socket.emit('convos:binary:chunk', convoId, username, transferId, fileId, chunkId);

        // send the chunk to all sockets (except the sending socket) who were 
        // connected when the transfer was initialized. 
        socket.broadcast.to(transferId).emit('convos:binary:chunk', convoId, socket.user.username, transferId, fileId, chunkId, chunk);

      }; // convosBinaryChunk

      function convosBinaryInit (convoId, filesInfo, ready) {

      // send a file to a conversation

        debug('request to transfer %s files: ', filesInfo.length);

        // create a new BinaryTransfer instance for the given filesInfo
        var transfer = state.transfers.init(convoId, new BinaryTransfer(filesInfo));

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

          if (state.getPermissions(socket.user.id, invitee.toString()).has('startConversation')) {
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

        var clientConvo = getClientConvo(convo.id);

        publish(convo.id, 'convos:started', clientConvo);

        convo.members.forEach(function (member) {

          if (state.online.has(member.id)) {

            // tell everyone in the conversation that this user has joined
            publish(convo.id, 'convos:entered', { convo: convo.id, user: member.username });
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
          permissions.friends[friend.username] = Array.from(state.getPermissions(socket.user.id, friend.id));
        });

        socket.user.requests.sent.forEach((requested) => {
          permissions.sent[requested.username] = Array.from(state.getPermissions(sock.user.id, requested.id));
        });

        socket.user.requests.received.forEach((requester) => {
          permissions.received[requester.username] = Array.from(state.getPermissions(sock.user.id, requester.id));
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

        notify([socket.user.id, friend.id], 'friends:unfriended', { 
          unfriender: socket.user.username, 
          unfriended: friend.username
        });
        
        done(null, friend.username);

        debug('socket.user.friends', socket.user.friends);
        debug('friend.friends', friend.friends);

        socket.user.endFriendship(friend.id, function (err, results) {
          if (err) console.error(err);
          else debug(results.result);
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

        var permissions = state.getPermissions(socket.user.id, requested.id);

        // if NOT allowed to view their profile
        if (!permissions.has('profile')) return done(ERROR_NOT_ALLOWED);

        var userInfo = {
          user: {
            profile: requested.profile,
            username: requested.username
          },
          permissions: Array.from(permissions)
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

        // notify socket.user that they accepted the request
        notify(socket.user.id, 'requests:received:accepted', {
          from: requester.username,
          permissions: Array.from(state.getPermissions(socket.user.id, requester.id))
        });

        // notify the requester that their request was accepted
        notify(requester.id, 'requests:sent:accepted', {
          to: socket.user.username,
          permissions: Array.from(state.getPermissions(requester.id, socket.user.id))
        });

        done();

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

        notify(socket.user.id, 'requests:sent:canceled', requested.username);

        notify(requested.id, 'requests:received:canceled', socket.user.username);
        
        done();

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

        notify(socket.user.id, 'requests:received:denied', requester.username);

        notify(requester.id, 'requests:sent:denied', socket.user.username);
        
        done();

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
        } else if (!state.getPermissions(socket.user.id, requested.id).has('friendRequest')) {
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

        var socketUserPermissions = Array.from(state.getPermissions(socket.user.id, requested.id));
        var requestedUserPermissions = Array.from(state.getPermissions(requested.id, socket.user.id));

        debug('socketUserPermissions', socketUserPermissions);
        debug('requestedUserPermissions', requestedUserPermissions);

        // notify the requester that the request was sent
        notify(socket.user.id, 'requests:sent', {
          to: requested.username, 
          permissions: socketUserPermissions
        });

        notify(requested.id, 'requests:received', {
          from: socket.user.username, 
          permissions: requestedUserPermissions
        });

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

          permissions[username] = Array.from(state.getPermissions(socket.user.id, userId));

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

    debug('user', user);
    debug('user.friends', user.friends);
    debug('user.requests', user.requests);
    debug('user.convos', user.convos);

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
      clientUser.permissions[friend.username] = Array.from(state.getPermissions(userId, friend.id));
    });

    // get client-friendly list of the user's sent requests
    user.requests.sent.forEach((user) => {

      // add the user's username to the clientUser's sent requests array
      clientUser.requests.sent.push(user.username);

      // if we don't have the user's permissions for the user
      if (!(user.username in clientUser.permissions) ) {
        // get the user's permissions for the user
        clientUser.permissions[user.username] = Array.from(state.getPermissions(userId, user.id));
      };
    });

    // get client-friendly list of the user's received requests
    user.requests.received.forEach((user) => {

      // add the user's username to the clientUser's received requests array
      clientUser.requests.received.push(user.username);

      // if we don't have the user's permissions for the user
      if (!(user.username in clientUser.permissions) ) {
        // get the user's permissions for the user
        clientUser.permissions[user.username] = Array.from(state.getPermissions(userId, user.id));
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
          clientUser.permissions[member.username] = Array.from(state.getPermissions(userId, member.id));
        };
      });
    });

    // debug('clientUser', clientUser);

    return clientUser;
  }

  function getClientFriends () {};

  // get a list of distinct friends of the user's friends
  function getFriendsOfFriends (username) {

    var friendsOfFriends = new Set();

    var user = state.users.byUserName.get(username);

    user.friends.forEach(function (friend) {
      friend.friends.forEach(function (friendOfFriend) {
        // if the friendOfFriend is not one of the user's friends
        if (!user.friends.has(friendOfFriend.id) && !friendsOfFriends.has(friendOfFriend.id)) {
          friendsOfFriends.add(friendOfFriend.username);
        }
      });
    });

    return friendsOfFriends;
  }; // getFriendsOfFriends

  function notify (userIds, eventName, eventParams) {

    debug('userIds', userIds);

    if (!Array.isArray(userIds)) {
      userIds = [ userIds ];
    }

    debug('state.sockets.byUserId.size', state.sockets.byUserId.size);

    userIds.forEach(function (userId) {
      if (userId instanceof mongoose.Schema.Types.ObjectId) {
        userId = userId.toString();
      }

      state.sockets.byUserId.get(userId).forEach(function (socket) {
        socket.emit(eventName, eventParams);
      });
    });
  }; // notify

  function publish (feed, eventName, eventParams) {
    io.to(feed).emit(eventName, eventParams);
  }; // publish

};

Offtherecord_transport.prototype = new events.EventEmitter();
