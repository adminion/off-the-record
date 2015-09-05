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

/** begin silly file-path detection h4x */

// Relative links are relative to process.cwd(), but if I install globally 
// using `npm install -g off-the-record` it will create a symlink in the bin 
// directory (/usr/bin or /usr/local/bin on ubuntu) that points to wherever 
// server.js is installed.  The trouble with that is that if I don't cd 
// into /usr/lib/node_modules/off-the-record to run `off-the-record`, then all 
// links used in my code will be relative to process.cwd()... this defeats the 
// purpose of having a symlink IMHO, so I'm doing a bit of fs magic to 
// figure out the folder in which the script is actually located, so that we can 
// make our links relative to that dir

// argv[1] is the path to the script that node executed.
// when installed globally, its a symbolic link to server.js (on my ubuntu box) links to
// /usr/lib/node_modules/off-the-record/server.js
// when installed locally, it should be server.js wherever it is installed
script = process.argv[1];

// lstat is just like stat but it will detect symlinks
var scriptStats = fs.lstatSync(script);

// if the file is a symbolic link 
if (scriptStats.isSymbolicLink()) {
  // use readlink to figure out the file to which it links
  scriptPath = fs.readlinkSync(script);
} 

// the prefix is the directory that server.js is in
env.prefix = path.dirname(scriptPath);

/** end silly file-path detection h4x */

  
var package     = require('../package.json');
var config      = require('./config');
var debug       = require('debug')(package.name + ':server:env');


// get package information
env.package = package;

// returns the absolute path of a relative filepath to env.prefix
env.resolvePath = function (relativePath) {
  return path.resove(env.prefix, relativePath);
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
bannerLines = fs.readFileSync(env.resolvePath('/banner.txt'), {encoding: 'utf8' }).trim().split('\n');

// replace line 22 (infostring line) with the current infostring;
bannerLines.splice(22,1,[infoString]);

banner = bannerLines.join('\n');

// join the lines together to make our version/address specific banner
env.banner = function () {
  return banner;
};
  
debug('env', env);
