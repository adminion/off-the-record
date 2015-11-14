/**
 * env.js
 * 
 * smb environment module
 * 
 */

var fs          = require('fs');
var os          = require('os');
var path        = require('path');
var util        = require('util');

var address;
var banner;
var bannerLines;
var infoString
var iface;
var interfaces;
var ip;
var linkTarget;
var padding;
var script;
var scriptPath;
var split;
var whitespaces;

var package     = require('../package.json');
var config      = require('./config');
var debug       = require('debug')(package.name + ':env');

var env = {};

env.prefix = process.env.OTR_PREFIX;

debug('env.prefix', env.prefix);

// get package information
env.package = package;

// returns the absolute path of a relative filepath to env.prefix
env.resolvePath = function (relPath) {

  var absPath = path.resolve(env.prefix, relPath);

  debug('absPath', absPath);

  return absPath;
};

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
// the servername
env.serverName = config.serverName,

// the url to access this server
env.url = function () {

  var address = config.http.host || this.net.addresses[0] || 'localhost';

  return 'https://' + address + ':' + this.net.port;
};

// the information string at the bottom of the banner file
infoString = util.format('v%s --> %s', env.package.version, env.url());

// determine how many whitespaces there will be with this infostring length
whitespaces = 80 - infoString.length;

// create a padding var
padding = '';

// for half the total whitespaces
for (var i = 0; i < parseInt(whitespaces/2); i++) {
  // add a space to padding
  padding += ' ';
}

// put the padding in from of infostring to center it
infoString = padding + infoString;

// split the banner file into lines
// read the banner file into a string and trim whitespace from the ends
bannerLines = fs.readFileSync(path.join(__dirname, '../banner.txt'), {encoding: 'utf8' }).trim().split('\n');

// replace line 22 (infostring line) with the current infostring;
bannerLines.splice(22,1,[infoString]);

banner = bannerLines.join('\n');

// join the lines together to make our version/address specific banner
env.banner = function () {
  if (process.env.DEBUG) {
    return banner;
  } else {
    return util.format(' --> %s\n', env.url());
  }
};
  
debug('env', env);

module.exports = env;
