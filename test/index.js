"use strict";

/**
 * This file is used to run each test suite in the following order:
 * 1. Server
 * 2. Client
 * 3. App
 */

var test_server = require('./server');
// var test_client = require('./client');
// var test_app = require('./app');

test_server();
// test_client();
// test_app();
