
var package = require('../package.json');
var path = require('path');
var util = require('util');

var debug = require('debug')(package.name + ':config');
var extend = require('extend');

var ERR_CONFIG_DEFAULT_NOT_FOUND = 'Error: default configuration file not found';
var ERR_CONFIG_ENV_NOT_NOT_FOUND = 'Error: environment-specific configuration file not found';

var OTR_PREFIX = process.env.OTR_PREFIX || '';

debug('OTR_PREFIX', OTR_PREFIX);
debug('process.cwd()', process.cwd());

// CONFIG_DIR may be set by environment var, defaults to ../config
var defaultsFile = path.join(OTR_PREFIX, 'config/default.json');
debug('defaultsFile:', defaultsFile);

var CONFIG_DIR = process.env.OTR_CONFIG_DIR || path.join(OTR_PREFIX, 'config');
debug('CONFIG_DIR:', CONFIG_DIR);

var config;

try {
    config = require(defaultsFile);
} 

catch (err) {
    console.error(ERR_CONFIG_DEFAULT_NOT_FOUND + ': ' + defaultsFile);
    process.exit(1);
}

debug('defaults:', config);

var nodeEnv = process.env.NODE_ENV || 'development';

var overridesFile = CONFIG_DIR + "/" + nodeEnv + '.json';

debug('overridesFile', overridesFile);

try {
    var overrides = require(overridesFile);
}

catch (err) {
    console.error(ERR_CONFIG_ENV_NOT_NOT_FOUND + ': ' + overridesFile);
}

debug('NODE_ENV overrides:', overrides);

config = extend(true, config, overrides);

debug('config', config);

if (process.env.OTR_CONFIG) {
    var envOverrides = JSON.parse(process.env.OTR_CONFIG);
    config = extend(true, config, envOverrides);
    debug('OTR_CONFIG overrides:', envOverrides);

    debug('config', config);
}

module.exports = config;
