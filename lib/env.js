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

var env = module.exports;

var address;
var banner;
var bannerLines;
var infoString
var iface;
var interfaces;
var ip;
var padding;
var script;
var scriptPath;
var split;
var whitespaces;

// argv[1] is the path to the script that node executed.
// in our case this is a symbolic link that (on my ubuntu box) links to
// /usr/lib/node_modules/off-the-record/server.js
// the project prefix is the dirname of the ultimate path of the link

script = process.argv[1];

var scriptStats = fs.lstatSync(script);

if (scriptStats.isSymbolicLink()) {
  scriptPath = path.dirname(fs.readlinkSync(script));
} else {
  scriptPath = path.dirname(scriptPath);
}

env.prefix = scriptPath;
  
var package     = require('../package.json');
var config      = require('./config');
var debug       = require('debug')(package.name + ':server:env');


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
// the servername
env.serverName = config.serverName,

// the url to access this server
env.url = function () {

  var address = config.http.host || this.net.addresses[0] || 'localhost';

  return 'https://' + address + ':' + this.net.port;
};

// the information string at the bottom of the banner file
infoString = util.format('%s server v%s started! >> %s', env.package.name, env.package.version, env.url());

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
bannerLines = fs.readFileSync(env.prefix + '/banner.txt', {encoding: 'utf8' }).trim().split('\n');

// replace line 22 (infostring line) with the current infostring;
bannerLines.splice(22,1,[infoString]);

banner = bannerLines.join('\n');

// join the lines together to make our version/address specific banner
env.banner = function () {
  return banner;
};
  
debug('env', env);
