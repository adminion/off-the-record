"use strict";

var pkg = require('../../package');
var debug = require('debug')(pkg.name + ':models:conversation');
var mongoose = require('mongoose');

var config = require('../config');
var model;

var ObjectId = mongoose.Schema.Types.ObjectId;
var conversationModelName = config.mongoose.conversationModelName;
var userModelName = config.mongoose.userModelName;

var ConversationSchema = new mongoose.Schema({
  starter: { type: ObjectId, ref: userModelName },
  invitees: [ { type: ObjectId, ref: userModelName }]
});

ConversationSchema.virtual('members').get(function () {
  if (!this.__members) {
    this.__members = new Map();
  }

  return this.__members;
});

ConversationSchema.virtual('messages').get(function () {
  if (!this.__messages) {
    this.__messages = [];
  }

  return this.__messages;

});

ConversationSchema.statics.isInvited = function (conversationId, userId, done) {
  model.findById(conversationId, function (err, conversation) {
    if (err) return done(err);

    done(null, conversation.isInvited(userId));
  });
};

ConversationSchema.statics.isStarter = function (conversationId, userId, done) {
  model.findById(conversationId, function (err, conversation) {
    if (err) return done(err);

    done(null, conversation.isStarter(userId));
  });
};

ConversationSchema.methods.isInvited = function (userId) {
  // if the invitees array contains the given userId
  return (this.__members.has(userId) && !this.starter.equals(userId));
};

ConversationSchema.methods.isStarter = function (userId) {
  return this.starter.equals(userId);
};

ConversationSchema.methods.isMember = function (userId) {

  debug('userId', userId);

  debug('this.__members', this.__members);

  // if the members array contains the given userId
  return this.__members.has(userId);
}

ConversationSchema.methods.mayJoin = function (userId) {
  return (this.isStarter(userId) || this.isInvited(userId));
};

module.exports = function () {

  if (model === undefined) {
    model = mongoose.model(conversationModelName, ConversationSchema);
  }

  return model;
}
