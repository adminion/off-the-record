
var passportLocalMongoose = require('passport-local-mongoose');

// export the Person constructor
module.exports = function (mongoose) {

    // define the PersonSchema
    // username, password, etc are added by passportLocalMongoose plugin
    var PersonSchema = new mongoose.Schema({
        email:          { type: String,     lowercase:  true,       trim: true      }, 
        displayName:    { type: String,     required:   true,       unique : true   },
        firstName:      { type: String,     required:   true,       trim: true      }, 
        lastName:       { type: String,     required:   true,       trim: true      }, 
        created :       { type: Date,       default: new Date() }, 
        friends:        [ { mongoose.Schema.types.ObjectID, ref: 'Person'} ],
        visibility:     { 
            // 0 - friends only
            // 1 - friends of friends
            // 2 - anybody
            type: Number, 
            default: 0, 
            set: function (value) {
                if (!Number.isNaN(value) && value <= 2) {
                    return true;
                } 

                else { 
                    return false;
                }
            }
        }
    });
    
    // now plugin the passportLocalMongoose functionality
    PersonSchema.plugin(passportLocalMongoose, { 
        usernameField : 'email' 
        , usernameLowerCase: true
    });
    
    // and finally return a model created from PersonSchema
    return mongoose.model('Person', PersonSchema);
};
