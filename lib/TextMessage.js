
var shortId = require('shortid');

function TextMessage (convoId, username, text) {
  this.id = shortId.generate();
  this.convoId = convoId;
  this.sender = username;
  this.text = text;
  this.dateSent = Date.now();
  this.dateReceived = Date;
};

module.exports = TextMessage;
