
// node core modules
var events = require('events'), 
  http = require('http'),
  https = require('https'), 
  url = require('url'), 
  util = require('util');

// 3rd party modules
var bodyParser = require('body-parser'),
  config = require('config'),
  cookieParser = require('cookie-parser'),
  express = require('express'), 
  expressSession = require('express-session'),
  flash = require('connect-flash'),
  methodOverride = require('method-override'),
  passport = require('passport'),
  serveStatic = require('serve-static');

var env = require('../env'),
  ssl = require('./ssl');

module.exports = OffTheRecord_http;

function OffTheRecord_http (data) {

  var debug = require('debug')(env.context('server:transport:http'));

  // create the express app
  var app = express(),
    // create cache of connected client sockets
    clients = [],
    // get the session config
    scfg = config.http.session,
    self = this;

  // add the data store to the session config
  scfg.store = data.getSessionStore();
  
  ////////////////////////////////////////////////////////////////////////////
  //
  // CONFIGURATION / INITIALIZATION
  //
  ////////////////////////////////////////////////////////////////////////////

  app.set('port', config.http.port);
  app.set('views', 'lib/transport/views');
  app.set('view engine', 'jade');
  

  // app middlewarez
  app.use(bodyParser.urlencoded({ extended: true }));
  
  app.use(cookieParser());
  app.use(expressSession(scfg));

  app.use(flash());

  // setup passport
  app.use(passport.initialize());
  app.use(passport.session());

  // setup local variables for use in jade templates
  app.use(function (request, response, next){
    response.locals = {
      env: env,
      links: {
        home: '/',
        profile: '/profile',
        convos: '/convos',
        friends: '/friends',
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
        if (err) { 
          fiveHundred(err, request, response);
        } else {
          response.redirect('/profile');
        }
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

    request.requestedUser.consents(request.user, 'profile', function (err, consent) {
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
  app.use(express.static('lib/transport/public'));

  // render 404 if a static file is not found
  app.use(function (request, response) {

    debug('request.session', request.session);

    response.render('errors/404');
  });

////////////////////////////////////////////////////////////////////////////////   
//
// CREATE SERVER INSTANCE
//
////////////////////////////////////////////////////////////////////////////////

  this.start = function (started) {

    if (started) {
      this.on('started', started);
    }

    debug('starting')
    self.emit('starting')

    // create the ssl-enabled http server instance
    this.server = https.createServer(ssl.data, app )

    /** 
     *  The nature of the server causes clients to stay connected via socket.io.
     * When we close an node-https server, it waits for connections to close before 
     * un-refing the server allowing the process to exit.  We can force a closure 
     * by storing clients in an array as they connect and issuing a .destroy() 
     * command when its time to shutdown the server.
     *
     * @see: OffTheRecord_http.stop() 
     */ 
    this.server.on('connection', function (client) {
      debug('client connection');
      clients.push(client);

      client.on('close', function () {
        debug('client closed');
        var index = clients.indexOf(client);
        clients.splice(index, 1);
      });
    });

    this.server.on('closed', function () {
      self.emit('stopped');
    });

    this.server.once('listening', function serverListerning () { 
      // once the server is listening, emit ready
      debug('started');

      self.emit('started');
    })

    self.server.listen(config.http.port, config.http.host || undefined );
  };

  this.stop = function (stopped) {

    if (stopped) {
      this.on('stopped', stopped);
    }

    debug('stopping');

    self.emit('stopping');

    self.server.close(function httpServerClosed () {
      debug('stopped');
      self.emit('stopped');
    });

    if (clients.length) {
      var msg = clients.length + ' client';

      if (clients.length > 1) {
        msg += 's';
      }

      msg += ' connected, destroying...';

      debug(msg);

      clients.forEach(function (client) {
        client.end();
      });

    }
  };

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

OffTheRecord_http.prototype = new events.EventEmitter();
