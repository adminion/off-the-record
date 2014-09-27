
// node core modules
var events = require('events'), 
    util = require('util');

var debug = require('debug'), 
    OffTheRecord_db = require('./db.js'),
    connectMongo = require('connect-mongo'),
    passport = require('passport');

module.exports = OffTheRecord_data

////////////////////////////////////////////////////////////////////////////////
//
// main module constructor
// 
////////////////////////////////////////////////////////////////////////////////

function OffTheRecord_data () {

    debug = debug(this.env.context('data'));

    var db,
        People,
        Talks,
        MongoStore,
        sessionStore,
        UPDATE_INTERVAL = this.config.cacheUpdateInterval * 1000,
        self = this;

    this.start = function () {

        var updateIntervalID;

        db = new OffTheRecord_db(this.config.mongodb, passport);

        db.on('ready', function DbReady () {

            updateIntervalID = setInterval(function updateInterval () {

                updateCache(function () {
                    debug('People', People);
                    debug('Talks', Talks);

                    // and once its updated, emit 'update'
                    self.emit('update');
                    return true;
                });

                return true;
        
            }, UPDATE_INTERVAL);

            // do it now, since setting up the interval waits the given interval
            updateCache(function onceCacheUpdated () {

                // debug('People', People);
                // debug('Talks', Talks);

                self.emit('ready');
                return true;
            
            });
        });

        db.start();

        return true;
    };

    this.createPerson = function (newPerson, done) {
        db.createPerson(newPerson, function oncePersonCreated (err, person) {
            // add the new person to the server's cache
            self.setPerson(person);
        });
    };


    this.setPerson = function (person) {

        var personID = person['_id'],
            email = person.email;

        People.byID[personID] = person;
        People.byEmail[email] = person;

        //debug('People', People);

        this.emit('update');

        return true;

    };

    this.getPerson = function (personID) {

        // debug('People.byID', People.byID);

        return People.byID[personID] || false;
    };

    this.getPersonByEmail = function (email) {
        return People.byEmail[email] || false;
    }

    this.getPeople = function () {
        var keys = Object.keys(People.byID),
            people = [],
            person,
            i;

        //debug('keys', keys);

        for (i = 0, len = keys.length; i < len; i += 1) {

            // which person?
            person = People.byID[keys[i]];

            if (!!person) {
                // add to the people array the person whose key is at index i
                people.push(person);
            }
        }

        // debug('people', people);
        
        return people;
    };

    this.getConnection = function () {

        return db.connection;
    }

    this.createTalk = function (newTalk, done) {
        db.createTalk(newTalk, function onceTalkCreated (err, talk) {
            self.setTalk(talk);
            done(err, talk)
        });
    };

    this.setTalk = function (talk) { 

        Talks.byID[talk['_id']] = talk;
      
        //debug('Talks', Talks);
    };

    this.getTalk = function (talkID) {

        //debug('Talks.byID[' + talkID + ']', Talks.byID[talkID]);

        return Talks.byID[talkID] || false;
    };

    this.getTalks = function (offset, count) {
        var keys = Object.keys(Talks.byID),
            talks = [],
            talk,
            i;

        offset = offset || 0;
        count = count || 20;

        stop = offset + count;

        if (offset >= keys.length ) {
            return Error('Err: offset out of range!');
        }

        // debug('keys', keys);

        for (i = offset; i < stop; i += 1) {

            // which talk?
            talk = Talks.byID[keys[i]];

            if (!!talk) {
                // add to the talks array the Talk whose key is at index i
                talks.push(talk);
            } else {
                // once we get a dry run, we're done.
                break;
            }
        }

        // debug('talks', talks);
        
        return talks;

    };

    this.session = function (express) {

        if (express) {

            MongoStore = connectMongo(express);

            sessionStore = new MongoStore({ mongoose_connection: db.getConnection() });
        } 

        return sessionStore;
    };

    this.passportInitialize = function () {
        return passport.initialize();
    };

    this.passportSession = function () {
        return passport.session();
    };




    this.removeTalk = function (talkID) {
        delete Talks.byID[talkID];

        this.emit('update');

    };

    this.logon = function () {
        return passport.authenticate('local', { 
            failureRedirect: '/logon', 
            failureFlash: true 
        });
    };

    
    this.empty = function () {
        delete People, Talks;

        this.emit('emptied');

    };


    function updateCache (done) {

        self.emit('updating');

        People = { 
            byID : {},
            byEmail :{}
        };

        Talks = {
            byID : {},
            byPlayerOne : {}
        };

        // fill the cache with all active talks when the server starts
        // load all the talks with status 'lobby' or 'play' into memory
        db.getTalks(null, null,  function onceTalksFound (err, talks) {

            var talk, 
                index;

            if (err) {
                throw err;
            }

            // debug('talks', talks);

            for (index in talks) {
                talk = talks[index];

                self.setTalk(talk);
            }

            // debug('Talks', Talks);

            db.getPeople( null, null, function oncePeopleFound (err, people) {

                var person, 
                    personID, 
                    index;

                if (err) {
                    throw err;
                }

                // debug('people', people);

                for (index in people) {
                    person = people[index];
                    
                    self.setPerson(person);
                }

                // debug('People', People);

                // debug('...cache updated');

                self.emit('updated');

                done();

            });
        });  

        return true;

    };

};
