
var mongoose = require('mongoose'),
    passportLocalMongoose = require('passport-local-mongoose'),
    friends = require('./friends')('Account');

var env = require('../env'),
    debug = require('debug')(env.context('data:account'));

debug('friends', friends);

var accountRef = { type: mongoose.Schema.Types.ObjectId, ref: 'Account' };

// define the AccountSchema
// username, password, etc are added by passportLocalMongoose plugin
var AccountSchema = new mongoose.Schema({
    created:        { type: Date,       default:    Date.now                    },
    profile: {
        displayName:    { type: String,     required:   true,       unique : true,  index: true     },
        firstName:      { type: String,     required:   true,       trim: true,     index: true     }, 
        lastName:       { type: String,     required:   true,       trim: true,     index: true     }, 
    }
});

// plugin the passportLocalMongoose functionality
AccountSchema.plugin(passportLocalMongoose, { 
    selectFields: '_id created email hash privacy profile salt',
    usernameField: 'email', 
    usernameLowerCase: true
});

// plugin the friends plugin to incorporate relationships and privacy
AccountSchema.plugin(friends.plugin);

//
AccountSchema.static({

    updateAccount: function (accountID, updates, done) {
        return this.findByIdAndUpdate(accountID, updates, null, done);
    },

    search: function (user, term, options, done) {

        var self = this;

        options = options || {};

        var limit = options.limit || 10;
        var skip = options.skip || 0;

        var conditions = {
            '$or': [
                {'profile.displayName': new RegExp(term,'i')}, 
                {'profile.firstName': new RegExp(term, 'i')}, 
                {'profile.lastName': new RegExp(term, 'i')}
            ],
            'privacy.search' : { '$gte' : this.privacy.values.FRIENDS }
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
        this.getFriends(user._id, function (err, friends) {

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

                    conditions['privacy.search'] = { '$gte': self.privacy.values.FRIENDS_OF_FRIENDS }

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
            
            conditions['privacy.search'] = { '$gte' : self.privacy.values.ANYBODY };
            debug('conditions', conditions)

            select = '_id created email profile.displayName';         

            self.find(conditions, select, options, function (err, nonFriends) {
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
    }
});

module.exports = mongoose.model('Account', AccountSchema);

debug('module.exports', module.exports);
