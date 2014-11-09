
var io = require('socket.io')();

io.on('connect', function (socket) {

    socket.on('join', function () {
        socket.join('room', function (err) {
            if (err) {
                socket.emit('join', err)
            } else {
                socket.emit('join', true);
            }
        });
    });

    socket.on('roomtest', function (message) {
        socket.broadcast.emit('roomtest', message);

    });

});
