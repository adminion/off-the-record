"use strict";

var async = require('async'),
  config = require('../config'),
  env = require('../env'),
  debug = require('debug')(env.package.name + ':models:user'),
  mongoose = require('mongoose'),
  passportLocalMongoose = require('passport-local-mongoose'),
  privacy = require('../privacy'),
  validUrl = require('valid-url'),
  utils = require('techjeffharris-utils');

var ObjectId = mongoose.Schema.Types.ObjectId;

var options = config.mongoose;

var FriendsOfFriends = require('friends-of-friends')(mongoose, { personModelName : options.personModelName });

debug('FriendsOfFriends', FriendsOfFriends);

var userRef =   { type: ObjectId, ref: options.personModelName };

var userGroupSchema = new mongoose.Schema({
  name: { type: String, required: true },
  users: [ userRef ]
});

var UserModel;

// define the UserSchema
// username, password, etc are added by passportLocalMongoose plugin
var UserSchema = new mongoose.Schema({
  created:            { type: Date,       default:    Date.now },
  profile: {
    firstName:      { type: String,     trim: true,   default: '' }, 
    lastName:       { type: String,     trim: true,   default: '' }, 
    location:       { type: String,     trim: true,   index: true,  default: '' },
    website:        { type: String,     trim: true,   default: '',  validate: function (value) {
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

UserSchema.virtual('convos').get(function () {
  return this.__convos;
}).set(function (value) {
  this.__convos = value;
});

UserSchema.virtual('friends').get(function () {
  return this.__friends;
}).set(function (value) {
  this.__friends = value;
});

UserSchema.virtual('requests').get(function () {
  return this.__requests;
}).set(function (value) {
  this.__requests = value;
});

UserSchema.virtual('sockets').get(function () {
  return this.__sockets;
}).set(function (value) {
  this.__sockets = value;
});

UserSchema.set('minimize', false);
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

// debug('UserSchema', UserSchema);

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
      err = new Error('privacyPreference does not exist');
      return done(err);
    }
  });
};

UserSchema.statics.getPermissions = function (requester, requestee, gotPermissions) {

  debug('getPermissions for ' + requester.username + ' to ' + requestee.username);

  debug('requester', requester);
  debug('requestee', requestee);

  var self = this;

  var permissions = [];

  async.parallel({
    relationship: function (done) {
      self.getRelationship(requester._id, requestee._id, done);
    },
    friendship: function (done) {
      self.getFriendship(requester._id, requestee._id, done);
    }
  }, function (err, results) {
    if (err) return gotPermissions(err);

    async.forEachOf(requestee.privacy.toObject(), function (value, property, done) {
      
      // friend requests are a bit different in that privacy settings really 
      // only apply to SENDING friend requests.  If userA is not allowed to 
      // friend request userB and userB sends a request to userA, userA certainly
      // may accept/deny the request.
      // 
      // likewise if they are friends, they can always un-friend the other
      if (property === 'friendRequest') {

        // if they are friends
        if (results.relationship === FriendsOfFriends.relationships.FRIENDS) {
          permissions.push('unfriend');
          return done()

        // if they are pendingFriends
        } else if (results.relationship === FriendsOfFriends.relationships.PENDING_FRIENDS) {
          requester.isRequester(results.friendship._id, function (err, answer) {
            if (err) return done(err);

            if (answer) {
              permissions.push('cancelRequest');
            } else {
              permissions.push('acceptRequest');
              permissions.push('denyRequest');
            }
            return done();
          });
        // if they're not friends
        } else if (results.relationship >= value) {
          permissions.push('friendRequest');
          return done();
        } else {
          return done();
        }
      } else {

        if (results.relationship >= value) {
          permissions.push(property);
        }        

        return done();
      }            

    }, function (err) {

      if (err) return gotPermissions(err);

      debug('permissions', permissions);

      gotPermissions(null, permissions);
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
  findParams.projection = '_id username privacy';

  async.parallel({
    friends: function (done) {  
      findParams.conditions['privacy.search'] = { "$lte" : FriendsOfFriends.relationships.FRIENDS };

      debug('findParams', findParams);

      searcher.getFriends(findParams, function (err, friends) {
        if (err) return done(err);

        debug('friends', friends);

        getPermissionsForUsers(friends, done);
      
      }); 
    }, 
    friendsOfFriends: function (done) {
      findParams.conditions['privacy.search'] = { "$lte" : FriendsOfFriends.relationships.FRIENDS_OF_FRIENDS };

      debug('findParams', findParams);

      searcher.getFriendsOfFriends(findParams, function (err, friendsOfFriends) {
        if (err) return done(err);

        getPermissionsForUsers(friendsOfFriends, done);

      });
    },
    nonFriends: function (done) {
      findParams.conditions['privacy.search'] = { "$lte" : FriendsOfFriends.relationships.NOT_FRIENDS };

      debug('findParams', findParams);

      searcher.getNonFriends(findParams, function (err, nonFriends) {
        if (err) return done(err);

        getPermissionsForUsers(nonFriends, done);
      
      });
    }
  }, function (err, searchResults) {

    debug('err', err);
    debug('search results', searchResults);

    if (err) return searchComplete(err);

    searchComplete(null, searchResults);

  });

  function getPermissionsForUsers (users, done) {

    debug('users', users);
    
    var permissionsByUser = [];

    var results = { users: users, permissions: permissionsByUser};

    if (users && users.length) {
      async.forEachOf(users, function (user, key, finished) {
        // debug('getPermissionsForUser ' + user.username);

        debug('key', key);

        user.permits(searcher, function (err, permissions) {
          if (err) return finished(err);

          permissionsByUser[key] = permissions
          
          debug(user.username + ' consents ' + searcher.username + ' these interactions: ' + permissionsByUser[key]);
          // debug('permissionsByUser['+key+']', permissionsByUser[key]);

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
  }
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

  requestee.permits(requester, function (err, permissions) {

    if (err) return done(err);

    if (!~permissions.indexOf('profile')) {
      return done(new Error('Not allowed to view this user\'s profile'));
    }

    var userInfo = {
      user: {
        profile: requestee.profile,
        username: requestee.username
      },
      permissions: permissions
    };

    debug('userInfo', userInfo);

    done(null, userInfo);
  });
  
};

// ask the requestee if this user may perform the given interaction
UserSchema.methods.may = function (requester, interaction, done) {
  this.constructor.consent(requester, this, interaction, done);
};

// get a list of all interactions that this user permits the requester
UserSchema.methods.permits = function (requester, done) {
  this.constructor.getPermissions(requester, this, done);
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
