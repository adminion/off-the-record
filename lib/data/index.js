
// node core modules
var events = require('events'), 
    util = require('util');

var config = require('config'),
    debug = require('debug'), 
    env = require('../env');
    mongoose = require('mongoose'),
    passport = require('passport');

module.exports = OffTheRecord_data

////////////////////////////////////////////////////////////////////////////////
//
// main module constructor
// 
////////////////////////////////////////////////////////////////////////////////

function OffTheRecord_data () {

    debug = debug(env.context('server:data'));

    var connection,
        Accounts = require('./account'),
        Conversations = require('./conversation'),
        self = this;

    this.relationships = Accounts.model.relationships;
    this.privacy = Accounts.model.privacy;

    this.start = function () {

        debug('starting data layer...')
        this.emit('starting');

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

        debug('stopping data layer...');
        self.emit('stopping');

        self.on('stopped', done);

        connection.close(function () {
            debug('data layer stopped');
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

    this.getAccountByEmail = function (email, select, done) {
        return Accounts.model.findOne({email: email}, select, done);
    };

    this.updateAccount = function (accountID, updates, done) {
        return Accounts.model.findByIdAndUpdate(accountID, updates, null, done);
    };

    this.getRelationship = function (accountId1, accountId2, done) {
        return Accounts.model.getRelationship(accountId1, accountId2, done);
    }

    this.createConvo = function (convo, done) {
        return Conversations.model.create(convo, function onceConvoCreated (err, convo) {
            if (err) { 
                throw err;
                // errorHandler(err, request, response);
            } else {
                // debug('convo', convo);

                convo.populate('creator', done);

            }
        });
    };

    this.getConversations = function (whose, page, done) {

        page = page || 1;

        Conversations.model
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
        Conversations.model
            .where('_id', convoID)
            .populate('creator', 'email firstName lastName displayName')
            .populate('members', 'email firstName lastName displayName')
            .exec(done);
    };

    this.removeConvo = function (convoID, done) {

        return Conversations.model.remove({ '_id' : convoID}, done);
    };

    this.search = function (user, term, options, done) {

        options = options || {};

        var limit = options.limit || 10;
        var skip = options.skip || 0;

        var conditions = {
            '$or': [
                {'profile.displayName': new RegExp(term,'i')}, 
                {'profile.firstName': new RegExp(term, 'i')}, 
                {'profile.lastName': new RegExp(term, 'i')}
            ],
            'privacy.search' : { '$gte' : Accounts.model.privacy.values.FRIENDS }
        };

        for (var name in conditions) {
            debug('conditions.'+name, conditions[name]);
        };

        var select = '_id created email privacy profile';
        
        options = { limit: limit, skip: skip }

        debug('conditions', conditions);
        debug('options', options);


        var results = {
                friends: [],
                friendsOfFriends: [],
                nonFriends: []
            },
            // ids array contains a string for each found account's _id this 
            // allows us to prevent duplicates if a friend of friend is also 
            // your friend already shown, for example
            ids = [],
            self=this;


        // search the users's friends
        Accounts.model.getFriends(user._id, function (err, friends) {

            if (err) {
                done(err);
            }

            debug('friends', friends);

            // if friends were found
            if (friends.length > 0) {

                var friendsResults = 0;

                // go through each friend
                friends.forEach(function (friend) {

                    debug('friend', friend);

                    // add their _id to the ids array 
                    ids.push(friend._id.toString());
                    results.friends.push(friend);

                    conditions['privacy.search'] = { '$gte': Accounts.model.privacy.values.FRIENDS_OF_FRIENDS }

                    // search friends of each friend
                    friend.getFriends(conditions, options, function (err, friendsOfFriends) {

                        if (err) {
                            done(err);
                            return;
                        }

                        // if friends of friend were found
                        if (friendsOfFriends.length > 0) {
                            debug('friendsOfFriends', friendsOfFriends);


                            // go thorugh each friend of friend
                            friendsOfFriends.forEach(function (friendOfFriend) {

                                debug('friendOfFriend', friendOfFriend);

                                // if the friend has not yet been selected
                                if (ids.indexOf(friendOfFriend._id.toString()) === -1) {
                                    ids.push(friendOfFriend._id.toString());
                                    results.friendsOfFriends.push(friendOfFriend);
                                }

                            });
                        }

                        if (++friendsResults === friends.length) {
                            nonFriendsSearch();
                        } 
                    });
                });

            } else {
                nonFriendsSearch(); 
            }

        });

        function nonFriendsSearch () {
            
            conditions['privacy.search'] = { '$gte' : Accounts.model.privacy.values.ANYBODY };
            debug('conditions', conditions)

            select = '_id created email profile.displayName';         

            Accounts.model.find(conditions, select, options, function (err, nonFriends) {
                if (err) {
                    throw err
                    // done(err);
                }

                debug('nonFriends',nonFriends);

                if (nonFriends) {
                    nonFriends.forEach(function (nonFriend) {

                        debug('nonFriend',nonFriend);
                        if (ids.indexOf(nonFriend._id.toString()) === -1) {
                            ids.push(nonFriend._id.toString());
                            results.nonFriends.push(nonFriend);
                        }
                    });                    
                }

                debug('results', results); 
                done(null, results);

            });   
        }
        
    };

    function init () {

        // createStrategy() returns the built-in strategy
        passport.use(Accounts.model.createStrategy());
        // serializeUser() and deserializeUser() return the functions passport will use
        passport.serializeUser(Accounts.model.serializeUser());
        passport.deserializeUser(Accounts.model.deserializeUser());

        // debug('Accounts', Accounts);
        // debug('Conversations', Conversations);

        debug('data layer started')
        self.emit('started');
        
        return true;
    };

};

OffTheRecord_data.prototype = new events.EventEmitter();
