"use strict"

let EventEmitter = require('events').EventEmitter;
let util = require('util');

let Client = require('./client');



class OffTheRecord_Browser_App extends EventEmitter {

	constructor() {
		super();

		let self = this;

		// initialize client
		// setup client event handlers 
		this.client = new Client();

		// initialize app state based on user session and localStorage
		// this.state = 
		
		// initialize views
		
		// define view initializers


	}

};




Global.OffTheRecord = new OffTheRecord_Browser_App();
