
var mongoose = require('mongoose');

var accountRef = { type: mongoose.Schema.Types.ObjectId, ref: 'Account' };

// define the ConvoSchema
// username, password, etc are added by passportLocalMongoose plugin
var ConvoSchema = new mongoose.Schema({
    created: { type: Date, default: Date.now, expires: 60*60*24*7 },
    creator: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true},
    invitees: [ accountRef ],
    banned: [ accountRef ]
});

exports.schema = ConvoSchema
exports.model = mongoose.model('Convo', ConvoSchema);
