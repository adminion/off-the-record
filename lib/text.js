"use strict";

var shortId = require('shortid');

function TextMessage (options) {

  if (!options.convoId) {
    throw new Error('convoId required')
  }

  if (!options.sender) {
    throw new Error('sender required')
  }

  if (!options.text) {
    throw new Error('text required')
  }

  this.id = shortId.isValid(options.id) ? options.id : shortId.generate();
  this.convoId = options.convoId;
  this.sender = options.sender;
  this.text = options.text;
  this.dateSent = (options.dateSent) ? new Date(options.dateSent) : Date.now();

  this.dateReceived = (options.dateReceived)
    ? new Date(options.dateReceived)
    : (options.dateSent) ? Date.now() : Date;
}

module.exports = TextMessage;
