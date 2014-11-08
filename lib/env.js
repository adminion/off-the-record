/**
 * env.js
 * 
 * smb environment module
 * 
 */
var env = module.exports;

var config  = require('config'),
    fs = require('fs'),
    os = require('os'),
    util = require('util'),
    address,
    iface,
    interfaces = os.networkInterfaces(), 
    ip;
    
var banner = fs.readFileSync('./banner.txt', {encoding: 'utf8' });

Object.defineProperty(env, 'privacy', {
    enumerable: true,
    value: {
        levels: ['NOBODY', 'FRIENDS', 'FRIENDS_OF_FRIENDS', 'ANYBODY'],
        'NOBODY':               0,
        'FRIENDS':              1,
        'FRIENDS_OF_FRIENDS':   2,
        'ANYBODY':               3,
    }
});

env.package = require('../package.json'),

env.context = function (descriptor) {

    var context = this.package.name;

    if (descriptor) {
        context += ':' + descriptor;
    }

    return context;
};

env.net = { 
    addresses : [],
    port : config.get('port')
}

/**
 *  Get the IPv4 address.
 * I'm not quite sure what would happen if an interface has multiple IPs...
 *
 */
// for each interface available...
for (iface in interfaces) {
    // for each address assigned to this interface..
    for (address in interfaces[iface]) {
        // get the properties of this address
        ip = interfaces[iface][address];
        // make sure its IPv4 and its not internal
        if (ip.family == 'IPv4' && !ip.internal) {
            // add it to the list of IPs avaialble
            env.net.addresses.push(ip.address);
        }
    }
}

// debug('env.net.addresses', env.net.addresses);

env.prefix = process.cwd(),
env.serverName = config.get('serverName'),
env.url = function () {

    var address = this.net.addresses[0] || 'localhost';

    return 'https://' + address + ':' + this.net.port;
};

var infoString = util.format('%s server v%s started! >> %s', env.package.name, env.package.version, env.url(true));

var whitespaces = 80 - infoString.length;
var padding = '';

for (var i = 0; i < parseInt(whitespaces/2); i++) {
    padding += ' ';
}

infoString = padding + infoString;

var split = banner.trim().split('\n');

split.splice(22,1,[infoString]);

env.banner = split.join('\n');

    
//debug('module.exports', module.exports);


