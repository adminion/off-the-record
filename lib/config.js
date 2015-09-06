
var package = require('../package.json');
var path = require('path');
var util = require('util');

var debug = require('debug')(package.name + ':server:config');
var extend = require('extend');

// CONFIG_DIR may be set by environment var, defaults to ../config
var CONFIG_DIR = process.env.OTR_CONFIG_DIR || '../config';
var defaultsFile = path.join(CONFIG_DIR, 'default.json');

debug('CONFIG_DIR:', CONFIG_DIR);
debug('defaultsFile:', defaultsFile);

var config = require(defaultsFile);

debug('defaults:', config);

var nodeEnv = process.env.NODE_ENV || 'development';

var overridesFile = path.join(CONFIG_DIR, nodeEnv + '.json');
var overrides = require(overridesFile);

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
