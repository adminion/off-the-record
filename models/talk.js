
// export the Talk constructor
module.exports = function (mongoose) {

    // define the TalkSchema
    // username, password, etc are added by passportLocalMongoose plugin
    var TalkSchema = new mongoose.Schema({
        creator: [ { type: mongoose.Schema.types.ObjectID, ref: 'Person' } ],
        members: [ { type: mongoose.Schema.types.ObjectID, ref: 'Person' } ],
        invitees: [ { type: mongoose.Schema.types.ObjectID, ref: 'Person' } ],
        created: { type: Date, default: Date.now }
        visibility:     { 
            // 0 - invitees only
            // 1 - invitees and friends of creator
            // 2 - invitees, friends of creator, and friends of creator's friends
            // 3 - anybody
            type: Number, 
            default: 0, 
            set: function (value) {
                if (!Number.isNaN(value) && value <= 3) {
                    return true;
                } 

                else { 
                    return false;
                }
            }
        }
    });
    
    // and finally return a model created from TalkSchema
    return mongoose.model('Talk', TalkSchema);
};
