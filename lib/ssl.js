
// node core
var fs = require('fs'),
    path = require('path');

var env = require('./env');

// 3rd party
var debug = require('debug')(env.context('ssl'));

// adminion
    config = require('config');
    
var ssl = {
    data : {
        cert : fs.readFileSync(path.resolve(config.get('cert'))).toString('ascii'),
        key : fs.readFileSync(path.resolve(config.get('key'))).toString('ascii')
    }, 
    path : { 
        cert : path.resolve(config.get('cert')), 
        key : path.resolve(config.get('key'))
    }
};

module.exports = ssl;

debug('module.exports', module.exports)
