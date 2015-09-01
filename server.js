#!/usr/local/bin/node

var OffTheRecord = require('./lib/'),
  interrupt,
  server,
  stopping;

// if (process)
Error.stackTraceLimit = Infinity;

server = new OffTheRecord();

var debug = require('debug')(server.env().context());

process.on('SIGINT', function () {
  // if we're not already stopping
  if (!stopping) { 
    // if interrupt is truthy (the user has pressed ^C within the last second)
    // then shutdown the server
    if (interrupt) {

      // set the stopping flag to true to indicate that the server is stopping (in case another SIGINT is sent)
      stopping = true;
      console.log('\nstopping server...');

      // tell the server to stop itself.
      server.stop(function () {
        console.log('server stopped.');
        process.exit();
      });
    // if interrupt is not truthy
    } else {
      // set interrupt to the ID of the timeout that sets interrupt to undefined after 1 second
      interrupt = setTimeout(function () {
        interrupt = undefined;
      }, 1000);

      console.log('\n(^C again to quit)'); 
    }
  }
});

server.start();
