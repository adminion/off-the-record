
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
            store:          http.session()
        },
        online = [],
        self = this;
        
    this.io = socketio(http.server);
    this.sockets = new Sockets();

    var accounts = this.io.of('accounts')
        .use(passportSocketIo.authorize(authOptions))
        .on('connect', accountsConnect);

    var convos = this.io.of('conversations')
        .use(passportSocketIo.authorize(authOptions))
        .on('connect', convosConnect);

    this.stop = function (done) {
        debug('stopping realtime server...');
        accounts.emit('shutdown');
        convos.emit('shutdown');
        debug('realtime stopped!');
    
        done();
    };

    // when a socket connects to the /accounts namespace
    function accountsConnect (socket) {

        var user = socket.request.user;

        online.push(user._id);

        socket.on('disconnect', function () {
            var index = online.indexOf(socket._id);

            // this should always be the case, but oh well
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

        socket.on('request', function (email, done) {
            user.friendRequest(email, done);
        });

        socket.on('request-accept', function (requesterId, done) {
            user.acceptRequest(requesterId, done);
        });

        socket.on('request-deny', function (requesterId, done) {
            user.denyRequest(requesterId, done);
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

        socket.on('un-friend', function (accountId, done) {
            user.removeFriend(accountId, done);
        });

        socket.on('update-profile', function (updates, done) {
            if ('function' !== typeof done) {
                done = function () {};
            }

            debug('updates to '+user._id+"'s profile", updates);

            var updatesToUser = { profile: updates };

            data.accounts.findByIdAndUpdate(user._id, updatesToUser, done);
        });

        socket.on('update-privacy', function (updates, done) {
            if ('function' !== typeof done) {
                done = function () {};
            }

            debug('updates to '+user._id+"'s privacy:", updates);

            var updatesToUser = { privacy: updates };

            data.accounts.findByIdAndUpdate(user, updatesToUser, done);
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

