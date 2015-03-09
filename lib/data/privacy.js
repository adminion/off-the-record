
var debug = require('debug')('off-the-record:server:data:privacy');

/** @module privacy */
Object.defineProperty(module, 'exports', {
	value: {
	    0: 						"ANYBODY",
	    1: 						"FRIENDS_OF_FRIENDS", 
	    2: 						"FRIENDS", 
	    3: 						"NOBODY",
	    ANYBODY:             	0,
		FRIENDS_OF_FRIENDS:   	1,
		FRIENDS:              	2,
		NOBODY:               	3	
	}
})

debug('module.exports', module.exports);
