
// node core modules
var events = require('events'), 
    util = require('util');

var config = require('config'),
    debug = require('debug'), 
    env = require('../env');
    connectMongo = require('connect-mongo'),
    mongoose = require('mongoose'),
    passport = require('passport');

module.exports = OffTheRecord_data

////////////////////////////////////////////////////////////////////////////////
//
// main module constructor
// 
////////////////////////////////////////////////////////////////////////////////

function OffTheRecord_data () {

    debug = debug(env.context('data'));

    var connection,
        Accounts = require('./account'),
        Convos = require('./convo'),
        self = this;


    this.start = function () {

        // create an instance of the connection
        connection = mongoose.connection;

        // debug('connection', connection);

        connection.on('connecting', function () {
            debug('connecting to mongodb...');
            self.emit('connecting');
        });

        connection.on('connected', function () {
            debug('connected to mongodb!');
            self.emit('connected');
        });

        connection.on('disconnecting', function () {
            debug('disconnecting from mongodb...');
            self.emit('disconnecting');
        });

        connection.on('disconnected', function () {
            debug('disconnected from mongodb!'); 
            self.emit('disconnected');
        });

        connection.on('close', function () {
            debug('connection to mongodb closed!');
            self.emit('closed');
        });

        // if the connection has an error, output the error:
        connection.on('error', function (error) {
            console.error('connection error:', error);
            self.emit('error', error);
            process.exit();
        });

        // once the connection is open
        connection.once('open', init);

        mongoose.connect(config.mongodb.uri, config.mongodb.options);

        return true; 
    };

    this.stop = function (done) {
        done = done || function () {};

        debug('stopping data...');
        self.emit('stopping');

        self.on('stopped', done);

        connection.close(function () {
            debug('data stopped');
            self.emit('stopped');
        });

    };

    this.disconnect = function () {
        return connection.close();
    };

    this.getConnection = function () {
        return connection;
    };

    this.createAccount = function (account, password, done) {
        return Accounts.model.register(account, password, done);
    };

    this.getAccount = function (accountID, done) {
        return Accounts.model.findById(accountID, done);
    };

    this.getAccounts = function (limit, skip, done) {
        return Accounts.model.find(null, null, {limit: limit, skip: skip}, done);
    };

    this.getAccountByEmail = function (email, done) {
        return Accounts.model.findByUsername(email, done);
    };

    this.updateAccount = function (accountID, updates, done) {
        return Accounts.model.findByIdAndUpdate(accountID, updates, null, done);
    };

    this.createConvo = function (convo, done) {
        return Convos.model.create(convo, function onceConvoCreated (err, convo) {
            if (err) { 
                throw err;
                // errorHandler(err, request, response);
            } else {
                // debug('convo', convo);

                convo.populate('creator', done);
            }
        });
    };

    this.getConvos = function (whose, page, done) {

        page = page || 1;

        Convos.model
            // get documents where any one of these conditions is true
            .or([
                { 'creator': whose },
                { 'members': whose }
            ])
            // page 1 doesn't skip, page 2 skips 20, page 3 skips 40, etc.
            .skip( 20*(page -1) )
            // show 20 per page
            .limit(20)
            .populate('creator', 'email firstName lastName displayName')
            .populate('members', 'email firstName lastName displayName')
            .exec(done);
    };

    this.getConvo = function (convoID, done) {
        Convos.model
            .where('_id', convoID)
            .populate('creator', 'email firstName lastName displayName')
            .populate('members', 'email firstName lastName displayName')
            .exec(done);
    };

    this.removeConvo = function (convoID, done) {

        return Convos.model.remove({ '_id' : convoID}, done);
    };

    this.requestFriend = Accounts.model.requestFriend;
    this.getFriends = Accounts.model.getFriends;
    this.removeFriend = Accounts.model.removeFriend;

    this.getPendingFriends = Accounts.model.getPendingFriends;
    this.getAcceptedFriends = Accounts.model.getAcceptedFriends;
    this.getRequestedFriends = Accounts.model.getRequestedFriends;

    this.getFriend = function (whose, friendID, done) {

        Accounts.model.getAcceptedFriends(
            // user
            whose,
            // conditions
            { '_id': friendID },
            // select
            'email firstName lastName displayName',
            // options
            { limit: 1 }, 
            // callback
            done
        );
    }

    this.passport = {
        initialize : function () {
            return passport.initialize();
        },

        session : function () {
            return passport.session();
        },

        authenticate : function () {
            return passport.authenticate('local', { 
                failureRedirect: '/logon', 
                failureFlash: 'Invalid username or password.'        
            });
        }
    };

    this.session = function (expressSession) {

        if (expressSession) {

            MongoStore = connectMongo(expressSession);

            sessionStore = new MongoStore({ mongoose_connection: connection });
        } 

        return sessionStore;
    };

    function init () {

        // createStrategy() returns the built-in strategy
        passport.use(Accounts.model.createStrategy());
        // serializeUser() and deserializeUser() return the functions passport will use
        passport.serializeUser(Accounts.model.serializeUser());
        passport.deserializeUser(Accounts.model.deserializeUser());

        // debug('Accounts', Accounts);
        // debug('Convos', Convos);

        self.emit('ready');
        
        return true;
    };

};

OffTheRecord_data.prototype = new events.EventEmitter();
