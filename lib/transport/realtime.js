
// node core modules
var events = require('events'), 
    util = require('util'),
    url = require('url');

// 3rd party modules
var config = require('config'),
    debug = require('debug'),
    passportSocketIo = require('passport.socketio'), 
    socketio = require('socket.io');

var env = require('../env');

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

    this.io.sockets.use(passportSocketIo.authorize(authOptions))
        
    this.io.sockets.on('connect', socketConnect);

    this.stop = function (done) {
        debug('stopping realtime server...');
        this.io.emit('shutdown');
        debug('realtime stopped!');
        done();
    };

    function socketConnect (socket) {

        var accountID = socket.request.user._id, 
            displayName = socket.request.user.displayName;

        // debug( 'socketStore', socketStore);

        socket.on('message', onMessage);

        function onMessage (msg) {
           // debug(msg);

        };


    };

};

