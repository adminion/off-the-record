
var mongoose = require('mongoose'),
    friends = require('mongoose-friends'),
    passportLocalMongoose = require('passport-local-mongoose');

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
        displayName:    { type: String,     required:   true,       unique : true   },
        firstName:      { type: String,     required:   true,       trim: true      }, 
        lastName:       { type: String,     required:   true,       trim: true      }, 
    },
});

// @see: https://github.com/numbers1311407/mongoose-friends
AccountSchema.plugin(friends());

// now plugin the passportLocalMongoose functionality
AccountSchema.plugin(passportLocalMongoose, { 
    populateFields: 'friends',
    usernameField: 'email', 
    usernameLowerCase: true
});

exports.schema = AccountSchema;
exports.model = mongoose.model('Account', AccountSchema);
