
var async = require('async'),
  config = require('../config'),
  conversationSchema = require('./conversation')(),
  env = require('../env'),
  debug = require('debug')(env.context('server:data:user')),
  mongoose = require('mongoose'),
  passportLocalMongoose = require('passport-local-mongoose'),
  privacy = require('./privacy'),
  validUrl = require('valid-url'),
  utils = require('techjeffharris-utils');

var ObjectId = mongoose.Schema.Types.ObjectId;

var options = { personModelName : config.mongoose.personModelName };
var conversationModelName = 'Conversation';

var FriendsOfFriends = require('friends-of-friends')(mongoose, options);

debug('FriendsOfFriends', FriendsOfFriends);

var userGroupSchema = new mongoose.Schema({
  name: { type: String, required: true },
  user: { type: ObjectId, ref: options.personModelName },
  users: [ { type: ObjectId, ref: options.personModelName } ]
});

var UserModel;

// define the UserSchema
// username, password, etc are added by passportLocalMongoose plugin
var UserSchema = new mongoose.Schema({
  created:            { type: Date,       default:    Date.now },
  profile: {
    firstName:      { type: String,     trim: true }, 
    lastName:       { type: String,     trim: true }, 
    location:       { type: String,     trim: true,     index:      true,   default: ''                     },
    website:        { type: String,     trim: true,     default:    '',     validate: function (value) {
      if (value === '')                               return true;
      if (validUrl.isWebUri(value) !== undefined )    return true
      else                                            return false;
    }}
  },
  privacy: {
    profile:            { type: Number,     min: privacy.ANYBODY,   max: privacy.NOBODY,    index: true,    default: privacy.NOBODY },
    search:             { type: Number,     min: privacy.ANYBODY,   max: privacy.NOBODY,    index: true,    default: privacy.NOBODY },
    friendRequest:      { type: Number,     min: privacy.ANYBODY,   max: privacy.NOBODY,    index: true,    default: privacy.NOBODY },
    startConversation:  { type: Number,     min: privacy.ANYBODY,   max: privacy.NOBODY,    index: true,    default: privacy.NOBODY }
  },
  userGroups: [ userGroupSchema ]
});

UserSchema.set('toJSON', { getters: true, minimize: false });
UserSchema.set('toObject', { getters: true, minimize: false });

// plugin the passport-local-mongoose functionality
UserSchema.plugin(passportLocalMongoose, { 
  usernameField: 'username',
  usernameLowerCase: true 
});

// plugin the FriendsOfFriends plugin to incorporate friends and relationships 
UserSchema.plugin(FriendsOfFriends.plugin, FriendsOfFriends.options);

UserSchema.statics.privacy = privacy;

UserSchema.virtual('convos')
  .get(function () {
    if (!this.__convos) {
      this.__convos = [];
    }

    return this.__convos;
  })
  .set(function(v) {
      this.__convos = v;
  });

debug('UserSchema', UserSchema);

UserSchema.virtual('friends')
  .get(function () {
    if (!this.__friends) {
      this.__friends = [];
    }

    return this.__friends;
  })
  .set(function(v) {
      this.__friends = v;
  });


/**
 *  Determine if the requestee consents to the requester's interaction
 * @param  {ObjectId}   requester           - the the user requesting access
 * @param  {ObjectId}   requestee           - the user being requested
 * @param  {String}     privacyPreference   - the key of the requested user's privacy preferences object
 * @param  {Function}   done                - required callback which is passed the answer
 */
UserSchema.statics.consent = function (requester, requestee, privacyPreference, done) {

  debug('consent: ' + privacyPreference);

  debug('requester', requester)
  debug('requestee', requestee)
  debug('privacyPreference', privacyPreference)

  // get their relationship
  UserModel.getRelationship(requester._id, requestee._id, function (err, relationship) {

    if (err) return done(err);

    // check to make sure the security preference exists
    if (requestee.privacy[privacyPreference] !== undefined) {
      if (relationship >= requestee.privacy[privacyPreference]) {
        // their relationship must be equal or greater than the requested user's privacy level
        // of the specified security preference
        return done(null, true, relationship);
      } else {
        return done(null, false, relationship);
      }
    } else {
      var err = new Error('privacyPreference does not exist');
      return done(err);
    }
  });
};

UserSchema.statics.getConsentedInteractions = function (requester, requestee, gotConsentedInteractions) {

  debug('getConsentedInteractions for ' + requester.username + ' to ' + requestee.username);

  debug('requester', requester);
  debug('requestee', requestee);

  var self = this;

  var consentedInteractions = [];

  async.parallel({
    relationship: function (done) {
      self.getRelationship(requester._id, requestee._id, done);
    },
    friendship: function (done) {
      self.getFriendship(requester._id, requestee._id, done);
    }
  }, function (err, results) {
    if (err) return gotConsentedInteractions(err);

    async.forEachOf(requestee.privacy.toObject(), function (value, property, done) {

      debug('property', property)

      debug('value', value);
      
      // friend requests are a bit different in that privacy settings really 
      // only apply to SENDING friend requests.  If userA is not allowed to 
      // friend request userB and userB sends a request to userA, userA certainly
      // may accept/deny the request.
      // 
      // likewise if they are friends, they can always un-friend the other
      if (property === 'friendRequest') {

        // if they are friends
        if (results.relationship === FriendsOfFriends.relationships.FRIENDS) {
          consentedInteractions.push('unfriend');
          return done()

        // if they are pendingFriends
        } else if (results.relationship === FriendsOfFriends.relationships.PENDING_FRIENDS) {
          requester.isRequester(results.friendship._id, function (err, answer) {
            if (err) return done(err);

            if (answer) {
              consentedInteractions.push('cancelRequest');
            } else {
              consentedInteractions.push('acceptRequest');
              consentedInteractions.push('denyRequest');
            }
            return done();
          });
        // if they're not friends
        } else if (results.relationship >= value) {
          consentedInteractions.push('friendRequest');
          return done();
        } else {
          return done();
        }
      } else {

        if (results.relationship >= value) {
          debug('results.relationship >= value');
          consentedInteractions.push(property);
        }        

        return done();
      }            

    }, function (err) {

      debug('consentedInteractions', consentedInteractions);

      gotConsentedInteractions(null, consentedInteractions);
    });

  });
};

