"use strict";

// node core
let fs = require('fs')
let path = require('path');

let env = require('./env');

// 3rd party
let debug = require('debug')(env.package.name + ':ssl');

// adminion
let config = require('./config');

let sslPrefix = config.http.ssl.prefix || path.join(env.prefix, '.ssl');

debug('sslPrefix', sslPrefix);

let certFile = path.join(sslPrefix, config.http.ssl.cert);
let keyFile = path.join(sslPrefix, config.http.ssl.key);

debug('certFile', certFile);
debug('keyFile', keyFile);

let ssl = {
  path: { 
    cert: certFile,
    key: keyFile
  },
  data: {}
};

ssl.data.cert = fs.readFileSync(certFile);
ssl.data.key =  fs.readFileSync(keyFile);

module.exports = ssl;

debug('ssl.path', ssl.path)
