
var async = require('async'),
    env = require('../env'),
    debug = require('debug')(env.context('server:data:user')),
    mongoose = require('mongoose'),
    passportLocalMongoose = require('passport-local-mongoose'),
    privacy = require('./privacy'),
    validUrl = require('valid-url');

var options = { accountName : 'User' };

var FriendsOfFriends = require('friends-of-friends')(options);

debug('FriendsOfFriends', FriendsOfFriends);

// define the UserSchema
// username, password, etc are added by passportLocalMongoose plugin
var UserSchema = new mongoose.Schema({
    created:            { type: Date,       default:    Date.now },
    profile: {
        firstName:      { type: String,     trim: true,     index:      true,   required:   true                }, 
        lastName:       { type: String,     trim: true,     index:      true                                    }, 
        location:       { type: String,     trim: true,     index:      true,   default: ''                     },
        website:        { type: String,     trim: true,     default:    '',     validate: function (value) {
            if (value === '')                               return true;
            if (validUrl.isWebUri(value) !== undefined )    return true
            else                                            return false;
        }}
    },
    privacy: {
        profile:        { type: Number,     min: privacy.ANYBODY,   max: privacy.NOBODY,    index: true,    default: privacy.NOBODY },
        friendRequest:  { type: Number,     min: privacy.ANYBODY,   max: privacy.NOBODY,    index: true,    default: privacy.NOBODY },
        chatRequest:    { type: Number,     min: privacy.ANYBODY,   max: privacy.NOBODY,    index: true,    default: privacy.NOBODY }
    }
});

// plugin the passport-local-mongoose functionality
UserSchema.plugin(passportLocalMongoose, { 
    usernameField: 'username',
    usernameLowerCase: true 
});

// plugin the FriendsOfFriends plugin to incorporate friends and relationships 
UserSchema.plugin(FriendsOfFriends.plugin, FriendsOfFriends.options);

UserSchema.statics.privacy = privacy;

/**
 *  Determine if the requested user grants the requester permission to access
 * @param  {ObjectId}   requester           - the the user requesting access
 * @param  {ObjectId}   requested           - the user being requested
 * @param  {String}     privacyPreference   - the key of the requested user's privacy preferences object
 * @param  {Function}   done                - required callback which is passed the answer
 */
UserSchema.statics.allowed = function (requester, requested, privacyPreference, done) {

    debug('allowed')

    debug('requester', requester)
    debug('requested', requested)
    debug('privacyPreference', privacyPreference)

    var model = this.model(FriendsOfFriends.get('accountName'));

    // get their relationship
    model.getRelationship(requester._id, requested._id, function (err, relationship) {

        if (err) return done(err);

        // check to make sure the security preference exists
        if (requested.privacy[privacyPreference] !== undefined) {
            if (relationship >= requested.privacy[privacyPreference]) {
                // their relationship must be equal or greater than the requested user's privacy level
                // of the specified security preference
                done(null, true);
            } else {
                done(null, false);
            }
        } else {
            var err = new Error('privacyPreference does not exist');
            done(err);
        }
    });
};

UserSchema.statics.search = function (user, term, options, searchComplete) {
    debug('search')

    var self = this,
        model = mongoose.model(FriendsOfFriends.get('accountName'));

    options = options || {};

    options.limit = options.limit || 10;
    options.skip = options.skip || 0;

    // get the user's friends, friendsOfFriends, and nonFriends
    async.parallel({
        friends: function (done) {
            user.getFriends(function (err, friends) {
                async.filter(friends, function (friend, filtered) {
                    friend.allows(user, 'profile', function (err, answer) {
                        if (err) return done(err);
                        filtered(answer);
                    });
                }, function (friends) {
                    done(null, friends);
                });
            });
        }, 
        friendsOfFriends: function (done) {
            user.getFriendsOfFriends(function (err, friendsOfFriends) {
                async.filter(friendsOfFriends, function (friendOfFriends, filtered) {
                    friendOfFriends.allows(user, 'profile', function (err, answer) {
                        if (err) return done(err);
                        filtered(answer);
                    });
                }, function (friendsOfFriends) {
                    done(null, friendsOfFriends);
                });
            });
        },
        nonFriends: function (done) {
            user.getNonFriends(function (err, nonFriends) {
                async.filter(nonFriends, function (nonFriend, filtered) {
                    nonFriend.allows(user, 'profile', function (err, answer) {
                        if (err) return done(err);
                        filtered(answer);
                    });
                }, function (friends) {
                    done(null, friends);
                });
            })
        }
    }, function (err, results) {

        debug('err', err);
        debug('results', results);

        if (err) searchComplete(err);

        searchComplete(null, results);

    });
};

/**
 * allows a user to attempt to view another's profile
 * @param  {[type]}   user1 [description]
 * @param  {[type]}   user2 [description]
 * @param  {Function} done  [description]
 * @return {[type]}         [description]
 */
UserSchema.statics.viewProfile = function (requester, requested, done) {
    debug('viewProfile')

    debug('requester', requester);
    debug('requested', requested);

    var self = this.model(FriendsOfFriends.get('accountName'));

    // 
    // i want to get their relationship and see if i'm allowed to view their profile
    // 

    self.getRelationship(requester, requested, function (err, relationship) {
        if (err) return done(err);

        var userInfo = { relationship: relationship };

        debug('requested', requested)
        requested = requested.toObject();
        debug('requested', requested)

        Object.keys(requested.privacy).forEach(function (privProperty) {

            debug('privProperty', privProperty)

            // the value of the requested user's privacy property
            var propertyValue = requested.privacy[privProperty]
            debug('propertyValue', propertyValue);

            // for example, they are friends and the property value is friends of friends
            if (relationship >= propertyValue) {
                debug('relationship >= propertyValue');
                if (privProperty === 'profile') {
                    userInfo._id = requested._id;
                    userInfo.username = requested.username;
                    userInfo.created = requested.created;
                    userInfo.profile = requested.profile;
                } else {
                    userInfo[privProperty] = true;
                }
            } else {
                debug('relationship < propertyValue');
                userInfo[privProperty] = false;
            }
        });

        debug('userInfo', userInfo);

        if (userInfo.profile === false) {
            done();
        } else {
            done(null, userInfo);
        }
    });
};

UserSchema.methods.allows = function (user, securityPreference, done) {
    this.model(FriendsOfFriends.get('accountName')).allowed(user, this, securityPreference, done);
};

UserSchema.methods.search = function (term, options, done) {
    this.model(FriendsOfFriends.get('accountName')).search(this, term, options, done);
};

UserSchema.methods.viewProfile = function (user, done) {
    this.model(FriendsOfFriends.get('accountName')).viewProfile(this, user, done);
};

var model;

try {
    model = mongoose.model(options.accountName, UserSchema);
}

catch (err) {
    model = mongoose.model(options.accountName);
}

module.exports = model;

debug('module.exports', module.exports);
