
var mongoose = require('mongoose');

var FriendshipSchema = new mongoose.Schema({
    requester: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
    requestee: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
    status: { type: String, default: 'Pending'},
    dateSent: { type: Date, default: Date.now },
    dateAccepted: { type: Date, required: false }
});

var Friendship = mongoose.model('Friendship', FriendshipSchema);

exports.schema = FriendshipSchema;
exports.model = Friendship;
exports.plugin = function friendshipPlugin (schema) {

    schema.static({
        sendRequest : function (requesterId, rqueseteeId, done) {
            var conditions = {
                '$or': [
                    {
                        requester: requesterId,
                        requestee: requesteeId
                    },
                    {
                        requester: requesteeId,
                        requestee: requesterId
                    }
                ]
            };

            Friendship.find(conditions, function (err, friendships) {
                if (err) {
                    done(err);
                }

                if (friendships.length === 0) {
                    var request = new Friendship(conditions);

                    request.save(done);
                } else {
                    done(new Error('Error sending friend request: relationship already exists!'))
                }
            });
        },

        getRequests : function (accountId, done) {
            var conditions = { 
                '$or': [
                    { requester: accountId},
                    { requestee: accountId }
                ],
                status: 'Pending'
            };

            Friendship.find(conditions, done);
        },

        getSentRequests : function (accountId, done) {
            var conditions = {
                requester: accountId,
                status: 'Pending'
            };

            Friendship.find(conditions, done);
        },

        getReceivedRequests : function (accountId, done) {

            var conditions = {
                requestee: accountId,
                status: 'Pending'
            }

            Friendship.find(conditions, done);
        },

        acceptRequest : function (requesteeId, requesterId, done) {
            var conditions = {
                requester: requesterId, 
                requestee: requesteeId, 
                status: 'Pending'
            };

            Friendship.findOne(conditions, function (err, request) {
                if (err) {
                    done(err);
                }
                
                request.status = 'Accepted';
                request.dateAccepted = Date.now();

                request.save(done);
            });
        },

        denyRequest : function (requesteeId, requesterId, done) {
            var conditions = {
                requester: requesterId, 
                requestee: requesteeId, 
                status: 'Pending'
            };

            Friendship.findOne(conditions, function (err, request) {
                if (err) {
                    done(err);
                }

                Friendship.remove(conditions, done);
            });
        },

        getFriends : function (accountId, done) {
            var conditions = { 
                '$or': [
                    { requester: accountId },
                    { requestee: accountId }
                ],
                status: 'Accepted'
            };

            Friendship.find(conditions, done);
        }
    });

    schema.method({
        sendRequest : function (requesteeId, done) {

            schema.statics.sendRequest(this_id, requesteeId, done);

        },

        getRequests : function (done) {

            schema.statics.getRequests(this._id, done);
            
        },

        getSentRequests : function (done) {

            schema.statics.getSentRequests(this._id, done);
            
        },

        getReceivedRequests : function (done) {
            schema.statics.getReceivedRequests(this_id, done);
        },

        acceptRequest : function (requesterId, done) {
            schema.statics.acceptRequest(this_id, requesterId, done);
        },

        denyRequest : function (requesterId, done) {

            schema.statics.denyRequest(this._id, requesterId, done);
        },

        getFriends : function (done) {

            schema.statics.getFriends(this._id, done);
        }
    });

};