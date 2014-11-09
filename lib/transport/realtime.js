
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

        function socketDisconnect () {
            var index = online.indexOf(socket._id);

            // this should always be the case, but oh well
            if (index > -1) {
                online.splice(index, 1);
            }
        };

        // get a list of all online accounts that are visible
        function onlineAccounts () {
            socket.emit('online', online);
        };

        // get a list of all online friends that are visible
        function onlineFriends () {

            var conditions = { '_id' : { '$in': online } },
                select = null, // select null - select all fields
                options = { sort: { name: 1 } };

            data.getAcceptedFriends(user, conditions, select, options, function (err, onlineFriends) {

                if (err) {
                    console.log('error getting online friends: ', err);
                }

                socket.emit('online-friends', friends);
            });
        };

        // get info about all friends, a list of friends, or a specific friend
        function getFriends (cb) {

            user.getAcceptedFriends({}, null, {}, function (err, friends) {

                if (err) { debug(err); }

                cb(err, friends);

            });

        };

        // get friends requests the user has sent
        function requestsSent () {

        };

        // get list of requests pending the user's approval
        function requestsPending () {

        };

        // send a friend request
        function requestSend () {

        };

        // accept a friend request
        function requestAccept () {

        };

        // deny a friend request
        function requestDeny () {

        };

        // abolish a friendship        
        function removeFriend () {

        };

        // get or set user preferences
        function preferences () {

        };

        /**
         *  search() - search for accounts, friends only by default
         *
         * @param {object} query - Object specifying search criterion
         * @param {object} options - Object specifying search options
         *
         */
        function search (query, options) {

            var results = [];

            debug('query', query);
            debug('options', options);
        
            // search for friends using the given query


            // if specified, search friends of friends


            // if specified, search public accounts


            // send search results to client 
            socket.emit('search-results', results)

        };

        socket.on('disconnect',         socketDisconnect);
        socket.on('online',             onlineAccounts);
        socket.on('online-friends',     onlineFriends);
        socket.on('get-friends',        getFriends);
        socket.on('requests-sent',      requestsSent);
        socket.on('requests-pending',   requestsPending);
        socket.on('request-send',       requestSend);
        socket.on('request-accept',     requestAccept);
        socket.on('request-deny',       requestDeny);
        socket.on('un-friend',          removeFriend);
        socket.on('preferences',        preferences);
        socket.on('search',             search);

    };

    // when a socket connects to the /convos namespace
    function convosConnect (socket) {

        var user = socket.request.user;

        var transfers = {};

        // get convos which the user has either started or has been invited
        socket.on('get', function getConvos () {

        });

        // join a conversation
        socket.on('join', function joinConvo (convoId) {

        });

        // leave a conversation
        socket.on('leave', function leaveConvo (convoId) {

        });

        // send a message to a conversation
        socket.on('send-message', function sendMessage (convoId, message) {

        });

        // send a file to a conversation
        socket.on('transfer-files', function (convoId, filesInfo, ready) {

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

            socket.broadcast.to(convoId).emit('transfer-files', transfer);
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
        socket.on('start', function startConvo (invitees) {

            debug(user.displayName + ' has requested to start a conversation.');

            debug('invitees', invitees);

            data.createConvo({
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
        socket.on('boot', function bootUsers (convoId, users) {

        });

        // invite one ore more users to an existing conversation
        socket.on('invite', function inviteUsers (convoId, invitees) {

        });

        // end a conversation
        socket.on('end', function endConversation (convoId) {
            
        });

    };

};

