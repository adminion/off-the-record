"use strict";

/**
 * This file is used to run each test suite in the following order:
 * 1. Server
 * 2. Client
 * 3. App
 */

var test_server = require('./test_server');
var test_client = require('./test_client');
var test_app = require('./test_app');

test_server();
test_client();
test_app();
