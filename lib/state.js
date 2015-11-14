
var env = require('./env');
var debug = require('debug')(env.package.name + ':state');
var ObjectId = require('mongoose').Schema.Types.ObjectId;

function State () {

  // create maps of useful realtime stuff to their ids
  this.convos = new Map();
  this.friendships = new Map();
  this.requests = new Map();
  this.transfers = new Map();
  this.sockets = new Map();
  this.users = new Map();

  Object.defineProperty(this.convos, 'members', {
    value: new Map()
  });

  Object.defineProperty(this.convos, 'byUserId', {
    value: new Map()
  });

  Object.defineProperty(this.convos, 'byUserName', {
    value: new Map()
  });

  Object.defineProperty(this.friendships, 'byUserId', {
    value: new Map()
  });

  Object.defineProperty(this.friendships, 'byUserName', {
    value: new Map()
  });

  Object.defineProperty(this.requests, 'byUserName', {
    value: new Map()
  });

  Object.defineProperty(this.sockets, 'byUserId', {
    value: new Map()
  });

  Object.defineProperty(this.sockets, 'byUserName', {
    value: new Map()
  });

  Object.defineProperty(this.users, 'byUserName', {
    value: new Map()
  });
  
  // create a method of this.users to add a user to the state
  Object.defineProperty(this.users, 'add', {
    value: (user) => {
      
      // create ref to the String form of user.id
      var userId = user.id;
      var username = user.username;

      // return false if the user already exists
      if (this.users.has(userId)) return false;

      // add the user document to the map by its Id
      this.users.set(userId, user);
      this.users.byUserName.set(username, this.users.get(userId));
      
      this.convos.byUserId.set(userId, new Set());
      this.convos.byUserName.set(username, this.convos.byUserId.get(userId));

      this.friendships.byUserId.set(userId, new Map());
      this.friendships.byUserName.set(username, this.friendships.byUserId.get(userId));

      this.requests.set(userId, {
        received: new Set(),
        sent: new Set()
      });

      this.requests.byUserName.set(username, this.requests.get(userId));

      // create a set of sockets accessible by the userId and username
      this.sockets.byUserId.set(userId, new Set());
      this.sockets.byUserName.set(user.username, this.sockets.byUserId.get(userId));

      return true;
    }
  });

  // create a method of this.user to remove a user from the state
  Object.defineProperty(this.users, 'remove', {
    value: (userId) => {

      // return false if the user doesn't exist
      if (!users.has(userId)) return false;

      // get a reference to the user's username
      var username = users.get(userId).username;

      // delete the user and its username reference
      this.users.delete(userId);
      this.users.byUserName.delete(username);

      this.convos.byUserId.delete(userId);
      this.convos.byUserName.delete(username);

      this.friends.delete(userId);
      this.friends.byUserName.delete(username);

      this.requests.delete(userId);
      this.requests.byUserName.delete(username);

      this.sockets.byUserId.delete(userId);
      this.sockets.byUserName.delete(username);

      return true;
    }
  });

  Object.defineProperty(this.convos, 'add', {
    value: (convo) => {

      // create ref to the String form of convo.id
      var convoId = convo.id;

      // return false if the convo already exists
      if (this.convos.has(convoId)) return false;

      // add the convo document to the map by its Id
      this.convos.set(convoId, convo);

      // create a set of the convo's members
      this.convos.members.set(convoId, new Set());

      var members = [convo.starter].concat(convo.invitees);

      // each member joins the convo
      members.forEach((member) => {
        this.convos.join(convo.id, member);
      });

      return true;
    }
  });

  // create a method of this.convo to remove a convo from the state
  Object.defineProperty(this.convos, 'remove', {
    value: (convoId) => {

      // get the convo
      var convo = this.convos.get(convoId);

      // return false if the convo is undefined
      if (!convo) return false;

      // have each member leave the convo
      this.convos.members.get(convoId).forEach((member) => {
        this.convos.leave(convoId, member.toString());
      });

      // delete the convo
      this.convos.delete(convoId);

      return true;
    }
  });

  Object.defineProperty(this.convos, 'join', {
    value: (convoId, userId) => {

      userId = userId.toString()

      var convo = this.convos.get(convoId);

      if (!convo) return false;

      this.convos.members.get(convoId).add(userId);
      this.convos.byUserId.get(userId).add(convoId);

      return true;
    }
  });

  Object.defineProperty(this.convos, 'leave', {
    value: (convoId, userId) => {

      var convo = this.convos.get(convoId);

      if (!convo) return false;

      this.convos.members.get(convoId).delete(userId);
      this.convos.byUserId.get(userId).delete(convod);

      return true;
    }
  });


  Object.defineProperty(this.friendships, 'add', {
    value: (friendship) => {

      this.friendships.set(friendship.id, friendship);

      var requester = this.users.get(friendship.requester.toString());
      var requested = this.users.get(friendship.requested.toString());

      // if either user doesn't exist, return false
      if (!requester || !requested) return false;

      this.friendships.set(friendship.id, friendship);

      this.friendships.byUserId.get(requester.id).set(requested.id, friendship);
      this.friendships.byUserId.get(requested.id).set(requester.id, friendship);

      return true;
    }
  });

  Object.defineProperty(this.friendships, 'remove', {
    value: (friendshipId) => {

      var friendship = this.friendships.get(friendshipId);

      var requester = this.users.get(friendship.requester.toString());
      var requested = this.users.get(friendship.requested.toString());

      // if either user doesn't exist, return false
      if (!this.users.has(requester) || !this.users.has(requested)) return false;

      this.friendships.delete(friendshipId);

      this.friendships.byUserId.get(requester.id).delete(requested.id);
      this.friendships.byUserId.get(requested.id).delete(requester.id);

      return true;

    }
  });

  Object.defineProperty(this.friendships, 'getByUserIds', {
    value: (requester, requested) => this.friendships.byUserId.get(requester).get(requested)
  });

  Object.defineProperty(this.friendships, 'getByUserNames', {
    value: (requester, requested) => this.friendships.byUserName.get(requester).get(requested)
  });

  Object.defineProperty(this.requests, 'add', {
    value: (request) => {

      debug('request', request);

      var requester = request.requester.toString();
      var requested = request.requested.toString();

      // if either user doesn't exist, return false
      if (!this.users.has(requester) || !this.users.has(requested)) return false;

      // remove the request refs
      this.requests.get(requester).sent.add(requested);
      this.requests.get(requested).received.add(requester);

    }
  });

  Object.defineProperty(this.requests, 'remove', {
    value: (request) => {

      var requester = request.requester.toString();
      var requested = request.requested.toString();

      // if either user doesn't exist, return false
      if (!this.users.has(requester) || !this.users.has(requested)) return false;

      // remove the request refs
      this.requests.get(requester).sent.delete(requested);
      this.requests.get(requested).received.delete(requester);

    }
  });

  Object.defineProperty(this.sockets, 'add', {
    value: (userId, socketId) => {

      // get a ref to the user
      var user = this.users.get(userId);

      // make sure the user exists
      if (!user) return false;

      // add the socketId to the map and sets
      this.sockets.set(socketId, userId);

      this.sockets.byUserId.get(userId).add(socketId);
      this.sockets.byUserName.get(user.username).add(socketId);

      return true;

    }
  });

  Object.defineProperty(this.sockets, 'remove', {
    value: (socketId) => {

      // make sure the socket exists
      if (!this.sockets.has(socketId)) return false;

      // get the user that belongs to this socket
      var user = this.users.get(this.sockets.get(socketId));

      // remove the socket from the map and sets
      this.sockets.delete(socketId);
      this.sockets.byUserId.get(user.id).delete(socketId);
      this.sockets.byUserName.get(user.username).delete(socketId);

      return true;
      
    }
  });

  debug('this', this);

};

module.exports = State;
