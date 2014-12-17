
var env = require('../env'),
    debug = require('debug')(env.context('data:account')),
    mongoose = require('mongoose'),
    passportLocalMongoose = require('passport-local-mongoose');

var FriendsOfFriends = require('friends-of-friends')();

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

    var model = mongoose.model(FriendsOfFriends.get('accountName'), AccountSchema);

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

    if (term.length > 0) {
        var termRegExp = /term/i;
    }

    // search the users's friends
    this.getFriends(userId, function (err, friends) {

        if (err) {
            done(err);
            return;
        }

        debug('friends', friends);

        results.friends = (termRegExp) 
            ? friends.filter(searchFilter)
            : friends;

        self.getFriendsOfFriends(userId, function (err, friendsOfFriends) {

            if (err) {
                done(err);
                return;
            }

            debug('friendsOfFriends', friendsOfFriends);

            results.friendsOfFriends = (termRegExp) 
                ? friendsOfFriends.filter(searchFilter)
                : friendsOfFriends;

            // non-friends search
            var conditions = {
                '$or': [
                    {'profile.username' : termRegExp}, 
                    {'profile.firstName' : termRegExp},
                    {'profile.lastName': termRegExp}
                ],
                'privacy.search': { '$lte' : FriendsOfFriends.privacy.values.ANYBODY },
                '_id' : {
                    '$ne' : userId,
                    '$nin' : ids 
                },
            };
        
            debug('conditions', conditions)

            select = '_id created email profile.displayName';         

            model.find(conditions, select, function (err, nonFriends) {
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

    function searchFilter (account) {

        debug('account', account);

        if (termRegExp.test(account.profile.displayName) || 
            termRegExp.test(account.profile.firstName) ||
            termRegExp.test(account.profile.lastName)) {
            
            // add their _id to the ids array 
            ids.push(account._id.toString());

            return account;
        } else {
            return false;
        }
    };
};

/**
 *  Model.viewProfile()
 */
AccountSchema.statics.viewProfile = function (account1_Id, account2Email, done) {
    debug('viewProfile')

    debug('account1_Id', account1_Id);

    var self = this

    this.findByUsername(account2Email, function (err, account2) {
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
    return this.constructor.search(this._id, term, options, done);
};

AccountSchema.methods.viewProfile = function (email, done) {
    
    return this.constructor.viewProfile(this._id, email, done);
};

module.exports = mongoose.model('Account', AccountSchema);

debug('exported Accounts model', module.exports);
