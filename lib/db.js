
// core node modules
var events = require('events'),
    util = require('util');

// 3rd party modules
var mongoose = require('mongoose');

function AdminionServer_db(host, passport) {

    var People,
        Talks,
        self = this;


    this.start = function () {

        // create an instance of the connection
        connection = mongoose.connection;

        // debug.emit('val', 'connection', connection);

        connection.on('connecting', function () {
            // debug.emit('msg', 'connecting to mongodb...');
        });

        connection.on('connected', function () {
            // debug.emit('msg', 'connected to mongodb!');
            self.emit('connected');
        });

        connection.on('disconnecting', function () {
            // debug.emit('msg', 'disconnecting from mongodb...');
        });

        connection.on('disconnected', function () {
           debug.emit('msg', 'disconnected from mongodb!'); 
        });

        connection.on('close', function () {
            self.emit('disconnected');
        });

        // if the connection has an error, output the error:
        connection.on('error', function () {
            console.error.bind(console, 'connection error:');
            process.exit();
        });

        // once the connection is open
        connection.once('open', init);

        mongoose.connect(host);

        return true; 
    };

    this.disconnect = function () {
        return connection.close();
    };

    this.getConnection = function () {
        return connection;
    };

    /**
     * db.create (collection, conditions, limits)
     * 
     *
     *
     */

    this.createPerson = function (person, password, done) {
        return People.register(person, password, done);
    };

    this.getPerson = function (personID, done) {
        return People.findById(personID, done);
    };

    this.getPeople = function (limit, skip, done) {
        return People.find(null, null, {limit: limit, skip: skip}, done);
    };

    this.getPersonByEmail = function (email, done) {
        return People.findByUsername(email, done);
    };

    this.updatePerson = function (personID, updates, done) {
        return People.findByIdAndUpdate(personID, updates, null, done);
    };

    this.createTalk = function (talk, done) {
        return Talks.create(talk, function onceTalkCreated (err, talk) {
            if (err) { 
                throw err;
                // errorHandler(err, request, response);
            } else {
                // debug.emit('val', 'talk', talk);

                talk.populate('playerOne', done);
            }
        });
    };

    this.getTalks = function (conditions, options, done) {
        return Talks.find(conditions, function (err, talks) {

            var opts = { path: 'playerOne', select: 'email firstName lastName displayName personStats'};

            Talks.populate(talks, opts, function (err, talks) {

                if (err) {
                    throw err;
                }

                var opts = { path: 'registeredPlayers.person', select: 'email firstName lastName displayName personStats'};

                Talks.populate(talks, opts, done);

            });
        });
    };

    this.getTalk = function (talkID, done) {
        return Talks.findById(talkID, function (err, talk) {
            var opts = { path: 'playerOne', select: 'email firstName lastName displayName personStats'};

            Talks.populate(talk, opts, function (err, talk) {

                if (err) {
                    throw err;
                }

                var opts = { path: 'registeredPlayers.person', select: 'email firstName lastName displayName personStats'};

                Talks.populate(talk, opts, done);
            });
        });
    };

    this.removeTalk = function (talkID, done) {
        return Talks.remove({ '_id' : talkID}, done);
    };

    function init () {
        // compile Talk and Person models
        People = require('../models/person')(mongoose);
        Talks = require('../models/talk')(mongoose);
        // Player = mongoose.model('Player');

        // createStrategy() returns the built-in strategy
        passport.use(People.createStrategy());
        // serializeUser() and deserializeUser() return the functions passport will use
        passport.serializeUser(People.serializeUser());
        passport.deserializeUser(People.deserializeUser());

        // debug.emit('val', 'People', People);
        // debug.emit('val', 'Talks', Talks);

        self.emit('ready');
        
        return true;
    };

};

util.inherits(AdminionServer_db, events.EventEmitter);

module.exports = AdminionServer_db;

