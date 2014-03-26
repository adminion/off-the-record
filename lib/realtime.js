
// node core modules
var events = require('events'), 
    util = require('util'),
    url = require('url');

// 3rd party modules
var passportSocketIo = require('passport.socketio'), 
    socketio = require('socket.io');

// adminion server monules
var SocketStoreage = require('./models/socket'),
    utils = require('./utils');

////////////////////////////////////////////////////////////////////////////////
//
// main module constructor
// 
////////////////////////////////////////////////////////////////////////////////

function OffTheRecord_realtime (keyRing) {

    var io, 
        socketStore = new SocketStoreage(),
        self = this;

    this.start = function () {

        // @see https://github.com/LearnBoost/socket.io/wiki/Configuring-Socket.IO
        var configuration = {
            'authorization': passportSocketIo.authorize({
                cookieParser:   keyRing.http.cookieParser, 
                key:            'adminion.sid',
                secret:         keyRing.config.session.secret, 
                store:          keyRing.data.session()
            }),
            'log level': (keyRing.config.debug) ? 3 : 0
        };

        // create server instance
        io = socketio.listen(keyRing.http.server, configuration);

        io.server.on('close', function () {
            self.emit('closed');
        });

        /**
         *  function onConnection(socket)
         *  
         * Called each time a socket connects to the socket server.
         */
        io.sockets.on('connection', initSocket);

        this.emit('ready');
    };

    this.stop = function () {
        io.server.close(function () {
            self.emit('stopped');
        });
    };

    function initSocket (socket) {

        var personID = socket.handshake.user['_id'], 
            displayName = socket.handshake.user.displayName,
            pathname = url.parse(socket.handshake.headers.referer).pathname;

        // depends on the route requested

        socket.on('disconnect', onDisconnect);

        socket.on('message', onMessage);

        

    }

};

util.inherits(realtime, events.EventEmitter);

module.exports = realtime;