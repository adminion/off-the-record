var OffTheRecord = require('./lib/'),
    interrupt,
    server,
    stopping;


server = new OffTheRecord();

var debug = require('debug')(server.env().context());

process.on('SIGINT', function () {
    if (interrupt && !stopping) {
        console.log()
        stopping = true;
        server.stop(process.exit);
    } else {
        console.log('\n(^C again to quit)'); 
        interrupt = setTimeout(function () {
            interrupt = undefined;
        }, 1000);
    }
});

server.start();
