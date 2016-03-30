"use strict";

// pmx probably patches http(s) so it needs to be called first
require('pmx').init({
  http          : true, // HTTP routes logging (default: true)
  ignore_routes : [/socket\.io/], // Ignore http routes with this pattern (Default: [])
  errors        : true, // Exceptions loggin (default: true)
  custom_probes : true, // Auto expose JS Loop Latency and HTTP req/s as custom metrics
  network       : true, // Network monitoring at the application level
  ports         : true  // Shows which ports your app is listening on (default: false)
});


// node core modules
let events  = require('events');
let fs      = require('fs');
let https   = require('https'); 
let path    = require('path');
let util    = require('util');

// off-the-record core modules
let config            = require('./config');
let env               = require('./env');
let ssl               = require('./ssl');
let BinaryTransfer    = require('./binary');
let TextMessage       = require('./text');

// 3rd party
let async             = require('async');
let bodyParser        = require('body-parser');
let cookieParser      = require('cookie-parser');
let debug             = require('debug');
let express           = require('express'); 
let expressSession    = require('express-session');
let favicon           = require('serve-favicon');
let mongoose          = require('mongoose');
let passport          = require('passport');
let passportSocketIo  = require('passport.socketio');
let serveStatic       = require('serve-static');
let socketio          = require('socket.io');
let utils             = require('techjeffharris-utils');
let vantage           = require('vantage');

let log = debug(env.package.name);

log('config', config);

let Data = require('./data');

module.exports = OffTheRecord_Server;

