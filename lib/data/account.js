
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
    privacy: {
        profile: { type: Number, min: 0, max: 3, default: 0 },
        search: { type: Number, min: 0, max: 3, default: 0 },
        chatRequests: { type: Number, min: 0, max: 3, default: 0 },
        friendRequests: { type: Number, min: 0, max: 3, default: 0 },
    },
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

AccountSchema.plugin(friends.plugin);

exports.schema = AccountSchema;
exports.model = mongoose.model('Account', AccountSchema);

debug('exports', exports);
