
// node core
var fs = require('fs'),
    path = require('path');

var env = require('../env');

// 3rd party
var debug = require('debug')(env.context('server:transport:ssl'));

// adminion
var config = require('../config');

var ERR_CERT_NOT_FOUND = 'Error: SSL certificate file not found';
var ERR_KEY_NOT_FOUND = 'Error: SSL key file not found';

var sslPrefix = config.http.ssl.prefix || path.join(process.env.OTR_PREFIX, '.ssl');
debug('sslPrefix', sslPrefix);

var certFile = path.join(sslPrefix, config.http.ssl.cert);
var keyFile = path.join(sslPrefix, config.http.ssl.key);

debug('certFile', certFile);
debug('keyFile', keyFile);

var ssl = {
    path: { 
        cert: certFile,
        key: keyFile
    },
    data: {}
};

try {
    ssl.data.cert = fs.readFileSync(certFile);
}

catch (err) {
    console.error(ERR_CERT_NOT_FOUND + ': ' + certFile)
    process.exit(1);
}

try {
    ssl.data.key =  fs.readFileSync(keyFile);
} 

catch (err) {
    console.error(ERR_KEY_NOT_FOUND + ': ' + keyFile);
    process.exit(1);
}

module.exports = ssl;

debug('ssl.path', ssl.path)
