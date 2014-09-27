
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

module.exports = OffTheRecord_realtime;

////////////////////////////////////////////////////////////////////////////////
//
// main module constructor
// 
////////////////////////////////////////////////////////////////////////////////

function OffTheRecord_realtime () {

    var io, 
        socketStore = new SocketStoreage(),
        self = this;

    this.start = function () {

        // @see https://github.com/LearnBoost/socket.io/wiki/Configuring-Socket.IO
        var configuration = {
            'authorization': passportSocketIo.authorize({
                cookieParser:   this.http.cookieParser, 
                key:            'adminion.sid',
                secret:         this.config.session.secret, 
                store:          this.data.session()
            }),
            'log level': (this.config.debug) ? 3 : 0
        };

        // create server instance
        io = socketio.listen(this.http.server, configuration);

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