UserSchema.statics.search = function (searcher, findParams, searchComplete) {
  debug('search')

  debug('searcher', searcher);
  debug('findParams', findParams);
  debug('searchComplete', searchComplete);

  findParams = utils.extend({}, findParams);
  findParams.options = utils.extend({}, findParams.options);

  findParams.options.limit = findParams.options.limit || 10;
  findParams.options.skip = findParams.options.skip || 0;


  async.parallel({
    friends: function (done) {  
      findParams.conditions['privacy.search'] = { "$lte" : FriendsOfFriends.relationships.FRIENDS };

      debug('findParams', findParams);

      searcher.getFriends(findParams, function (err, friends) {
        if (err) return done(err);

        debug('friends', friends);

        getConsentedInteractionsForUsers(friends, done);
      
      }); 
    }, 
    // pendingFriends: function (done) {
    //   async.waterfall([
    //     function searchForPendingFriends (next) {
    //       searcher.getPendingFriends(findParams, next);
    //     },
    //     filterSearchableUsers,
    //     getConsentedInteractionsForUsers
    //   ], function (err, users, consentedInteractions) {
    //     if (err) return done(err);
    //     debug('users', users);
    //     debug('consentedInteractions', consentedInteractions);
    //     done(null, {users: users, consentedInteractions: consentedInteractions});
    //   });
    // },
    friendsOfFriends: function (done) {
      findParams.conditions['privacy.search'] = { "$lte" : FriendsOfFriends.relationships.FRIENDS_OF_FRIENDS };

      debug('findParams', findParams);

      searcher.getFriendsOfFriends(findParams, function (err, friendsOfFriends) {
        if (err) return done(err);

        getConsentedInteractionsForUsers(friendsOfFriends, done);

      });
    },
    nonFriends: function (done) {
      findParams.conditions['privacy.search'] = { "$lte" : FriendsOfFriends.relationships.NOT_FRIENDS };

      debug('findParams', findParams);

      searcher.getNonFriends(findParams, function (err, nonFriends) {
        if (err) return done(err);

        getConsentedInteractionsForUsers(nonFriends, done);
      
      });
    }
  }, function (err, searchResults) {

    debug('err', err);
    debug('search results', searchResults);

    if (err) return searchComplete(err);

    searchComplete(null, searchResults);

  });

  function getConsentedInteractionsForUsers (users, done) {

    debug('users', users);
    debug('done', done);

    var consentedInteractionsByUser = [];

    var results = { users: users, consentedInteractions: consentedInteractionsByUser};

    if (users && users.length) {
      async.forEachOf(users, function (user, key, finished) {
        // debug('getConsentedInteractionsForUser ' + user.username);

        debug('key', key);

        user.getConsentedInteractions(searcher, function (err, consentedInteractions) {
          if (err) return finished(err);

          consentedInteractionsByUser[key] = consentedInteractions
          
          debug(user.username + ' consents ' + searcher.username + ' these interactions: ' + consentedInteractionsByUser[key]);
          // debug('consentedInteractionsByUser['+key+']', consentedInteractionsByUser[key]);

          finished();
        });
      }, function (err) {
        if (err) return done(err);

        debug('got consented interactions for each user')

        return done(null, results);
      });
    } else {
      done(null, results);
    }
  };
};

/**
 * allows a user to attempt to view another's profile
 * @param  {[type]}   user1 [description]
 * @param  {[type]}   user2 [description]
 * @param  {Function} done  [description]
 * @return {[type]}         [description]
 */
UserSchema.statics.viewProfile = function (requester, requestee, done) {
  debug('viewProfile')

  debug('requester', requester);
  debug('requestee', requestee);

  requestee.getConsentedInteractions(requester, function (err, consentedInteractions) {

    if (err) return done(err);

    if (consentedInteractions.indexOf('profile') < 0) {
      return done(new Error('Not allowed to view this user\'s profile'));
    }

    var userInfo = {
      user: {
        _id: requestee._id,
        created: requestee.created,
        profile: requestee.profile,
        username: requestee.username
      },
      consentedInteractions: consentedInteractions
    };

    debug('userInfo', userInfo);

    done(null, userInfo);
  });
  
};

UserSchema.methods.consents = function (user, securityPreference, done) {
  this.constructor.consent(user, this, securityPreference, done);
};

UserSchema.methods.getConsentedInteractions = function (user, done) {
  this.constructor.getConsentedInteractions(user, this, done);
};

UserSchema.methods.search = function (findParams, done) {

  debug('findParams', findParams);
  debug('done', done);

  this.constructor.search(this, findParams, done);
};

UserSchema.methods.viewProfile = function (user, done) {
  this.constructor.viewProfile(this, user, done);
};

module.exports = function getUserModel() {

  if (!UserModel) {
    UserModel = mongoose.model(options.personModelName, UserSchema);
  }

  return UserModel;
}
