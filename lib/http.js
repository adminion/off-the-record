
// node core modules
var events = require('events')
    , http = require('http')
    , https = require('https')
    , url = require('url')
    , util = require('util');

// 3rd party modules
var debug = require('debug'),
    express = require('express'), 
    flash = require('connect-flash');

module.exports = OffTheRecord_http;

function OffTheRecord_http () {

    debug = debug(this.env.context('http'));

    var app = express(),
        self = this;
    
    this.cookieParser = express.cookieParser;

    this.start = function () {
        // create a server instance depending on the boolean conversion of this.config.http
        this.server = !!this.config.https
            // if https i enabled, create https server
            ? https.createServer(this.env.net.ssl.data, app )
            // otherwise, create http server
            : this.createServer(app);

        this.server.on('closed', function () {
            self.emit('stopped');
        });
                
        // instruct the server to start listening
        this.server.listen(this.config.port, function serverListerning () { 
            // once the server is listening, emit ready
            self.emit('ready');
        });
    };

    this.stop = function () {
        this.server.close(function () {
            self.emit('stopped');
        });
    };

    ////////////////////////////////////////////////////////////////////////////
    //
    // CONFIGURATION
    //
    ////////////////////////////////////////////////////////////////////////////

    //when NODE_ENV is undefined
    app.configure(configureApp);

    ////////////////////////////////////////////////////////////////////////////
    //
    // PARAMETER HANDLERS
    //
    ////////////////////////////////////////////////////////////////////////////

    app.param('email', paramEmail);

    app.param('talkID', paramTalkID);

    ////////////////////////////////////////////////////////////////////////////
    //
    // TEMPLATE VARS
    //
    ////////////////////////////////////////////////////////////////////////////

    // make the properties adminion object available as variables in all views
    app.locals = {
        env: this.env,
        links : {
            Talks : "/talks",
            People : "/people"
        }    
    };

    app.get('/', getRoot);

    app.get('/logon', getLogon);

    app.get('/talks', verifyession, getTalks);

    app.get('/talks/:talkID', verifySession, getTalks);

    app.get('/people', verifySession, getPeople);

    app.get('/people/:personID', verifySession, getPerson);

    app.get('/people/:personID/talks', verifySession, getPersonTalks);

    function configureApp() {
        var scfg;

        app.set('port', self.config.port);
        app.set('views', 'lib/views');
        app.set('view engine', 'jade');
        app.use(express.favicon());
        
        if (self.config.debug) {
           app.use(express.logger('dev'));        
        }

        app.use(express.urlencoded());
        app.use(express.json());
        
        app.use(express.cookieParser());

        scfg = self.config.session;
        scfg.store = self.data.session(express);
        
        debug('scfg', scfg);

        app.use(express.session(scfg));

        // allows us to use connect-flash messages
        app.use(flash());

        // setup passport
        app.use(self.data.passportInitialize());
        app.use(self.data.passportSession());

        // have express try our routes before looking for static content
        app.use(app.router);

        // serve static content if no routes were found
        app.use(express.static('public'));

        // render 404 if a static file is not found
        app.use(fourOhFour);

    };

    function errorHandler (err, request, response) {
        console.trace(err);
        // debug('err', err);
        response.render('errors/500', {
            err: err,
            request: request
        });
    };

    function fourOhFour (request, response) {
        response.render('errors/404', {
            request: request
        });
    }

    function verifySession (request, response, next) {
        
        if (request.isAuthenticated()) {
            // debug(util.format('%s is authorized', request.user.email));
            return next();
        } else {
            // console.log('\t--> NOT authenticated.  redirecting to logon...');
            request.cookies.redir = request.url;
            request.cookies.err = 'You need to logon before you can visit ' + request.url;
            response.redirect('/logon');
        }
    };

    function getRoot (request, response) {

        // debug.emit('val' , 'request.session', request.session);
        
        response.render('root', {
            request :   request
        });
    };


    function getLogon (request, response) {
        response.render('logon', {
            err: request.flash('error') || request.cookies.err
            , redir: url.parse(request.url,true).query.redir || '/'
            , request :     request
        });
    };


    function getPeople (request, response) {
        var people = self.data.getPeople();

        response.render('people', {
            people : people,
            request : request
        });
    };

    function getPerson (request, response) {
        // debug.emit('val' , 'request.person', request.person);
        
        response.render('people/person', { request : request });
        
    };

    function getTalks (request, response) {

        talks = self.data.getTalks(request.query.offset, request.query.count);

        // debug('talks', talks);

        response.render('talks' , {
            talks: talks
            , request : request
        });

    };

    function getTalk (request, response) {
        
        response.render('talks/talk', {
            request: request
        });
        
    };

    function paramEmail (request, response, next, email) {
        
        request.person = self.data.getPersonByEmail(email);

        // debug('request.person', request.person);

        next();
    };

    function paramTalkID (request, response, next, talkID) {
    
        request.talk = self.data.getTalk(talkID);
        // debug('request.talk', request.talk);

        if (request.talk) {
            next();

        } else {      
            response.render('errors/talks/404', {
                request: request
            });

            return false;
        }

    };

}
