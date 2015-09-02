
// node core
var fs = require('fs'),
    path = require('path');

var env = require('../env');

// 3rd party
var debug = require('debug')(env.context('server:transport:ssl'));

// adminion
    config = require('../config');

var sslPrefix = config.http.ssl.prefix || path.join(env.prefix, '.ssl');
var certFile = path.resolve(path.join(sslPrefix, config.http.ssl.cert));
var keyFile = path.resolve(path.join(sslPrefix, config.http.ssl.key));
    
var ssl = {
    path: { 
        cert: certFile,
        key: keyFile
    },
    data: {
        cert: fs.readFileSync(certFile),
        key: fs.readFileSync(keyFile)
    }
};

module.exports = ssl;

debug('ssl.path', ssl.path)
