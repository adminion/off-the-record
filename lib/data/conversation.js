
var mongoose = require('mongoose');

var userRef = { type: mongoose.Schema.Types.ObjectId, ref: 'User' };

// define the ConvoSchema
// username, password, etc are added by passportLocalMongoose plugin
var ConversationSchema = new mongoose.Schema({
    created: { type: Date, default: Date.now, expires: 60*60*24*7 },
    creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true},
    invitees: [ userRef ],
});

ConversationSchema.static({

});

ConversationSchema.method({

});

exports.model = mongoose.model('Conversation', ConversationSchema);
