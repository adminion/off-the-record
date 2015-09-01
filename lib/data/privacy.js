
var debug = require('debug')('off-the-record:server:data:privacy');

/** @module privacy */
Object.defineProperty(module, 'exports', {
  value: {
    0:                  "ANYBODY",
    1:                  "FRIENDS_OF_FRIENDS", 
    2:                  "PENDING_FRIENDS",
    3:                  "FRIENDS", 
    4:                  "NOBODY",
    ANYBODY:            0,
    FRIENDS_OF_FRIENDS: 1,
    PENDING_FRIENDS:    2,
    FRIENDS:            3,
    NOBODY:             4 
  }
})

// debug('module.exports', module.exports);
