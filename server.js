
var server = new require('./lib/otr')();

var debug = require('debug')(server.env.context());

server.on('ready', function () {
    debug('off-the-record server is running!');
});

server.start();
