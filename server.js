"use strict";

Error.stackTraceLimit = Infinity;

let OffTheRecord = require('./lib/');
  
let server = new OffTheRecord();

let debug = require('debug')(server.env.context());

debug('server', server);

console.log('starting %s v%s...', server.env.package.name, server.env.package.version);

server.start();
