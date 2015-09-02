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
  ip,
  package = require('../package.json');
  
var debug = require('debug')(package.name + ':server:env');

// read the banner file into a string and trim whitespace from the ends
var banner = fs.readFileSync('./banner.txt', {encoding: 'utf8' }).trim();

// get package information
env.package = package;

// context for debug namespaces
env.context = function (descriptor) {

  var context = this.package.name;

  if (descriptor) {
    context += ':' + descriptor;
  }

  return context;
};

// network information
env.net = { 
  addresses : [],
  host: config.http.host,
  port: config.http.port
}

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

debug('env.net.addresses', env.net.addresses);

// the current working directory is the prefix for the project
env.prefix = process.cwd(),
// the servername
env.serverName = config.serverName,

// the url to access this server
env.url = function () {

  var address = config.http.host || this.net.addresses[0] || 'localhost';

  return 'https://' + address + ':' + this.net.port;
};

// the information string at the bottom of the banner file
var infoString = util.format('%s server v%s started! >> %s', env.package.name, env.package.version, env.url());

// determine how many whitespaces there will be with this infostring length
var whitespaces = 80 - infoString.length;

// create a padding var
var padding = '';

// for half the total whitespaces
for (var i = 0; i < parseInt(whitespaces/2); i++) {
  // add a space to padding
  padding += ' ';
}

// put the padding in from of infostring to center it
infoString = padding + infoString;

// split the banner file into lines
var split = banner.split('\n');

// replace line 22 (infostring line) with the current infostring;
split.splice(22,1,[infoString]);

// join the lines together to make our version/address specific banner
env.banner = split.join('\n');

  
//debug('module.exports', module.exports);


