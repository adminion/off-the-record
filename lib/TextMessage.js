
var shortId = require('shortid');

function TextMessage (convoId, username, message) {
  this.id = shortId.generate();
  this.convoId = convoId;
  this.sender = username;
  this.message = message;
  this.dateSent = Date.now();
  this.dateReceived = Date;
};

module.exports = TextMessage;
