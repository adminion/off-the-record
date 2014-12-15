
var env = require('../env'),
    debug = require('debug')(env.context('data:account')),
    mongoose = require('mongoose'),
    passportLocalMongoose = require('passport-local-mongoose');

var accountName = 'Account'

var FriendsOfFriends = require('friends-of-friends')()

debug('FriendsOfFriends', FriendsOfFriends);

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

// plugin the FriendsOfFriends plugin to incorporate relationships and privacy
AccountSchema.plugin(FriendsOfFriends.plugin, FriendsOfFriends.options);

AccountSchema.statics.search = function (userId, term, options, done) {
    debug('search')

    var self = this,
        model = mongoose.model(accountName, AccountSchema);

    options = options || {};

    options.limit = options.limit || 10;
    options.skip = options.skip || 0;

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

    var conditions = {
        '_id': { '$ne' : userId },
        'privacy.search' : { '$gte' : FriendsOfFriends.privacy.values.FRIENDS }
    };

    if (term.length > 0) {
        var termRegExp = RegExp(term, 'i');

        conditions['$or'] = [
            {'profile.displayName': term}, 
            {'profile.firstName': term}, 
            {'profile.lastName': term}
        ];
    }

    var select = '_id created email privacy profile';

    debug('conditions', conditions);
    debug('options', options);

    // search the users's friends
    this.getFriends(userId, function (err, friends) {

        if (err) {
            done(err);
            return;
        }

        debug('friends', friends);

        results.friends = friends;

        friends.forEach(function (friend) {

            debug('friend', friend);

            // add their _id to the ids array 
            ids.push(friend._id.toString());
        });

        self.getFriendsOfFriends(userId, function (err, friendsOfFriends) {

            if (err) {
                done(err);
                return;
            }

            debug('friendsOfFriends', friendsOfFriends);

            results.friendsOfFriends = friendsOfFriends;

            friendsOfFriends.forEach(function (friendOfFriends) {
                ids.push(friendOfFriends._id);
            });

            // non-friends search
            conditions['privacy.search'] = { '$gte' : FriendsOfFriends.privacy.values.ANYBODY };
            conditions._id['$nin'] = ids;
            debug('conditions', conditions)

            select = '_id created email profile.displayName';         

            model.find(conditions, select, options, function (err, nonFriends) {
                if (err) {
                    throw err
                    done(err);
                } else {
                    debug('nonFriends', nonFriends);

                    results.nonFriends = nonFriends;

                    debug('results', results); 
                    done(null, results);
                }
            });   

        });
    });
};

/**
 *  Model.viewProfile()
 */
AccountSchema.statics.viewProfile = function (account1_Id, account2Email, done) {
    debug('viewProfile')

    debug('account1_Id', account1_Id);

    var self = this,
        model = mongoose.model(accountName, AccountSchema);

    model.findByUsername(account2Email, function (err, account2) {
        debug('account2._id', account2._id);

        if (err) {
            done(err);
        } else if (!account2) {
            done();
        } else {
            self.getRelationship(account1_Id, account2._id, function (err, relationshipValue) {
                debug('relationshipValue', relationshipValue);

                if (err) {
                    done(err);
                } else {

                    var accountInfo = { relationship: relationshipValue };

                    ['profile', 'friendRequests', 'chatRequests'].forEach(function (privProperty) {

                        debug('privProperty', privProperty)

                        // the value of the requested account's privacy property
                        var propertyValue = account2.privacy[privProperty]
                        debug('propertyValue', propertyValue);

                        // for example, they are friends and the property value is friends of friends
                        if (relationshipValue >= propertyValue) {
                            debug('relationshipValue >= propertyValue');
                            if (privProperty === 'profile') {
                                accountInfo._id = account2._id;
                                accountInfo.email = account2.email;
                                accountInfo.profile = account2.profile;
                            } else {
                                accountInfo[privProperty] = true;
                            }
                        } else {
                            debug('relationshipValue < propertyValue');
                            accountInfo[privProperty] = false;
                        }
                    });

                    debug('accountInfo', accountInfo);

                    if (accountInfo.profile === false) {
                        done();
                    } else {
                        done(null, accountInfo);
                    }
                }
            });
        }
    });
};

AccountSchema.methods.search = function (term, options, done) {
    AccountSchema.statics.search(this._id, term, options, done);
};

AccountSchema.methods.viewProfile = function (email, done) {
    AccountSchema.statics.viewProfile(this._id, email, done);
};

module.exports = mongoose.model('Account', AccountSchema);

debug('module.exports', module.exports);