function OffTheRecord_Server (options) {

  // makes it work with or without new ! how neat!
  if (!(this instanceof OffTheRecord_Server)) return new OffTheRecord_Server();

  let ERROR_NOT_ALLOWED       = 'you are not allowed to do that.';
  let ERROR_CONVO_NOT_FOUND   = 'conversation found found';
  let ERROR_REQUEST_NOT_FOUND = 'request not found';
  let ERROR_USER_NOT_FOUND    = 'user not found';
  let ERROR_INVALID_INVITEES  = 'invitees must be an array with at least one element that must not contain the starter\'s username!';

  let self = this;

  let app;
  let banner = env.banner()
  let cachedResponses = {};
  let cli
  let clients = new Map()
  let io;
  let routesToCache = ['index', 'login', 'register', 'app', '404', '500'];
  let server;
  let sessionConfig;
  let shutdownTimer;

  options = utils.extend(config, options);

  this.status = 'ready';

  // environment module
  this.env = env;
  
  // freeze it to prevent changes
  Object.freeze(this.env);

  // define one-time handler for 'started' event
  this.once('started', function () {

    startCLI()
   
  });

  this.on('started', () => {

    process.nextTick(() => {
      this.setStatus('listening')
    })
  })

  this.on('listening', () => {
    if (process.env.NODE_ENV !== 'test') {
      process.stdout.write(banner)
    }
  })

  // once the server has stopped
  this.once('stopped', function () {
    clearTimeout(shutdownTimer);

  });

  this.once('timeout', function () {
    log('shutdown timeout');

    // stop the process
    process.exit();
  });

  // create a new data layer instance
  this.data = new Data();

  // handle data layer error events
  this.data.on('error', function (err) {
    // pass the error along, hoping it is handled at the server instance level
    self.emit('error', err);
  });

  // set one-time handler for when the data layer has started
  this.data.once('started', function () {
  
    self.data.state.on('login', function (user) {
      log(user.username + ' logged in');
      publish(user.id, 'friends:login', user.username);
    });

    self.data.state.on('logout', function (user) {
      log(user.username + ' logged out');
      publish(user.id, 'friends:logout', user.username);
    });

  });

  this.data.on('started', startHTTP)

  // once the data layer has stopped
  this.data.on('stopped', function dataStopped() {
    // the server is ready to perform user-specified shutdown procedures
    self.setStatus('stopped');

    process.nextTick(() => self.setStatus('idle'))
  });

  // start the server
  this.start = function (onceStarted) {

    if ('function' !== typeof onceStarted) {
      onceStarted = function () {}
    }

    this.once('started', onceStarted);

    this.setStatus('starting');

    if (process.env.NODE_ENV === 'production') {
      // run the iterator for each item in the array in parallel
      async.each(routesToCache, function (route, complete) {

        let chunks = [];

        // read the route's html file
        let readStream = fs.createReadStream(__dirname + '/html/' + route + '.html');

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
          
        
      }, (err) => {
        if (err) return self.emit('error', err)

        self.data.start()
      });      
    } else {
      self.data.start();
    }
  };

  this.stop = function (onceStopped) {

    this.setStatus('stopping');

    // if onceStopped is NOT a function
    if ('function' !== typeof onceStopped) {
      onceStopped = function () {}
    }

    this.once('stopped', onceStopped)

    // set a timeout (default 5s) to wait for the server to shutdown before
    // pulling the plug
    shutdownTimer = setTimeout(function shutdownTimeout() {
      // emit the timeout event
      self.setStatus('timeout'); 

    }, config.shutdownTimeout);

    // tell every connected socket that the server is shutting down
    io.server.emit('shutdown');

    log('io', io)

    log('%s socket.io clients connected, closing...', io.sockets.length);

    // tell the HTTP server (to which socket.io has attached route handlers)
    // to stop accepting new connections
    server.close();

    // it appears that chrome (and others?) keeps open http clients for a while...
    log('%s http client(s) connected', clients.size);

    if (clients.size === 0) {
      this.data.stop();
    } else {
      
      clients.forEach((busy, client) => {

        log(util.format('client %s %s busy',
          client._handle.fd,
          (busy) ? 'is' : 'is not'  
        ))

        if (!busy) {
          log('closing idle http client...');
          client.end(); 
        }
      });
    }
    return true;
  };

  function startCLI () {
    // create an awesome vantage CLI
    cli = vantage()

    // setup the status command
    cli
      .command('status')
      .alias('stat')
      .description('Get the current server status.')
      .action(function (args, callback) {
        this.log(self.status)
        callback()
      })

    // setup the start command
    cli
      .command('start') 
      .description('Start the server.')
      .action(function (args, callback) {
        const ALLOWED_STATUS = 'idle'
        if (self.status !== ALLOWED_STATUS) {
          this.log(`The server may only be started when "${ALLOWED_STATUS}".`)
          callback(false)
        } else {
          self.start()
          callback()
        }
      })


    // setup the shutdown command
    cli
      .command('stop')
      .alias('shutdown')
      .description('Stop the server gracefully.')
      .action(function (args, callback) {
        const ALLOWED_STATUS = 'listening'
        if (self.status !== ALLOWED_STATUS) {
          this.log(`The server may only be stopped when "${ALLOWED_STATUS}".`)
          callback(false)
        } else {
          self.stop()
          callback()
        }
      })

    // setup the kill command
    cli
      .command('kill')
      .alias('kl')
      .description('Stop the server forcefully.')
      .action(function () {
        process.exit()
      })

    // setup the restart command
    cli
      .command('restart')
      .alias('rs')
      .description('Restart the server gracefully.')
      .action(function (args, callback) {
        self.stop(function () {
          self.start(callback)
        })
      })

    // setup the memory command
    cli
      .command('memory')
      .alias('mem')
      .description('Show current memory usage.')
      .action(function (args, callback) {

        let memUsage = process.memoryUsage()

        let rss = memUsage.rss
        let heapTotal = memUsage.heapTotal
        let heapUsed = memUsage.heapUsed

        var output = util.format(`
      rss:  %s MB    %s KB    %s B
heapTotal:  %s MB    %s KB    %s B
 heapUsed:  %s MB    %s KB    %s B
`,
          Number(rss/utils.MB).toFixed(2),        Number(rss/utils.KB).toFixed(2),        rss,       
          Number(heapTotal/utils.MB).toFixed(2),  Number(heapTotal/utils.KB).toFixed(2),  heapTotal, 
          Number(heapUsed/utils.MB).toFixed(2),   Number(heapUsed/utils.KB).toFixed(2),   heapUsed  
        )

        this.log(output)
        callback()
      })

    // setup the clients command
    cli
      .command('clients', 'Show currently connected clients.')
      .action(function (args, callback) {
        
        this.log(clients.size + ' clients connected:')

        for (let client of clients) {

          this.log(client._handle.fd)
        }
        callback()
      })

    let delimiter = self.env.serverName + '$';
    let cliOpts = utils.extend({
      port: config.cli.port,
      ssl: true
    }, ssl.data)

    cli
      // setup the prompt 
      .delimiter(delimiter)
      // have it output our banner
      .banner(banner)
      // create a vantage server hosted over httpss
      .listen(() => {}, cliOpts)

    // if procerss.stdout is a TTY, show the CLI
    if (process.stdout.isTTY) {
      cli.show();
    }
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
    
    app.get('/login', redirectIfLoggedIn, cachedResponse);
    app.get('/register', redirectIfLoggedIn, cachedResponse);

    // GET requests for /logout will kill the users session and redirect to root
    app.get('/logout', function (request, response) {

      if (request.isAuthenticated()) {
        request.logOut();
      } 

      response.end(jsRedirect('/'));
      
    });

    // POST requests for /login will attempt to authenticate the given user
    app.post('/login', function (request, response) {
      let failRedirect = '/login?error=true';

      // make sure they entered both a username and password
      if (!request.body.username || !request.body.password) {
        return response.end(jsRedirect(failRedirect));
      }

      // get the user from the state
      let user = self.data.state.users.byUserName.get(request.body.username);

      // make sure the user is not undefined 
      if (!user) return response.end(jsRedirect(failRedirect));

      setClientBusy(request.socket)

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
          setClientIdle(request.socket)
        });
      });  
    });

    app.post('/register', function (request, response) {

      let failRedirect = '/register?error=true';
      
      // define the new user 
      // who needs input validation?  NOT THIS GUY!
      let newUser = {
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

      setClientBusy(request.socket)

      // register the new user
      self.data.user.register(newUser, request.body.password, function onceRegistered (err, user) {
        if (err) return response.end(jsRedirect(failRedirect));

        // add the new user to the state
        self.data.state.users.add(user);

        response.end(jsRedirect('/app'));

        setClientIdle(request.socket)
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
    server.on('connection', function (socket) {

      // this socket isn't busy unless it does an async task
      // so each request handler must toggle the busy state
      clients.set(socket, false)

      log('http socket connected');
      log('%s http socket(s) connected', clients.size);

      socket.once('close', function () {

        log('http socket disconnected');

        clients.delete(socket)
      
        log('%s http socket(s) connected', clients.size);

        if (self.status === 'stopping' && clients.size === 0) {
          self.data.stop()
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

      let route = (request.path === '/') ? 'index' : request.path.split('/')[1];

      log('route', request.path);

      if (process.env.NODE_ENV === 'production') {
        let res = cachedResponses[route];

        log('res', res);
        
        
        response.writeHead(
          200,
          {
            "Content-Type": "text/html",
            "Content-Length": Buffer.byteLength(res)
          }
        );

        response.end(res);
        
      } else {

        setClientBusy(request.socket)

        response.once('finish', function () {
          setClientIdle(request.socket)
        })

        fs.createReadStream(path.join(__dirname,'html', route + '.html')).pipe(response);
      }


    }

    function redirectIfLoggedIn (request, response, next) {
      if (request.isAuthenticated()) response.end(jsRedirect('/app'));
      else next();
    }

    function verifySession (request, response, next) {

      if (request.isAuthenticated()) {
        log('%s is authenticated', request.user.username);
        return next();

      } else  {
        log('client is NOT authenticated');
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
    let authOptions = {
      key:            config.http.session.key,
      passport:       passport,
      secret:         config.http.session.secret, 
      store:          self.data.getSessionStore(),
      fail:           function (data, message, error, next) {
        log('socket.io auth err:', message);
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

    log('started');
    self.status = 'started';
    self.emit('started'); 

    // when a socket connects 
    function socketConnect (socket) {

      ///////////////////////////////////////
      // socket.io reserved event handlers //
      ///////////////////////////////////////

      socket.on('error', socketError);
      socket.on('disconnect', socketDisconnect);

      log('socket connect');

      // get the user from cache 
      socket.user = self.data.state.users.get(socket.request.user.id);

      // make sure the user is not undefined
      if (!socket.user) {
        return socket.emit('error', ERROR_USER_NOT_FOUND);
      }

      // add the socketId to this user's cache
      self.data.state.sockets.connect(socket.user.id, socket);

      // log(socket.user.username + '\'s state:', self.data.state.users.get(socket.user.id));
      // log(socket.user.username + '\'s sockets:', socket.user.sockets);

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

        log('request to transfer %s files: ', filesInfo.length);

        // create a new BinaryTransfer instance for the given filesInfo
        let transfer = self.data.state.transfers.init(convoId, new BinaryTransfer(filesInfo));

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

        let convo = self.data.state.convos.get(convoId);

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

        let convos = new Map();

        socket.user.convos.forEach(function (convoId) {
          convos.set(convoId, getClientConvo(convoId));
        });

        let convosArr = Array.from(convos);

        log('convosArr', convosArr);

        done(null, convosArr);

      } // convosGet

      // invite one ore more users to an existing conversation
      function convosInvite (convoId, invitees, done) {

        // let conversation = self.data.state.convos[convoId];

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

        log('invitees', invitees);

        if (!Array.isArray(invitees) || invitees.length === 0) {
          return done(ERROR_INVALID_INVITEES);
        }

        log(socket.user.username + ' wants to start a conversation with ' + invitees);

        let invited = [];
        let convo;
        
        invitees.forEach(function (invitee, key) {

          log('invitees[%s]: %s', key, invitee);

          invitee = self.data.state.users.byUserName.get(invitee);

          let allowed = self.data.state.getPermissions(socket.user.id, invitee.id).has('startConversation');

          if (allowed) {

            let msg = util.format('%s %s %s to start a conversation',
              invitee.username,
              (allowed) ? 'allows' : 'does not allow',
              socket.user.username
            );

            log(msg);

            if (!allowed) {
              invitees.splice(key, 1);
            } else {

              log('self.data.state.users[%s]: %s', invitee.username, invitee);

              invited.push(invitee._id);
            }
          }
        });
      
        log('invitees', invitees);
        log('invited', invited);

        // create the conversation document
        convo = self.data.state.convos.add(new self.data.conversation({
          starter: socket.user._id,
          invitees: invited
        }));

        log('socket.request', socket.request)

        setClientBusy(socket.request.socket)

        // save the convo to the db        
        convo.save(function (err, savedConvo) {
          if (err) console.error(err);
          else log('savedConvo', savedConvo);

          setClientIdle(socket.request.socket)
        });

        let clientConvo = getClientConvo(convo.id);

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

        let convo = self.data.state.convos.get(convoId);

        log('convo', convo)

        log('socket.user.username', socket.user.username);

        if (convo && convo.isMember(socket.user.id)) {

          let msgParams = { 
            convoId: convoId, 
            sender: socket.user.username, 
            text: msg 
          };

          let message = new TextMessage(msgParams);

          log('sending message', message);

          io.in(convoId).emit('convos:text', message);
          return done();

        } else {
          return done(ERROR_NOT_ALLOWED);
        }
     
      } // convosText

      function friendsPermissions (done) {

        log('friends - ' + socket.user.username);

        let permissions = {
          friends: {},
          sent: {},
          received: {}
        };

        log('socket.user.friends', socket.user.friends);

        socket.user.friends.forEach((friend) => {
          permissions.friends[friend.username] = Array.from(self.data.state.getPermissions(socket.user.id, friend.id));
        });

        socket.user.requests.sent.forEach((requested) => {
          permissions.sent[requested.username] = Array.from(self.data.state.getPermissions(socket.user.id, requested.id));
        });

        socket.user.requests.received.forEach((requester) => {
          permissions.received[requester.username] = Array.from(self.data.state.getPermissions(socket.user.id, requester.id));
        });        

        log('permissions', permissions);
        
        done(null, permissions);

      } // friends

      function friendsOnline (done) {

        done(null, socket.user.friends.online());

      } // getOnlineFriends

      function friendsUnfriend (friendUsername, done) {

        let friend = self.data.state.users.byUserName.get(friendUsername);
        let friendship = self.data.state.friendships.getByUserIds(socket.user.id, friend.id);

        log('friend', friend);
        log('friendship', friendship);
        
        if (!friend || !friendship) return done(ERROR_NOT_ALLOWED);

        log(socket.user.username + ' wants to unfriend ' + friendUsername);
   
        self.data.state.friendships.remove(friendship.id);

        notify([socket.user.id, friend.id], 'friends:unfriended', { 
          unfriender: socket.user.username, 
          unfriended: friend.username
        });
        
        done(null, friend.username);

        log('socket.user.friends', socket.user.friends);
        log('friend.friends', friend.friends);

        setClientBusy(socket.request.socket)

        socket.user.endFriendship(friend.id, function (err, results) {
          if (err) console.error(err);
          else log(results.result);

          setClientIdle(socket.request.socket)
        });
      } // friendsUnfriend

      function privacyUpdate(updates, done) {
        if ('function' !== typeof done) {
          done = function () {};
        }

        log('updates to '+socket.user.username+"'s privacy:", updates);

        let conditions = { username: socket.user.username };
        let updatesToUser = { privacy: updates };

        setClientBusy(socket.request.socket)

        self.data.user.findOneAndUpdate(conditions, updatesToUser, function (err, updatedUser) {
          if (err) return done(err);
          
          socket.user.privacy = updates;
          done(null, updatedUser);
          setClientIdle(socket.request.socket)
        });
      } // privacyUpdate

      function profileUpdate (updates, done) {  
        if ('function' !== typeof done) {
          done = function () {};
        }

        log('updates to '+socket.user.username+"'s profile", updates);

        let conditions = { username: socket.user.username };
        let updatesToUser = { profile: updates };

        setClientBusy(socket.request.socket)

        self.data.user.findOneAndUpdate(conditions, updatesToUser, function(err, updatedUser) {
          if (err) return done(err);
          
          socket.user.profile = updates;
          done(null, updatedUser);

          setClientIdle(socket.request.socket)
        });
      } // profileUpdate

      function profileView (username, done) {

        let requested = self.data.state.users.byUserName.get(username);

        if (!requested) return done(ERROR_USER_NOT_FOUND);

        let permissions = self.data.state.getPermissions(socket.user.id, requested.id);

        // if NOT allowed to view their profile
        if (!permissions.has('profile')) return done(ERROR_NOT_ALLOWED);

        let userInfo = {
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
        let requester = self.data.state.users.byUserName.get(username);

        // if the requester doesn't exist, then pass an error to the callback
        if (!requester) return done(ERROR_USER_NOT_FOUND);

        let request = self.data.state.requests.byUserId.get(socket.user.id).get(requester.id);

        if (!request) return done(ERROR_REQUEST_NOT_FOUND);

        let friendship = self.data.state.requests.accept(request.id);

        log('friendship', friendship);

        log(util.format('%s accepted %s\'s friend request', 
              socket.user.username, 
              requester.username));

        log(socket.user.username, socket.user);
        log(requester.username, requester);

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

        setClientBusy(socket.request.socket)

        socket.user.acceptRequest(requester.id, debugOnlyCallback);
      } // requestsAccept

      function requestsCancel (username, done) {

        // get the requested user 
        let requested = self.data.state.users.byUserName.get(username);

        // if the user doesn't exist, then pass an error to the callback
        if (!requested) return done(ERROR_USER_NOT_FOUND);

        let request = self.data.state.requests.byUserId.get(socket.user.id).get(requested.id);

        if (!request) return done(ERROR_REQUEST_NOT_FOUND);

        self.data.state.requests.remove(request.id);

        log(util.format('%s canceled their friend request to %s', 
              socket.user.username, 
              requested.username));

        log('request', request);
        log('request', self.data.state.requests.get(request.id));

        log(socket.user.username, socket.user);
        log(requested.username, requested);

        notify(socket.user.id, 'requests:sent:canceled', requested.username);

        notify(requested.id, 'requests:received:canceled', socket.user.username);
        
        done();

        setClientBusy(socket.request.socket)

        socket.user.cancelRequest(requested.id, debugOnlyCallback);

      } // requestsCancel

      function requestsDeny (username, done) {

        // get the requester user 
        let requester = self.data.state.users.byUserName.get(username);

        // if the user doesn't exist, then pass an error to the callback
        if (!requester) return done(ERROR_USER_NOT_FOUND);

        let request = self.data.state.requests.byUserId.get(socket.user.id).get(requester.id);

        if (!request) return done(ERROR_REQUEST_NOT_FOUND);

        self.data.state.requests.remove(request.id);

        log(util.format('%s denied %s\'s friend request', 
              socket.user.username, 
              requester.username));

        log('request', request);
        log('request', self.data.state.requests.get(request.id));

        log(socket.user.username, socket.user);
        log(requester.username, requester);

        notify(socket.user.id, 'requests:received:denied', requester.username);

        notify(requester.id, 'requests:sent:denied', socket.user.username);
        
        done();

        setClientBusy(socket.request.socket)

        socket.user.cancelRequest(requester.id, debugOnlyCallback);
      } // requestsDeny

      function requestsSend (username, done) {

        log('username', username);

        // get the requested user 
        let requested = self.data.state.users.byUserName.get(username);

        log('requested', requested);
        
        log(util.format('%s wants to send %s a friend request', 
              socket.user.username,
              requested.username
              ));
        
        let friendship = socket.user.friends.has(requested.id);
        let pendingRequest = self.data.state.requests.byUserId.get(socket.user.id).get(requested.id);

        // if the user doesn't exist, then pass an error to the callback
        if (!requested) {
          log(ERROR_USER_NOT_FOUND);
          return done(ERROR_USER_NOT_FOUND);
        // if the requested user allows the requester to send a friend request
        } else if (!self.data.state.getPermissions(socket.user.id, requested.id).has('friendRequest')) {
          log(ERROR_NOT_ALLOWED);
          return done(ERROR_NOT_ALLOWED);
        // make sure they aren't friends or have a pending request
        } else if (friendship || pendingRequest) {
          log(ERROR_NOT_ALLOWED);
          return done (ERROR_NOT_ALLOWED);
        }

        let request = self.data.state.requests.add(new self.data.user.Friendship({
          requester: socket.user._id,
          requested: requested._id
        }));

        log('request', request);

        let clientRequest = request.toObject();

        clientRequest.requester = socket.user.username;
        clientRequest.requested = requested.username;
        
        log('clientRequest', clientRequest);

              
        log(socket.user.username, socket.user);
        log(requested.username, requested);

        let socketUserPermissions = Array.from(self.data.state.getPermissions(socket.user.id, requested.id));
        let requestedUserPermissions = Array.from(self.data.state.getPermissions(requested.id, socket.user.id));

        log('socketUserPermissions', socketUserPermissions);
        log('requestedUserPermissions', requestedUserPermissions);

        // notify the requester that the request was sent
        notify(socket.user.id, 'requests:sent', {
          to: requested.username, 
          permissions: socketUserPermissions
        });

        notify(requested.id, 'requests:received', {
          from: socket.user.username, 
          permissions: requestedUserPermissions
        });

        log(socket.user.username + ' sent a friend request to ' + requested.username);
        
        done(null, clientRequest);

        setClientBusy(socket.request.socket)

        socket.user.friendRequest(requested.id, debugOnlyCallback);
        
      } // requestsSend

      function socketDisconnect () {
        
        // remove the socket from the state
        self.data.state.sockets.disconnect(socket.id)

        log('io.sockets', io.sockets)

        log('%s socket.io clients connected', io.sockets.length);

      } // socketDisconnect

      function socketError (err) {
        log('socket error: ', err);
        console.error(err);
      } // socketError

      function usersDelete (done) {
        log('users:delete', socket.user.username);

        let sockets = socket.user.sockets;

        self.data.state.users.remove(socket.user.id);

        setClientBusy(socket.request.socket)


        // remove from db
        socket.user.remove(function (err, results) {
          if (err) return done(err);
          log('results', results);
          log('looks like I got removed!');
          done(null, true);

          // disconnect all sockets
          sockets.forEach(function (socket) {
            socket.emit('account:deleted');
            socket.disconnect();
          });

          setClientIdle(socket.request.socket)
        });
      } // usersDelete

      function usersPermissions (usernames, done) {

        let permissions = {};

        if (!Array.isArray(usernames)) {
          usernames = [usernames];
        }

        usernames.forEach((username) => {
          let userId = self.data.state.users.byUserName.get(username).id;

          permissions[username] = Array.from(self.data.state.getPermissions(socket.user.id, userId));

        });

        done(null, permissions);
      } // usersPermissions


      function usersSearch (findParams, done) {

        log('searching for users');

        log('findParams', findParams);

        findParams = utils.extend({}, findParams);

        findParams.conditions = utils.extend({}, findParams.conditions);
        
        let username  = findParams.conditions.username;
        findParams.conditions.username = new RegExp(username, "i");
        
        findParams.projection = '_id';
        
        log('findParams', findParams);

        setClientBusy(socket.request.socket)

      
        socket.user.search(findParams, function (err, searchResults) {
          if (err) return done(err);

          log('searchResults', searchResults);

          let clientResults = {};

          for (let cat in searchResults) {
            clientResults[cat] = {
              users: [],
              permissions: {}
            };

            log('searchResults[' + cat + '].permissions', searchResults[cat].permissions);
            
            searchResults[cat].users.forEach(function (user, index) {

              log(index, user);

              clientResults[cat].users[index] = user.username; 
              clientResults[cat].permissions[user.username] = searchResults[cat].permissions[index];

              log('clientResults[' + cat + '].permissions["' + user.username + '"]', clientResults[cat].permissions[user.username]);

            });
          }

          log('clientResults', clientResults);

          done(null, clientResults);

          setClientIdle(socket.request.socket)

        });
      } // usersSearch

      function debugOnlyCallback (err, results) {
        if (err) console.error(err);
        else log('results', results.result);

        setClientIdle(socket.request.socket)
      }

    } // socketConnect

  } // startRealtime


  function setClientBusy (socket) {

    clients.set(socket, true)

    log('client %s is busy', socket._handle.fd)
  }

  function setClientIdle (socket) {
    clients.set(socket, false)
    log('client %s is idle', socket._handle.fd)
  }

  function getClientConvo (convoId) {
    let convo = self.data.state.convos.get(convoId);

    log('convo', convo);

    let clientConvo = {
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

    log('clientConvo', clientConvo);

    return clientConvo;
    
  } // getClientConvo

  function getClientUser (userId) {
    let user = self.data.state.users.get(userId);

    log('user', user);
    log('user.friends', user.friends);
    log('user.requests', user.requests);
    log('user.convos', user.convos);

    let clientFriends = new Set();
    let clientConvos = new Map();
    let clientPermissions = new Map();
    let clientRequests = {
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
      clientConvos.set(convo.id, getClientConvo(convo.id));

      convo.members.forEach((member) => {

        // if we don't have the user's permissions for the member
        if (!clientPermissions.has(member.username)) {
          // get the user's permissions for the member
          clientPermissions.set(member.username, Array.from(self.data.state.getPermissions(userId, member.id)));
        }
      });
    });

    let clientUser = {
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

    log('clientUser', clientUser);

    return clientUser;
  }

  /**
   * 
   * get a list of distinct friends of the user's friends
   *
   */
  // function getFriendsOfFriends (username) {

  //   let friendsOfFriends = new Set();

  //   let user = self.data.state.users.byUserName.get(username);

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

    log('userIds', userIds);

    if (!Array.isArray(userIds)) {
      userIds = [ userIds ];
    }

    log('self.data.state.sockets.byUserId.size', self.data.state.sockets.byUserId.size);

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

OffTheRecord_Server.prototype.setStatus = function setStatus (status) {

  switch (status) {
    case 'starting':
    case 'started':
    case 'listening':  
    case 'stopping':
    case 'stopped':   this.status = status
                      log(status)
                      this.emit(status)
                      break
    default: break; // no-op
  }

};
