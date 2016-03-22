"use strict";

var pkg = require('../package.json');
var fs = require('fs');
var path = require('path');

var debug = require('debug')(pkg.name + ':config');
var extend = require('extend');

var MSG_CONFIG_ENV_NOT_NOT_FOUND = 'Info: environment-specific configuration file not found, creating';

var OTR_PREFIX = process.env.OTR_PREFIX || path.resolve(__dirname, '..');

debug('OTR_PREFIX', OTR_PREFIX);
debug('process.cwd()', process.cwd());

// CONFIG_DIR may be set by environment var, defaults to config
var CONFIG_DIR = process.env.OTR_CONFIG_DIR || path.join(OTR_PREFIX, 'config');
debug('CONFIG_DIR:', CONFIG_DIR);

var defaultsFile = path.join(CONFIG_DIR, 'default.json');
debug('defaultsFile:', defaultsFile);

var config;

try {
  config = require(defaultsFile);
} 

catch (err) {

  console.error(err.message);

  process.exit(1);
}

debug('defaults:', config);

var nodeEnv = process.env.NODE_ENV || 'development';

var overridesFile = path.join(CONFIG_DIR, nodeEnv + '.json');

debug('overridesFile', overridesFile);

var overrides;

try {
  overrides = require(overridesFile);
}

catch (err) {

  debug('err', err);

  if (err.code === 'MODULE_NOT_FOUND') {
    console.log(MSG_CONFIG_ENV_NOT_NOT_FOUND + ': ' + overridesFile);

    fs.writeFileSync(overridesFile, '{\n\n}');
    overrides = {};
  } else {
    process.exit(1);
  }

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
