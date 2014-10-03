
// node core modules
var events = require('events')
    , http = require('http')
    , https = require('https')
    , url = require('url')
    , util = require('util');

// 3rd party modules
var bodyParser = require('body-parser'),
    config = require('config'),
    cookieParser = require('cookie-parser'),
    express = require('express'), 
    expressSession = require('express-session'),
    // favicon = require('serve-favicon'),
    // don't know why they decided to rename it "morgan..." ugh.
    logger = require('morgan'),
    methodOverride = require('method-override'),
    serveStatic = require('serve-static');

var env = require('../env');

module.exports = OffTheRecord_http;

function OffTheRecord_http (data) {

    var debug = require('debug')(env.context('transport:http'));

    var app = express(),
        clients = [];
        self = this;
    
    this.cookieParser = cookieParser;

    this.start = function () {
                
        // instruct the server to start listening
        this.server.listen(config.port, function serverListerning () { 
            // once the server is listening, emit ready
            self.emit('ready');
        });
    };

    this.stop = function () {
        debug('stopping http...');

        self.emit('stopping');

        self.server.close(function httpServerClosed () {
            debug('http stopped!');
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

    ////////////////////////////////////////////////////////////////////////////
    //
    // CONFIGURATION
    //
    ////////////////////////////////////////////////////////////////////////////

    var scfg;

    app.set('port', config.port);
    app.set('views', 'lib/transport/views');
    app.set('view engine', 'jade');
    
    if (config.debug) {
       app.use(logger('dev'));        
    }

    app.use(bodyParser.urlencoded({ extended: true }));
    
    // for PUT requests
    app.use(methodOverride());
    app.use(cookieParser());

    scfg = config.session;
    scfg.store = data.session(expressSession);
    
    app.use(expressSession(scfg));

    // setup passport
    app.use(data.passport.initialize());
    app.use(data.passport.session());

    app.use(function setupAppLocals(request, response, next){
        response.locals = {
            env: env,
            links: {
                home: '/',
                profile: '/profile',
                conversations: '/convos',
                friends: '/friends',
                search: '/search'
            },
            request: request
        };

        next();
    });

////////////////////////////////////////////////////////////////////////////////
//
//  PUBLICALLY ACCESSIBLE
//
////////////////////////////////////////////////////////////////////////////////

    app.get('/', getRoot);

    // GET requests for /logon will respond with the logon form
    app.get('/logon', getLogOn);

    // GET requests for /logoff will kill the users session and redirect to root
    app.get('/logoff', getLogOff);

    app.get('/register', getRegister);

    // POST requests for /logon will attempt to authenticate the given user
    app.post('/logon', data.passport.authenticate(), postLogOn);

    app.post('/register', postRegister); 

    
////////////////////////////////////////////////////////////////////////////////
//
//  AUTHENTICATION REQUIRED
//
////////////////////////////////////////////////////////////////////////////////

    app.get('/home', verifySession, getHome);

    app.get('/profile', verifySession, getProfile);

    app.get('/convos', verifySession, getConvos);

    // GET requests for /convos/:convoID will verifySession, then display convo stats
    app.get('/convos/:convoID', verifySession, getConvo);

    app.get('/friends', verifySession, getFriends);

    app.get('/friends/:friendID', verifySession, getFriend);

    app.get('/search', verifySession, getSearch);

    // serve static content if no routes were found
    app.use(serveStatic('lib/transport/public'));

    // render 404 if a static file is not found
    app.use(function fourOhFour (request, response) {
        response.render('errors/404', {
            request: request
        });
    });  


    function getConvos (request, response) {

        response.render('convos');
    };

    function getConvo (request, response) {

        response.render('convo'); 
        
    };

    function getFriends (request, response) {
        response.render('friends');
    };

    function getFriend (request, response) {
        response.render('friend');
    };

    function getHome (request, response) {
        response.render('home');
    };

    function getLogOn (request, response) {
        response.render('logon');
    };

    function getLogOff (request, response) {

        if (request.user) {
            // console.log("[%s] %s logged out.",
            //     Date(),
            //     request.user.email);
            request.logOut();
        }

        response.redirect('/');
    };

    function getProfile (request, response) {
        response.render('profile');
    };

    function getRegister (request, response) {
        response.render('register', {
            err: false, 
            redir: request.cookies.redir || '/logon'
        });
    };

    function getRoot (request, response) {

        // debug.emit('val' , 'request.session', request.session);
        
        response.render('root');
    };

    function getSearch (request, response) {

        response.render('search');
    };

    function postLogOn (request, response, next) {
        
        response.redirect(request.cookies.redir);
    };

    function postRegister(request, response) {
        // only admin can create accounts
        // if (!request.user.admin) {
        //     response.redirect('/accounts');
        //     return;
        // }

        // create a new Account instance that we will attempt to create
        var newAccount = {
            email : request.body.email
            , firstName : request.body.firstName
            , lastName : request.body.lastName
            , displayName : request.body.displayName
        };

        if (request.body.password !== request.body.verifyPassword) {
            response.render('register', {
                request :   request
                , err: 'Passwords do not match!'
                , redir: request.redir || '/logon'
            });
        } else {
            data.createAccount(newAccount, request.body.password, function (err, account) {
                if (err) { 
                    fiveHundred(err, request, response);
                } else {
                    response.redirect('/home');
                }
            });
        }

    };

    function verifySession (request, response, next) {
    
        if (request.isAuthenticated()) {
            // debug.emit('msg', util.format('%s is authorized', request.user.email));
            return next();

        } else  {
            // console.log('\t--> NOT authenticated.  redirecting to logon...');

            var redir = request.url;
            debug('redir', redir);
            response.cookie('redir', redir);
            
            response.cookie('err', 'You need to logon before you can visit ' + redir );
            
            response.redirect('/logon');
        }
    }

    // create a server instance
    this.server = https.createServer(env.net.ssl.data, app )

    this.server.on('connection', function (client) {
        clients.push(client);

        client.setTimeout(5000);

        client.on('close', function () {
            debug('client closed');
            var index = clients.indexOf(client);
            clients.splice(index, 1);
        });
    });

    this.server.on('closed', function () {
        self.emit('stopped');
    });

};

OffTheRecord_http.prototype = new events.EventEmitter();
