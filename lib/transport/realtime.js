
// node core modules
var events = require('events'), 
    util = require('util'),
    url = require('url');

// 3rd party modules
var config = require('config'),
    debug = require('debug'),
    passportSocketIo = require('passport.socketio'), 
    socketio = require('socket.io');

var env = require('../env'),
    Sockets = require('./sockets'),
    Transfer = require('./transfer');

module.exports = OffTheRecord_realtime;

////////////////////////////////////////////////////////////////////////////////
//
// main module constructor
// 
////////////////////////////////////////////////////////////////////////////////

function OffTheRecord_realtime (data, http) {

    var debug = require('debug')(env.context('server:transport:realtime'));

    var authOptions = {
            cookieParser:   http.cookieParser, 
            key:            config.session.key,
            secret:         config.session.secret, 
            store:          data.getSessionStore(),
            fail:           function (data, message, error, next) {
                debug('socket.io auth err:', message);
                next(null, false);
            }
        },
        online = [],
        self = this;
        
    this.io = socketio(http.server);
    this.sockets = new Sockets();

    var users = this.io.of('/users')
        .use(passportSocketIo.authorize(authOptions))
        .on('connect', usersConnect);

    var convos = this.io.of('/conversations')
        .use(passportSocketIo.authorize(authOptions))
        .on('connect', convosConnect);

    http.on('started', function () {
        debug('realtime module started');
    });

    http.on('stopping', function () {
        debug('stopping realtime server...');

        users.emit('shutdown');
        convos.emit('shutdown');
        debug('realtime stopped!');
    
    });

    // when a socket connects to the /users namespace
    function usersConnect (socket) {

        debug('socket connect');

        var user = socket.request.user;

        debug('socket.request.user', user);

        online.push(user._id);

        socket.on('disconnect', function () {

            debug('socket connect');

            var index = online.indexOf(socket._id);

            // this should always be the case, but may not sometimes
            if (index > -1) {
                online.splice(index, 1);
            }
        });

        socket.on('online', function () {
            socket.emit('online', online);
        });

        socket.on('online-friends', function () {

            var onlineFriends = []

            user.getFriends(function (err, friends) {

                if (err) {
                    console.log('error getting online friends: ', err);
                }

                friends.map(function (friend) {
                    if (online.indexOf(friend) > -1) {
                        onlineFriends.push(friend);
                    }
                });

                socket.emit('online-friends', onlineFriends);
            });
        });

        socket.on('request', function (username, done) {

            data.users.findByUsername(username, function  (err, requestedUser) {
                if (err || !requestedUser) {
                    done(err);
                } else {
                    user.friendRequest(requestedUser._id, done);
                }
            });
        });

        socket.on('request-accept', function (username, done) {
            data.users.findByUsername(username, function  (err, requestedUser) {
                if (err || !requestedUser) {
                    done(err);
                } else {
                    user.acceptRequest(requestedUser._id, done);
                }
            });
        });

        socket.on('request-deny', function (username, done) {
            data.users.findByUsername(username, function  (err, requestedUser) {
                if (err || !requestedUser) {
                    done(err);
                } else {
                    user.denyRequest(requestedUser._id, done);
                }
            });
        });

        socket.on('get-friends', function (done) {
            user.getFriends(done);
        });

        socket.on('get-requests', function (done) {
            user.getRequests(done);
        });

        socket.on('requests-sent', function (done) {
            user.getSentRequests(done);
        });

        socket.on('requests-pending', function (done) {
            user.getReceivedRequests(done);
        });

        socket.on('un-friend', function (username, done) {
            data.users.findByUsername(username, function  (err, requestedUser) {
                if (err || !requestedUser) {
                    done(err);
                } else {
                    user.removeFriend(requestedUser._id, done);
                }
            });
        });

        socket.on('update-profile', function (updates, done) {
            if ('function' !== typeof done) {
                done = function () {};
            }

            debug('updates to '+user._id+"'s profile", updates);

            var updatesToUser = { profile: updates };

            data.users.findByIdAndUpdate(user._id, updatesToUser, done);
        });

        socket.on('update-privacy', function (updates, done) {
            if ('function' !== typeof done) {
                done = function () {};
            }

            debug('updates to '+user._id+"'s privacy:", updates);

            var updatesToUser = { privacy: updates };

            data.users.findByIdAndUpdate(user, updatesToUser, done);
        });

        socket.on('search', function (term, options, done) {

            debug('term', term);
        
            user.search(term, options, done);
        });

    };

    // when a socket connects to the /convos namespace
    function convosConnect (socket) {

        var user = socket.request.user;

        var transfers = {};

        // get convos which the user has either started or has been invited
        socket.on('get', function () {

        });

        // join a conversation
        socket.on('join', function (convoId, joined) {

        });

        // leave a conversation
        socket.on('leave', function (convoId, left) {

        });

        // send a message to a conversation
        socket.on('send-message', function (convoId, message) {

        });

        // send a file to a conversation
        socket.on('send-files', function (convoId, filesInfo, ready) {

            debug('request to transfer %s files: ', filesInfo.length);

            var transfer = new Transfer(filesInfo);
            
            transfers[transfer.id] = transfer;

            transfer.on('progress', function (fileId) {
                var file = transfer.files[fileId]

                debug(transfer.id + ': ' + transfer.progress + '%, ' + file.name + ': ' + file.progress + '%')

                io.sockets.in(convoId).emit('transfer-progress', transfer.id, transfer.progress, fileId, file.progress);
            });

            transfer.on('complete', function () {
                io.sockets.in(convoId).emit('transfer-complete', transfer.id);

                // transfer.removeAllListeners();

                // delete the transfer data
                delete transfer,
                    transfers[transfer.id];
            });
            
            debug('transfer %s ready', transfer.id);

            socket.broadcast.to(convoId).emit('send-files', transfer);
            ready(transfer);

        });

        socket.on('transfer-data', function (convoId, transferId, fileId, chunkId, chunk) {

            try {
                transfers[transferId].chunk(fileId, chunkId, chunk);
            }

            catch (err) {
                socket.emit('transfer-error', err);
            }

            socket.broadcast.to(convoId).emit('data', transferId, fileId, chunkId, chunk);

        });

        // start a conversation with one or more other users
        socket.on('start', function (invitees) {

            debug(user.displayName + ' has requested to start a conversation.');

            debug('invitees', invitees);

            data.convos.create({
                creator: user._id,
                invitees: invitees,
            }, function (err, convo) {
                if (err) {
                    debug('err', err);
                }

                socket.emit('started', convo);
            })

        });

        // boot one or more users from a conversation
        socket.on('boot', function (convoId, users) {

        });

        // invite one ore more users to an existing conversation
        socket.on('invite', function (convoId, invitees) {

        });

        // end a conversation
        socket.on('end', function (convoId) {
            
        });

    };

};

