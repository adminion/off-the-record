
var mongoose = require('mongoose'),
    friends = require('mongoose-friends'),
    passportLocalMongoose = require('passport-local-mongoose');

var accountRef = { type: mongoose.Schema.Types.ObjectId, ref: 'Account' };

// define the AccountSchema
// username, password, etc are added by passportLocalMongoose plugin
var AccountSchema = new mongoose.Schema({
    email:          { type: String,     lowercase:  true,       trim: true      }, 
    displayName:    { type: String,     required:   true,       unique : true   },
    firstName:      { type: String,     required:   true,       trim: true      }, 
    lastName:       { type: String,     required:   true,       trim: true      }, 
    created:        { type: Date,       default:    Date.now                    },
    privacy: {
        view: { type: Number, min: 0, max: 2, default: 0 },
        request: { type: Number, min: 0, max: 2, default: 0 }
    }
});

// now plugin the passportLocalMongoose functionality
AccountSchema.plugin(passportLocalMongoose, { 
    usernameField : 'email' 
    , usernameLowerCase: true
});

// @see: https://github.com/numbers1311407/mongoose-friends
AccountSchema.plugin(friends());

exports.schema = AccountSchema;
exports.model = mongoose.model('Account', AccountSchema);
