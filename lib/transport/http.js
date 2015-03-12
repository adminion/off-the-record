
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

    var app = express(),
        clients = [],
        scfg = config.session,
        self = this;

    scfg.store = data.getSessionStore();
    
    this.cookieParser = cookieParser;

    ////////////////////////////////////////////////////////////////////////////
    //
    // CONFIGURATION / INITIALIZATION
    //
    ////////////////////////////////////////////////////////////////////////////

    app.set('port', config.port);
    app.set('views', 'lib/transport/views');
    app.set('view engine', 'jade');
    
    app.use(bodyParser.urlencoded({ extended: true }));
    
    // for PUT requests
    app.use(methodOverride());
    
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
                conversations: '/conversations',
                friends: '/friends',
                search: '/search'
            },
            privacy: data.users.privacy,
            relationships: data.users.relationships,
            request: request
        };

        next();
    });

    app.param('username', function (request, response, next, username) {
        data.users.findOne({username: username}, 'username profile created privacy', function (err, user) {
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
            data.users.register(newUser, request.body.password, function onceRegistered (err, user) {
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

        request.user.viewProfile(request.requestedUser, function (err, userInfo) {
            if (err) {
                fiveHundred(err, request, response);
            } else if (userInfo.profile) {
                debug('userInfo', userInfo);
                response.render('user', { userInfo: userInfo });
            } else {
                response.render('errors/404');
            }
        });
    });

    app.get('/search', verifySession, function (request, response) {
        response.render('search');
    });

    app.get('/conversations', verifySession, function (request, response) {
        response.render('conversations');
    });

    app.get('/startConversation', verifySession, function (request, response) {
        response.render('startConversation');
    });

    // GET requests for /conversations/:conversationID will verifySession, then display conversation stats
    app.get('/conversations/:conversationID', verifySession, function (request, response) {
        response.render('conversation'); 
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
    app.use(serveStatic('lib/transport/public'));

    // render 404 if a static file is not found
    app.use(function (request, response) {
        response.render('errors/404');
    });

////////////////////////////////////////////////////////////////////////////////   
//
// CREATE SERVER INSTANCE
//
////////////////////////////////////////////////////////////////////////////////

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

    this.start = function (started) {

        if (started) {
            this.on('started', started);
        }

        debug('starting http module')
        self.emit('starting')

        self.server.listen(config.port, function serverListerning () { 
            // once the server is listening, emit ready
            debug('http module started');

            self.emit('started');
        });
    };

    this.stop = function (stopped) {

        if (stopped) {
            this.on('stopped', stopped);
        }

        debug('stopping http module...');

        self.emit('stopping');

        self.server.close(function httpServerClosed () {
            debug('http module stopped');
            self.emit('stopped');
        });

        if (clients.length) {
            var msg = clients.length + ' client';

            if (clients.length > 1) {
                msg += 's';
            }

            msg += ' connected, destroying';

            debug(msg);

            clients.forEach(function (client) {
                client.destroy();
            });

        }

        shutdownTimer = setTimeout(function shutdownTimeout() {
            debug('shutdown timeout!');
            self.emit('stopped');
            process.exit(); 
        }, config.shutdownTimeout);
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
