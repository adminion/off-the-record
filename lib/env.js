/**
 * env.js
 * 
 * smb environment module
 * 
 */
var config  = require('config'),
    os = require('os'),
    address,
    iface,
    interfaces = os.networkInterfaces(), 
    ip;
    
var env = {}

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
    port : config.get('port'),
    protocol : (config.get('https')) ? 'https' : 'http',
    ssl : require('./transport/ssl')
}


env.prefix = process.cwd(),
env.serverName = config.get('serverName'),
env.url = function () {

    var address = this.net.addresses[0] || 'localhost';

    return this.net.protocol + '://' + address + ':' + this.net.port;
};

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


