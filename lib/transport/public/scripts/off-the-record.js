
var socket;

$(document).ready(function () {
    socket = io();

    socket.on('connect', function () {
        console.log('socket connected!');
    });
    
});
