/**
 * env.js
 * 
 * smb environment module
 * 
 */
var os = require('os')
    , env = module.exports; 

var config  = require('./config');

env.prefix      = process.cwd();
env.serverName  = config.serverName;

env.net = { 
    addresses : [],
    port : config.port,
    protocol : (config.https) ? 'https' : 'http',
    ssl : (config.https) ? require('./ssl') : undefined
};

/**
 *  Get the IPv4 address.
 * I'm not quite sure what would happen if an interface has multiple IPs...
 *
 */

var address,
    iface,
    interfaces = os.networkInterfaces(), 
    ip;

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
    
env.url = function () {

    var address = env.net.addresses[0] || 'localhost';

    return env.net.protocol + '://' + address + ':' + env.net.port;
}

//debug.vars('module.exports', module.exports,'lib/env.js' 46);
