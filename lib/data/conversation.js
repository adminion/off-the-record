
var mongoose = require('mongoose');

var accountRef = { type: mongoose.Schema.Types.ObjectId, ref: 'Account' };

// define the ConvoSchema
// username, password, etc are added by passportLocalMongoose plugin
var ConversationSchema = new mongoose.Schema({
    created: { type: Date, default: Date.now, expires: 60*60*24*7 },
    creator: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true},
    invitees: [ accountRef ],
    banned: [ accountRef ]
});

ConversationSchema.static({

});

ConversationSchema.method({

});

exports.model = mongoose.model('Conversation', ConversationSchema);
