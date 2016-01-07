"use strict";

// node core modules
var events  = require('events');
var fs      = require('fs');
var https   = require('https'); 
var path    = require('path');
var util    = require('util');

// off-the-record core modules
var config            = require('./config');
var env               = require('./env');
var ssl               = require('./ssl');
var utils             = require('techjeffharris-utils');
var BinaryTransfer    = require('./BinaryTransfer');
var TextMessage       = require('./TextMessage');

// 3rd party
var async             = require('async');
var bodyParser        = require('body-parser');
var cookieParser      = require('cookie-parser');
var debug             = require('debug')(env.package.name);
var express           = require('express'); 
var expressSession    = require('express-session');
var favicon           = require('serve-favicon');
var mongoose          = require('mongoose');
var passport          = require('passport');
var passportSocketIo  = require('passport.socketio');
var serveStatic       = require('serve-static');
var socketio          = require('socket.io');

debug('config', config);

var Data = require('./data');

module.exports = OffTheRecord_Server;

function OffTheRecord_Server (options) {

  // makes it work with or without new ! how neat!
  if (!(this instanceof OffTheRecord_Server)) return new OffTheRecord_Server();

  var ERROR_NOT_ALLOWED       = 'you are not allowed to do that.';
  var ERROR_CONVO_NOT_FOUND   = 'conversation found found';
  var ERROR_REQUEST_NOT_FOUND = 'request not found';
  var ERROR_USER_NOT_FOUND    = 'user not found';
  var ERROR_INVALID_INVITEES  = 'invitees must be an array with at least one element that must not contain the starter\'s username!';

  var self = this;

  var app;
  var cachedResponses = {};
  var clients = new Set();
  var io;
  var routesToCache = ['index', 'login', 'register', 'app', '404', '500'];
  var server;
  var sessionConfig;
  var shutdownTimer;

  options = utils.extend(config, options);

  this.status = 'idle';

  // return the environment module
  this.env = function () {
    return env;
  };

  // define one-time handler for 'started' event
  this.once('started', function () {
    // output our fancy logo/banner
    process.stdout.write(env.banner());
  });

  // once the server has stopped
  this.once('stopped', function () {
    
  });

  this.once('timeout', function () {
    debug('shutdown timeout');
  });

  // start the server
  this.start = function (onceStarted) {

    this.setStatus('starting');

    // if onceStarted is a function
    if (typeof onceStarted === 'function') {
      // define one-time handler for 'started' event
      this.once('started', function () {
        // call onceStarted 
        onceStarted();
      });
    }

    if (process.env.NODE_ENV === 'production') {
      // run the iterator for each item in the array in parallel
      async.each(routesToCache, function (route, complete) {

        var chunks = [];

        // read the route's html file
        var readStream = fs.createReadStream(__dirname + '/html/' + route + '.html');

        readStream.on('data', function fileReadData (chunk) {
          chunks.push(chunk);
        });

        readStream.once('end', function fileReadEnd () {
          
          // once we're finished reading each file add it to cachedResponses
          cachedResponses[route] = Buffer.concat(chunks);
          // now tell async.each that we're done with this entry in the array
          complete();
        });

        readStream.once('error', function fileReadError (err) {
          // if there's an error, I want to know about it!
          complete(err);
        })
          
        
      }, startData);      
    } else {
      startData();
    }
  };

  this.stop = function (onceStopped) {

    this.setStatus('stopping');

    // once the server has stopped
    this.once('stopped', function () {

      clearTimeout(shutdownTimer);

      // if onceStopped is a function
      if (typeof onceStopped === 'function') {
        // call onceStopped
        onceStopped();
      }
    });

    // emit the stopping event
    this.emit('stopping');

    // set a timeout (default 5s) to wait for the server to shutdown before
    // pulling the plug
    shutdownTimer = setTimeout(function shutdownTimeout() {
      // output to debug that shutdown has reached its timeout
      debug('shutdown timeout');
      // emit the timeout event
      self.emit('timeout'); 

      // stop the process with exit code 0
      process.exit();
    }, config.shutdownTimeout);

    // tell every connected socket that the server is shutting down
    io.server.emit('shutdown');

    debug('%s socket.io clients connected, closing...', io.sockets.length);

    // tell the HTTP server (to which socket.io has attached route handlers)
    // to stop accepting new connections
    server.close();

    // it appears that chrome (and others?) keeps open http clients for a while...
    debug('%s http client(s) connected', clients.size);

    if (clients.size === 0) {
      this.setStatus('stopped');
    } else {
      // close them all!
      clients.forEach((client) => {
        debug('closing http client...');
        client.end();
      });
    }
    return true;
  };


  function startData () {
    // create a new data layer instance
    self.data = new Data();
  
    // handle data layer error events
    self.data.on('error', function (err) {
      // pass the error along, hoping it is handled at the server instance level
      self.emit('error', err);
    });

    // set one-time handler for when the data layer has started
    self.data.once('started', function () {
    
      self.data.state.on('login', function (user) {
        debug(user.username + ' logged in');
        publish(user.id, 'friends:login', user.username);
      });

      self.data.state.on('logout', function (user) {
        debug(user.username + ' logged out');
        publish(user.id, 'friends:logout', user.username);
      });

      startHTTP();

    });

    // once the data layer has stopped
    self.data.once('stopped', function dataStopped() {
      // the server is ready to perform user-specified shutdown proceedures
      self.emit('stopped');
    });
    
    // start the data layer
    self.data.start();
  }

  function startHTTP () {
    
    // create the express app
    app = express();

    // tell the app what port we're using (even though we )
    app.set('port', config.http.port);

    app.use(favicon(path.join(__dirname, 'static/images/favicon.ico')));

    // setup the body and cookie parsers
    app.use(bodyParser.urlencoded({ extended: true }));
    app.use(cookieParser());

    // setup session configuration
    sessionConfig = config.http.session
    sessionConfig.store = self.data.getSessionStore();

    // tell the app to handle sessions
    app.use(expressSession(sessionConfig));

    // setup passport
    app.use(passport.initialize());
    app.use(passport.session());

    // redirect all http traffic to https
    app.all('*', function redirectSec(req, res, next) {
      if (req.headers['x-forwarded-proto'] == 'http') {
          res.end(jsRedirect('https://' + req.headers.host + req.path));
      } else {
          return next();
      }
    });

    ////////////////////////////////////////////////////////////////////////////////
    //
    //  PUBLICALLY ACCESSIBLE ROUTES
    //
    ////////////////////////////////////////////////////////////////////////////////
    
    app.get('/', cachedResponse);
    app.get('/404', cachedResponse);
    app.get('/500', cachedResponse);
    
    app.get('/login', function (request, response) {
      if (request.isAuthenticated()) response.end(jsRedirect('/app'));
      else cachedResponse(request, response);
    });

    app.get('/register', function (request, response) {
      if (request.isAuthenticated()) response.end(jsRedirect('/app'));
      else cachedResponse(request, response);
    });

    // GET requests for /logout will kill the users session and redirect to root
    app.get('/logout', function (request, response) {

      if (request.isAuthenticated()) {
        request.logOut();
      } 

      response.end(jsRedirect('/'));
      
    });

    // POST requests for /login will attempt to authenticate the given user
    app.post('/login', function (request, response) {
      var failRedirect = '/login?error=true';

      // make sure they entered both a username and password
      if (!request.body.username || !request.body.password) {
        return response.end(jsRedirect(failRedirect));
      }

      // get the user from the state
      var user = self.data.state.users.byUserName.get(request.body.username);

      // make sure the user is not undefined 
      if (!user) return response.end(jsRedirect(failRedirect));

      // try to authenticate the user with the provided password
      user.authenticate(request.body.password, function (err, user) {
        // if authentication fails, redirect to login
        if (err || !user) return response.end(jsRedirect(failRedirect)); 

        // if we made it this far, we have authenticated the user, so log on the user
        request.login(user, function (err) {
          // in the event that there's some kind of error...
          if (err) return response.end(jsRedirect(failRedirect));

          // if no error, they are logged in, so redirect them to /app
          response.end(jsRedirect('/app'));
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
        return response.end(jsRedirect(failRedirect));
      } 

      // register the new user
      self.data.user.register(newUser, request.body.password, function onceRegistered (err, user) {
        if (err) return response.end(jsRedirect(failRedirect));

        // add the new user to the state
        self.data.state.users.add(user);

        response.end(jsRedirect('/app'));
      });
    }); 

    
    ////////////////////////////////////////////////////////////////////////////////
    //
    //  Main application route - requires authentication
    //
    ////////////////////////////////////////////////////////////////////////////////

    app.get('/app', verifySession, cachedResponse);

    ////////////////////////////////////////////////////////////////////////////////
    //
    //  OTHER REQUESTS
    //
    ////////////////////////////////////////////////////////////////////////////////

    app.get('/scripts/debug.js', function (request, response) {

      let browswerDebugPath = path.join(env.prefix, 'node_modules/debug/browser.js');

      fs.createReadStream(browswerDebugPath).pipe(response);
    });

    // serve static content if no routes were found
    // yes, this content is read from disk per-response, could be cached
    app.use(serveStatic(path.join(__dirname, 'static')));

    // render 404 if a static file is not found
    app.use(function (request, response) {

      response.end(jsRedirect('/404'));
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
    
    function cachedResponse (request, response) {

      var route = (request.path === '/') ? 'index' : request.path.split('/')[1];

      debug('route', request.path);

      if (process.env.NODE_ENV === 'production') {
        var res = cachedResponses[route];

        debug('res', res);
        
        
        response.writeHead(
          200,
          {
            "Content-Type": "text/html",
            "Content-Length": Buffer.byteLength(res)
          }
        );

        response.end(res);
        
      } else {
        fs.createReadStream(path.join(__dirname,'html', route + '.html')).pipe(response);
      }


    }  

    function verifySession (request, response, next) {

      if (request.isAuthenticated()) {
        debug('%s is authenticated', request.user.username);
        return next();

      } else  {
        debug('client is NOT authenticated');
        response.end(jsRedirect());
      }
    }

    function jsRedirect (url) {

      url = url || '/login';

      return '<!DOCTYPE html><html><head><script>window.location.href = "' + url + '"</script></head></html>';
    }

  }











  function startRealtime () {

    // passport.socketio authorization options
    // @see: http://github.com/jfromaniello/passport.socketio
    var authOptions = {
      key:            config.http.session.key,
      passport:       passport,
      secret:         config.http.session.secret, 
      store:          self.data.getSessionStore(),
      fail:           function (data, message, error, next) {
        debug('socket.io auth err:', message);
        next(new Error(message));
      }
    };

    // create socket.io server from server started by http module
    // io will be equal to the default namespace after as returned by
    // .use and .on
    io = socketio(server)
      .serveClient(false)

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

      socket.on('error', socketError);
      socket.on('disconnect', socketDisconnect);

      debug('socket connect');

      // get the user from cache 
      socket.user = self.data.state.users.get(socket.request.user.id);

      // make sure the user is not undefined
      if (!socket.user) {
        return socket.emit('error', ERROR_USER_NOT_FOUND);
      }

      // add the socketId to this user's cache
      self.data.state.sockets.connect(socket.user.id, socket);

      // debug(socket.user.username + '\'s state:', self.data.state.users.get(socket.user.id));
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
          self.data.state.transfers.get(transferId).chunk(fileId, chunkId, chunk);
        }

        catch (err) {
          publish(transferId, 'convos:binary:error', {transferId: transferId, error: err });
        }
        
        // confirm with the sending socket that this chunk was received (don't send the chunk)
        socket.emit('convos:binary:chunk', convoId, socket.user.username, transferId, fileId, chunkId);

        // send the chunk to all sockets (except the sending socket) who were 
        // connected when the transfer was initialized. 
        socket.broadcast.to(transferId).emit('convos:binary:chunk', convoId, socket.user.username, transferId, fileId, chunkId, chunk);

      } // convosBinaryChunk

      function convosBinaryInit (convoId, filesInfo, ready) {

      // send a file to a conversation

        debug('request to transfer %s files: ', filesInfo.length);

        // create a new BinaryTransfer instance for the given filesInfo
        var transfer = self.data.state.transfers.init(convoId, new BinaryTransfer(filesInfo));

        // tell all users in the conversation that there is an incoming binary transfer
        publish(convoId, 'convos:binary:incoming', convoId, socket.user.username, transfer);

        ready();

      } // convosBinaryInit

      // boot a user from a conversation
      function convosBoot (convoId, user, done) {

        // remove the user from conversation.invitees
        // 
        // make all of the booted user's sockets leave the room
        // 
        
        done();

      } // convosBoot

      function convosEnd (convoId, done) { 

        var convo = self.data.state.convos.get(convoId);

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
          self.data.state.convos.remove(convoId);

          done(null, result);

        });

      } // convosEnd

      function convosGet (done) {

        var convos = [];

        socket.user.convos.forEach(function (convoId) {
          convos.push(getClientConvo(convoId));
        });

        done(null, convos);

      } // convosGet

      // invite one ore more users to an existing conversation
      function convosInvite (convoId, invitees, done) {

        // var conversation = self.data.state.convos[convoId];

        // if (conversation.convo.isStarter)

        // if (!Array.isArray(invitees)) {
        //   if (invitees instanceof mongoose.Schema.Types.ObjectId) {

        //   }
        // } 

        done();

      } // convosInvite

      // used to handle when a newly invited user has joined the conversation 
      function convosJoin (convoId, userId, done) {

        done();


      } // convosJoin 

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

          invitee = self.data.state.users.byUserName.get(invitee);

          var allowed = self.data.state.getPermissions(socket.user.id, invitee.id).has('startConversation');

          if (allowed) {

            var msg = util.format('%s %s %s to start a conversation',
              invitee.username,
              (allowed) ? 'allows' : 'does not allow',
              socket.user.username
            );

            debug(msg);

            if (!allowed) {
              invitees.splice(key, 1);
            } else {

              debug('self.data.state.users[%s]: %s', invitee.username, invitee);

              invited.push(invitee._id);
            }
          }
        });
      
        debug('invitees', invitees);
        debug('invited', invited);

        // create the conversation document
        convo = self.data.state.convos.add(new self.data.conversation({
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

          if (self.data.state.online.has(member.id)) {

            // tell everyone in the conversation that this user has joined
            publish(convo.id, 'convos:entered', { convo: convo.id, user: member.username });
          }
        });

        done(null, clientConvo);
        
      } // convosStart

      function convosText (convoId, msg, done) {

        // send a message to a conversation

        var convo = self.data.state.convos.get(convoId);

        debug('convo', convo)

        debug('socket.user.username', socket.user.username);

        if (convo && convo.isMember(socket.user.id)) {

          let message = new TextMessage(convoId, socket.user.username, msg);

          debug('sending message', message);

          io.in(convoId).emit('convos:text', message);
          return done();

        } else {
          return done(ERROR_NOT_ALLOWED);
        }
     
      } // convosText

      function friendsPermissions (done) {

        debug('friends - ' + socket.user.username);

        var permissions = {
          friends: {},
          sent: {},
          received: {}
        };

        debug('socket.user.friends', socket.user.friends);

        socket.user.friends.forEach((friend) => {
          permissions.friends[friend.username] = Array.from(self.data.state.getPermissions(socket.user.id, friend.id));
        });

        socket.user.requests.sent.forEach((requested) => {
          permissions.sent[requested.username] = Array.from(self.data.state.getPermissions(socket.user.id, requested.id));
        });

        socket.user.requests.received.forEach((requester) => {
          permissions.received[requester.username] = Array.from(self.data.state.getPermissions(socket.user.id, requester.id));
        });        

        debug('permissions', permissions);
        
        done(null, permissions);

      } // friends

      function friendsOnline (done) {

        done(null, socket.user.friends.online());

      } // getOnlineFriends

      function friendsUnfriend (friendUsername, done) {

        var friend = self.data.state.users.byUserName.get(friendUsername);
        var friendship = self.data.state.friendships.getByUserIds(socket.user.id, friend.id);

        debug('friend', friend);
        debug('friendship', friendship);
        
        if (!friend || !friendship) return done(ERROR_NOT_ALLOWED);

        debug(socket.user.username + ' wants to unfriend ' + friendUsername);
   
        self.data.state.friendships.remove(friendship.id);

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
      } // friendsUnfriend

      function privacyUpdate(updates, done) {
        if ('function' !== typeof done) {
          done = function () {};
        }

        debug('updates to '+socket.user.username+"'s privacy:", updates);

        var conditions = { username: socket.user.username };
        var updatesToUser = { privacy: updates };

        self.data.user.findOneAndUpdate(conditions, updatesToUser, function (err, updatedUser) {
          if (err) return done(err);
          
          socket.user.privacy = updates;
          done(null, updatedUser);
        });
      } // privacyUpdate

      function profileUpdate (updates, done) {  
        if ('function' !== typeof done) {
          done = function () {};
        }

        debug('updates to '+socket.user.username+"'s profile", updates);

        var conditions = { username: socket.user.username };
        var updatesToUser = { profile: updates };

        self.data.user.findOneAndUpdate(conditions, updatesToUser, function(err, updatedUser) {
          if (err) return done(err);
          
          socket.user.profile = updates;
          done(null, updatedUser);
        });
      } // profileUpdate

      function profileView (username, done) {

        var requested = self.data.state.users.byUserName.get(username);

        if (!requested) return done(ERROR_USER_NOT_FOUND);

        var permissions = self.data.state.getPermissions(socket.user.id, requested.id);

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
        
      } // profileView

      function requestsAccept (username, done) {

        // get the requester
        var requester = self.data.state.users.byUserName.get(username);

        // if the requester doesn't exist, then pass an error to the callback
        if (!requester) return done(ERROR_USER_NOT_FOUND);

        var request = self.data.state.requests.byUserId.get(socket.user.id).get(requester.id);

        if (!request) return done(ERROR_REQUEST_NOT_FOUND);

        var friendship = self.data.state.requests.accept(request.id);

        debug('friendship', friendship);

        debug(util.format('%s accepted %s\'s friend request', 
              socket.user.username, 
              requester.username));

        debug(socket.user.username, socket.user);
        debug(requester.username, requester);

        // notify socket.user that they accepted the request
        notify(socket.user.id, 'requests:received:accepted', {
          from: requester.username,
          permissions: Array.from(self.data.state.getPermissions(socket.user.id, requester.id))
        });

        // notify the requester that their request was accepted
        notify(requester.id, 'requests:sent:accepted', {
          to: socket.user.username,
          permissions: Array.from(self.data.state.getPermissions(requester.id, socket.user.id))
        });

        done();

        socket.user.acceptRequest(requester.id, function (err, results) {
          if (err) console.error(err);
          else debug('results', results);
        });
      } // requestsAccept

      function requestsCancel (username, done) {

        // get the requested user 
        var requested = self.data.state.users.byUserName.get(username);

        // if the user doesn't exist, then pass an error to the callback
        if (!requested) return done(ERROR_USER_NOT_FOUND);

        var request = self.data.state.requests.byUserId.get(socket.user.id).get(requested.id);

        if (!request) return done(ERROR_REQUEST_NOT_FOUND);

        self.data.state.requests.remove(request.id);

        debug(util.format('%s canceled their friend request to %s', 
              socket.user.username, 
              requested.username));

        debug('request', request);
        debug('request', self.data.state.requests.get(request.id));

        debug(socket.user.username, socket.user);
        debug(requested.username, requested);

        notify(socket.user.id, 'requests:sent:canceled', requested.username);

        notify(requested.id, 'requests:received:canceled', socket.user.username);
        
        done();

        socket.user.cancelRequest(requested.id, function (err, results) {
          if (err) console.error(err);
          else debug('results', results.result);
        });

      } // requestsCancel

      function requestsDeny (username, done) {

        // get the requester user 
        var requester = self.data.state.users.byUserName.get(username);

        // if the user doesn't exist, then pass an error to the callback
        if (!requester) return done(ERROR_USER_NOT_FOUND);

        var request = self.data.state.requests.byUserId.get(socket.user.id).get(requester.id);

        if (!request) return done(ERROR_REQUEST_NOT_FOUND);

        self.data.state.requests.remove(request.id);

        debug(util.format('%s denied %s\'s friend request', 
              socket.user.username, 
              requester.username));

        debug('request', request);
        debug('request', self.data.state.requests.get(request.id));

        debug(socket.user.username, socket.user);
        debug(requester.username, requester);

        notify(socket.user.id, 'requests:received:denied', requester.username);

        notify(requester.id, 'requests:sent:denied', socket.user.username);
        
        done();

        socket.user.cancelRequest(requester.id, function (err, results) {
          if (err) console.error(err);
          else debug('results', results.result);
        });
      } // requestsDeny

      function requestsSend (username, done) {

        debug('username', username);

        // get the requested user 
        var requested = self.data.state.users.byUserName.get(username);

        debug('requested', requested);
        
        debug(util.format('%s wants to send %s a friend request', 
              socket.user.username,
              requested.username
              ));
        
        var friendship = socket.user.friends.has(requested.id);
        var pendingRequest = self.data.state.requests.byUserId.get(socket.user.id).get(requested.id);

        // if the user doesn't exist, then pass an error to the callback
        if (!requested) {
          debug(ERROR_USER_NOT_FOUND);
          return done(ERROR_USER_NOT_FOUND);
        // if the requested user allows the requester to send a friend request
        } else if (!self.data.state.getPermissions(socket.user.id, requested.id).has('friendRequest')) {
          debug(ERROR_NOT_ALLOWED);
          return done(ERROR_NOT_ALLOWED);
        // make sure they aren't friends or have a pending request
        } else if (friendship || pendingRequest) {
          debug(ERROR_NOT_ALLOWED);
          return done (ERROR_NOT_ALLOWED);
        }

        var request = self.data.state.requests.add(new self.data.user.Friendship({
          requester: socket.user._id,
          requested: requested._id
        }));

        debug('request', request);

        var clientRequest = request.toObject();

        clientRequest.requester = socket.user.username;
        clientRequest.requested = requested.username;
        
        debug('clientRequest', clientRequest);

              
        debug(socket.user.username, socket.user);
        debug(requested.username, requested);

        var socketUserPermissions = Array.from(self.data.state.getPermissions(socket.user.id, requested.id));
        var requestedUserPermissions = Array.from(self.data.state.getPermissions(requested.id, socket.user.id));

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
        
      } // requestsSend

      function socketDisconnect () {
        
        // remove the socket from the state
        self.data.state.sockets.disconnect(socket.id)

        debug('%s socket.io clients connected', io.sockets.length);

      } // socketDisconnect

      function socketError (err) {
        debug('socket error: ', err);
        console.error(err);
      } // socketError

      function usersDelete (done) {
        debug('users:delete', socket.user.username);

        var sockets = socket.user.sockets;

        self.data.state.users.remove(socket.user.id);

        // remove from db
        socket.user.remove(function (err, results) {
          if (err) return done(err);
          debug('results', results);
          debug('looks like I got removed!');
          done(null, true);

          // disconnect all sockets
          sockets.forEach(function (socket) {
            socket.emit('account:deleted');
            socket.disconnect();
          });
        });
      } // usersDelete

      function usersPermissions (usernames, done) {

        var permissions = {};

        if (!Array.isArray(usernames)) {
          usernames = [usernames];
        }

        usernames.forEach((username) => {
          var userId = self.data.state.users.byUserName.get(username).id;

          permissions[username] = Array.from(self.data.state.getPermissions(socket.user.id, userId));

        });

        done(null, permissions);
      } // usersPermissions


      function usersSearch (findParams, done) {

        debug('searching for users');

        debug('findParams', findParams);

        findParams = utils.extend({}, findParams);

        findParams.conditions = utils.extend({}, findParams.conditions);
        
        var username  = findParams.conditions.username;
        findParams.conditions.username = new RegExp(username, "i");
        
        findParams.projection = '_id';
        
        debug('findParams', findParams);
      
        socket.user.search(findParams, function (err, searchResults) {
          if (err) return done(err);

          debug('searchResults', searchResults);

          var clientResults = {};

          for (var cat in searchResults) {
            clientResults[cat] = {
              users: [],
              permissions: {}
            };

            debug('searchResults[' + cat + '].permissions', searchResults[cat].permissions);
            
            searchResults[cat].users.forEach(function (user, index) {

              debug(index, user);

              clientResults[cat].users[index] = user.username; 
              clientResults[cat].permissions[user.username] = searchResults[cat].permissions[index];

              debug('clientResults[' + cat + '].permissions["' + user.username + '"]', clientResults[cat].permissions[user.username]);

            });
          }

          debug('clientResults', clientResults);

          done(null, clientResults);
        });
      } // usersSearch

      

    } // socketConnect

  } // startRealtime

  function getClientConvo (convoId) {
    var convo = self.data.state.convos.get(convoId);

    debug('convo', convo);

    var clientConvo = {
      id: convo.id,
      starter: self.data.state.users.get(convo.starter.toString()).username,
      invitees: [],
      members: [],
      messages: [],
      transfers: [],
      events: []
    };

    convo.invitees.forEach(function (invitee) {
      clientConvo.invitees.push(self.data.state.users.get(invitee.toString()).username)
    });

    convo.members.forEach(function (member) {
      clientConvo.members.push(member.username);
    });

    debug('clientConvo', clientConvo);

    return clientConvo;
    
  } // getClientConvo

  function getClientUser (userId) {
    var user = self.data.state.users.get(userId);

    debug('user', user);
    debug('user.friends', user.friends);
    debug('user.requests', user.requests);
    debug('user.convos', user.convos);

    var clientFriends = new Set();
    var clientConvos = new Map();
    var clientPermissions = new Map();
    var clientRequests = {
      sent: new Set(),
      received: new Set()
    };

    // get client-friendly list of the user's friends
    user.friends.forEach((friend) => {

      // add the friend's username to the clientUser's friends array
      clientFriends.add(friend.username);

      if (!clientPermissions.has(friend.username)) {
        // get the user's permissions for the friend
        clientPermissions.set(friend.username, Array.from(self.data.state.getPermissions(userId, friend.id)));
      }

    });

    // get client-friendly list of the user's sent requests
    user.requests.sent.forEach((user) => {

      // add the user's username to the clientUser's sent requests array
      clientRequests.sent.push(user.username);

      // if we don't have the user's permissions for the user
      if (!clientPermissions.has(user.username)) {
        // get the user's permissions for the user
        clientPermissions.set(user.username, Array.from(self.data.state.getPermissions(userId, user.id)));
      }
    });

    // get client-friendly list of the user's received requests
    user.requests.received.forEach((user) => {

      // add the user's username to the clientUser's received requests array
      clientRequests.received.push(user.username);

      // if we don't have the user's permissions for the user
      if (!clientPermissions.has(user.username)) {
        // get the user's permissions for the user
        clientPermissions.set(user.username, Array.from(self.data.state.getPermissions(userId, user.id)));
      }
    });    

    // get client-friendly list of the user's convos
    user.convos.forEach((convo) => {
      // get the convo formatted for the client
      clientConvos[convo.id] = getClientConvo(convo.id);

      convo.members.forEach((member) => {

        // if we don't have the user's permissions for the member
        if (!clientPermissions.has(member.username)) {
          // get the user's permissions for the member
          clientPermissions.set(member.username, Array.from(self.data.state.getPermissions(userId, member.id)));
        }
      });
    });

    var clientUser = {
      username: user.username,
      profile: user.profile,
      privacy: user.privacy,
      friends: Array.from(clientFriends),
      requests: { 
        sent: Array.from(clientRequests.sent), 
        received: Array.from(clientRequests.received)
      },
      convos: Array.from(clientConvos),
      permissions: Array.from(clientPermissions),
      onlineFriends: Array.from(user.friends.online())
    };

    debug('clientUser', clientUser);

    return clientUser;
  }

  /**
   * 
   * get a list of distinct friends of the user's friends
   *
   */
  // function getFriendsOfFriends (username) {

  //   var friendsOfFriends = new Set();

  //   var user = self.data.state.users.byUserName.get(username);

  //   user.friends.forEach(function (friend) {
  //     friend.friends.forEach(function (friendOfFriend) {
  //       // if the friendOfFriend is not one of the user's friends
  //       if (!user.friends.has(friendOfFriend.id) && !friendsOfFriends.has(friendOfFriend.id)) {
  //         friendsOfFriends.add(friendOfFriend.username);
  //       }
  //     });
  //   });

  //   return friendsOfFriends;
  // } // getFriendsOfFriends

  function notify (userIds, eventName, eventParams) {

    debug('userIds', userIds);

    if (!Array.isArray(userIds)) {
      userIds = [ userIds ];
    }

    debug('self.data.state.sockets.byUserId.size', self.data.state.sockets.byUserId.size);

    userIds.forEach(function (userId) {
      if (userId instanceof mongoose.Schema.Types.ObjectId) {
        userId = userId.toString();
      }

      self.data.state.sockets.byUserId.get(userId).forEach(function (socket) {
        socket.emit(eventName, eventParams);
      });
    });
  } // notify

  function publish (feed, eventName, eventParams) {
    io.to(feed).emit(eventName, eventParams);
  } // publish



}

OffTheRecord_Server.prototype = new events.EventEmitter();

OffTheRecord_Server.prototype.setStatus = function (status) {
  this.status = status;
  debug(status);
  this.emit(status);
};
