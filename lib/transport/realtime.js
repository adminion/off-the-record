
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

    var debug = require('debug')(env.context('transport:realtime'));

    var authOptions = {
            cookieParser:   http.cookieParser, 
            key:            config.session.key,
            secret:         config.session.secret, 
            store:          data.session()
        },
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

        var accountID = socket.request.user._id, 
            displayName = socket.request.user.displayName;

        // debug('this.sockets', this.sockets);

        // get a list of all online accounts that are visible
        socket.on('online', function online () {

        });

        // get a list of all online friends that are visible
        socket.on('online-friends', function onlineFriends () {

        });

        // get info about all friends, a list of friends, or a specific friend
        socket.on('friend-info', function friendsInfo () {

        });

        // get friends requests the user has sent
        socket.on('requests-sent', function requestsSent () {

        });

        // get list of requests pending the user's approval
        socket.on('requests-pending', function requestsPending () {

        });

        // send a friend request
        socket.on('request-send', function requestSend () {

        });

        // accept a friend request
        socket.on('request-accept', function requestAccept () {

        });

        // deny a friend request
        socket.on('request-deny', function requestDeny () {

        });

        // abolish a friendship
        socket.on('un-friend', function removeFriend () {

        });

        // get or set user preferences
        socket.on('preferences', function preferences () {

        });

        // search for accounts
        socket.on('search', function search () {

        });

    };

    // when a socket connects to the /convos namespace
    function convosConnect (socket) {

        var transfers = {};

        // get convos which the user has either started or has been invited
        socket.on('get', function getConvos () {

        });

        // join a conversation
        socket.on('join', function joinConvo () {

        });

        // leave a conversation
        socket.on('leave', function leaveConvo () {

        });

        // send a message to a conversation
        socket.on('send-message', function sendMessage () {

        });

        // send a file to a conversation
        socket.on('transfer-files', function (filesInfo, ready) {

            debug('request to transfer %s files: ', filesInfo.length);

            var transfer = new Transfer(filesInfo);
            
            transfers[transfer.id] = transfer;

            transfer.on('progress', function (fileId) {
                var file = transfer.files[fileId]

                debug(transfer.id + ': ' + transfer.progress + '%, ' + file.name + ': ' + file.progress + '%')

                io.sockets.emit('transfer-progress', transfer.id, transfer.progress, fileId, file.progress);
            });

            transfer.on('complete', function () {
                io.sockets.emit('transfer-complete', transfer.id);

                // transfer.removeAllListeners();

                // delete the transfer data
                delete transfer,
                    transfers[transfer.id];
            });
            
            debug('transfer %s ready', transfer.id);

            socket.broadcast.emit('transfer-files', transfer);
            ready(transfer);

        });

        socket.on('transfer-data', function (transferId, fileId, chunkId, chunk) {

            transfers[transferId].chunk(fileId, chunkId, chunk);

            socket.broadcast.emit('data', transferId, fileId, chunkId, chunk);

        });

        // start a conversation with one or more other users
        socket.on('start', function startConvo () {

        });

        // boot one or more users from a conversation
        socket.on('boot', function bootUsers () {

        });

        // invite one ore more users to an existing conversation
        socket.on('invite', function inviteUsers () {

        });

        // end a conversation
        socket.on('end', function endConversation () {
            
        });

    };

};

