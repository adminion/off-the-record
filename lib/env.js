/**
 * env.js
 * 
 * smb environment module
 * 
 */
var config  = require('config'),
    fs = require('fs'),
    os = require('os'),
    util = require('util'),
    address,
    iface,
    interfaces = os.networkInterfaces(), 
    ip;
    
var env = {}

var banner = fs.readFileSync('./banner.txt', {encoding: 'utf8' });

module.exports = env;

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

// debug.val('env.net.addresses', env.net.addresses, 'lib/env.js', 41);
    
//debug.vars('module.exports', module.exports,'lib/env.js' 46);


