
var mongoose = require('mongoose');

module.exports = function (accountRef) {

    var FriendshipSchema = new mongoose.Schema({
        requester: { type: mongoose.Schema.Types.ObjectId, ref: accountRef, required: true, index: true },
        requestee: { type: mongoose.Schema.Types.ObjectId, ref: accountRef, required: true, index: true },
        status: { type: String, default: 'Pending', index: true},
        dateSent: { type: Date, default: Date.now, index: true },
        dateAccepted: { type: Date, required: false, index: true }
    });

    var Friendship = mongoose.model('Friendship', FriendshipSchema);

    function friendshipPlugin (schema) {

        schema.static({
            NOT_FRIENDS: 0,
            FRIENDS: 1,
            FRIENDS_OF_FRIENDS: 2,
            relationships: ['NOT_FRIENDS', 'FRIENDS', 'FRIENDS_OF_FRIENDS'],
            /**
             *  sendRequest() - sends a friend request to a another user
             *
             */
            sendRequest : function (requesterId, rqueseteeId, done) {
                this.getFriendship(requesterId, requesteeId, function (err, friendship) {
                    if (err) {
                        done(err);
                    } else if (!friendship) {
                        var request = new Friendship(conditions);

                        request.save(done);
                    } else {
                        done(new Error('Error sending friend request: relationship already exists!'))
                    }
                })

            },

            getRequests : function (accountId, done) {

                var self = this;

                var conditions = { 
                    '$or': [
                        { requester: accountId },
                        { requestee: accountId }
                    ],
                    status: 'Pending'
                };

                var select = '_id created email privacy profile';

                Friendship.find(conditions, function (err, requests) {

                    if (err) {
                        done (err);
                    } else if (requests) {
                        self.populate(friendships, [
                            { path: 'requester', select: select },
                            { path: 'requestee', select: select }
                        ], done);
                    } else {
                        done();
                    }

                });
            },

            getSentRequests : function (accountId, done) {
                var self = this;

                var conditions = {
                    requester: accountId,
                    status: 'Pending'
                };

                var select = '_id created email privacy profile';

                Friendship.find(conditions, function (err, sentRequests) {
                    if (err) {
                        done(err)
                    } else if (sentRequests) {
                        self.populate(sentRequests, [
                            { path: 'requester', select: select },
                            { path: 'requestee', select: select }
                        ], done);
                    } else {
                        done();
                    }
                })
            },

            getReceivedRequests : function (accountId, done) {

                var self = this;

                var conditions = {
                    requestee: accountId,
                    status: 'Pending'
                }

                var select = '_id created email privacy profile';

                Friendship.find(conditions, function (err, receivedRequests) {
                    if (err) {
                        done(err);
                    } else if (receivedRequests) {
                        self.populate(receivedRequests, [
                            { path: 'requester', select: select },
                            { path: 'requestee', select: select }
                        ], done);
                    } else {
                        done();
                    }
                });
            },

            acceptRequest : function (requesteeId, requesterId, done) {
                var self = this;

                var conditions = {
                    requester: requesterId, 
                    requestee: requesteeId, 
                    status: 'Pending'
                };

                var select = '_id created email privacy profile';

                var updates = {
                    status: 'Accepted',
                    dateAccepted: Date.now()
                };

                Friendship.findOneAndUpdate(conditions, updates, null, function (err, friendship) {
                    if (err) {
                        done(err);
                    } else if (friendship) {
                        self.populate(friendship, [
                            { path: 'requester', select: select },
                            { path: 'requestee', select: select }
                        ], done);
                    } else {
                        done (new Error('Request does not exist!'));
                    }

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
                    } else if (request) {
                        Friendship.remove(conditions, done);
                    } else {
                        done (new Error('Request does not exist!'));
                    }
                });
            },

            // get all friends
            getFriends : function (accountId, done) {
                var self = this,
                    friends = [];

                // when looking up friends for a given user, we don't care who send the request
                var conditions = { 
                    '$or': [
                        { requester: accountId },
                        { requestee: accountId }
                    ],
                    status: 'Accepted'
                };

                var select = '_id created email privacy profile';

                Friendship.find(conditions, function (err, friendships) {

                    if (err) {
                        done(err);
                    } else if (friendships) { 
                        self.populate(friendships, [
                            { path: 'requester', select: select },
                            { path: 'requestee', select: select }
                        ], function (err, populatedFriendships) {
                            populatedFriendships.forEach(function (populatedFriendship) {
                                if (populatedFriendship.requester._id.toObject() === accountId.toObject()) {
                                    friends.push(populatedFriendship.requestee);
                                } else {
                                    friends.push(populatedFriendship.requester);
                                }
                            });
                            
                            done(err, friends)
                        });
                    } else { 
                        done(err, friends);
                    }
                });
            },

            // get friends of this accounts friends
            getFriendsOfFriends: function (accountId, done) {

                var friendsOfFriends = [];
                var friendResults = 0;

                // get the specified user's friends
                this.getFriends(accountId, function (err, friends) {
                    if (err) {
                        done(err);
                    // if the user has friends
                    } else if (friends.length) {
                        // loop through friends
                        friends.forEach(function (friend) {
                            // get each friend's friends
                            friend.getFriends(function (err, friendsOfFriend) {
                                if (err) {
                                    done(err);
                                } else {
                                    // if the friend has friends
                                    if (friendsOfFriend.length) {
                                        // loop though friends of friend
                                        friendsOfFriends.forEach(function(friendOfFriend) {
                                            // add each friend of friend to the results
                                            friendsOfFriends.push(friendOfFriend);
                                        });
                                    }

                                    // if all getFriends callbacks have been called
                                    if (++friendResults === friends.length) {
                                        done(null, friendsOfFriends);
                                    }
                                } 
                            });
                        });
                    // if the user has no friends
                    } else {
                        done(null, friendsOfFriends);
                    }
                });
            },

            // determine if accountId2 is a friend of accountId1
            isFriend: function (accountId1, accountId2, done) {

                var self = this;

                var answer = false;

                // get friends of accountId1
                this.getFriends(accountId1, function (err, friends) {
                    if (err) {
                        done(err);
                    } else {
                        // if accountId1 has friends
                        if (friends.length) {
                            // loop through those friends
                            friends.forEach(function(friend) {
                                // if accountId2 matches this friends's _id
                                if (accountId2.toObject() === friend._id.toObject()) {
                                    // then yes, accountId2 is a friend of accountId1
                                    answer = true;
                                }
                            });
                        }
                        done(err, answer);
                    }
                });
            },

            // determine if accountId2 is a friend of any of accountId1's friends
            isfriendOfFriend: function (accountId1, accountId2, done) {
                var self = this;

                var answer = false;

                this.getFriendsOfFriends(accountId1, function (err, friendsOfFriends) {
                    if (err) {
                        done(err);
                    } else {
                        // if the user has friendsOfFriends
                        if (friendsOfFriends.length) {
                            // loop through those friendsOfFriends
                            friendsOfFriends.forEach(function (friendOfFriends) {
                                // if accountId2 matches this friendOfFriends' _id
                                if (accountId2.toObject() === friendOfFriends._id.toObject()) {
                                    // then yes, accountId2 is a friend of at least one of accountId1's friends
                                    answer = true;
                                }
                            });
                        }

                        done(err, answer);
                    }
                });
            },

            // get the friendship object itself
            getFriendship: function (accountId1, accountId2, done) {
                var conditions = {
                    '$or': [
                        { requester: accountId1, requestee: accountId2 },
                        { requester: accountId2, requestee: accountId1 }
                    ],
                    status: 'Accepted'
                };

                var select = '_id created email privacy profile';

                Friendship.findOne(conditions, function (err, friendship) {
                    self.populate(friendship, [
                        { path: 'requester', select: select },
                        { path: 'requestee', select: select }
                    ], done);
                });
            },

            // gets relationship of accountId2 to accountId1
            getRelationship: function (accountId1, accountId2, done) {
                var self = this;

                this.isFriend(accountId1, accountId2, function (err, answer) {
                    if (err) {
                        done(err)
                    } else {
                        if (answer) {
                            done(null, self.FRIENDS);
                        } else {
                            self.isfriendOfFriend(accountId1, accountId2, function (err, answer) {
                                if (err) {
                                    done(err);
                                } else {
                                    if (answer) {
                                        done(self.FRIENDS_OF_FRIENDS);
                                    } else {
                                        done(self.NOT_FRIENDS);
                                    }
                                }
                            })
                        }
                    }
                });
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
            },

            friendsWith: function (accountId, done) {

                schema.statics.friendsWith(this._id, accountId, done);
            }
        });

    };

    return {
        schema: FriendshipSchema,
        model: Friendship,
        plugin: friendshipPlugin
    }
};
