
var env = require('./env');
var debug = require('debug')(env.package.name + ':state');
var ObjectId = require('mongoose').Schema.Types.ObjectId;

function State () {

  // create maps of useful realtime stuff to their ids
  this.convos = new Map();
  this.friendships = new Map();
  this.online = new Set();
  this.requests = new Map();
  this.transfers = new Map();
  this.sockets = new Set();
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

  Object.defineProperty(this.friendships, 'getByUserIds', {
    value: (requester, requested) => this.friendships.byUserId.get(requester).get(requested)
  });

  Object.defineProperty(this.friendships, 'getByUserNames', {
    value: (requester, requested) => this.friendships.byUserName.get(requester).get(requested)
  });

  Object.defineProperty(this.requests, 'byUserId', {
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

  Object.defineProperty(this.users, 'bySocketId', {
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

      this.requests.byUserId.set(userId, new Map());
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

      var members = [convo.starter].concat(convo.invitees);

      // each member joins the convo
      members.forEach((member) => {
        this.convos.join(convo.id, member);
      });

      return convo;
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
      var user = this.users.get(userId);

      if (!convo || !user) return false;

      // give the convo a reference to the user
      convo.members.add(user);

      // give the user a reference to the convo
      user.convos.add(convo);

      return true;
    }
  });

  Object.defineProperty(this.convos, 'leave', {
    value: (convoId, userId) => {

      var convo = this.convos.get(convoId);
      var user = this.users.get(userId);

      if (!convo) return false;

      // delete the users's reference to the convo
      user.convos.delete(convo);

      // delete the convos's reference to the user
      convo.members.delete(user);

      return true;
    }
  });


  Object.defineProperty(this.friendships, 'add', {
    value: (friendship) => {

      // get the users
      var requester = this.users.get(friendship.requester.toString());
      var requested = this.users.get(friendship.requested.toString());

      // if either user doesn't exist, return false
      if (!requester || !requested) return false;

      // add the friendship to the map of
      this.friendships.set(friendship.id, friendship);

      // give each user a reference to the friendship
      this.friendships.byUserId.get(requester.id).set(requested.id, friendship);
      this.friendships.byUserId.get(requested.id).set(requester.id, friendship);

      // populate the users friends or requests sets depending on the status of the friendship
      if (friendship.status === 'pending') {
        this.requests.add(friendship);
      } else {
        requester.friends.add(requested);
        requested.friends.add(requester);
      }

      return true;
    }
  });

  Object.defineProperty(this.friendships, 'remove', {
    value: (friendshipId) => {

      // get the friendship from the map 
      var friendship = this.friendships.get(friendshipId);

      // get the requester and requested users
      var requester = this.users.get(friendship.requester.toString());
      var requested = this.users.get(friendship.requested.toString());

      // if either user doesn't exist, return false
      if (!this.users.has(requester) || !this.users.has(requested)) return false;

      this.friendships.delete(friendshipId);

      // delete each user's reference to the friendship
      this.friendships.byUserId.get(requester.id).delete(requested.id);
      this.friendships.byUserId.get(requested.id).delete(requester.id);

      // clean the users friends or requests sets depending on the status of the friendship
      if (friendship.status === 'pending') {
        requester.requests.sent.delete(requested);
        requested.requests.received.delete(requester);
      } else {
        requester.friends.delete(requested);
        requested.friends.delete(requester)
      }

      return true;
    }

  });

  Object.defineProperty(this.requests, 'add', {
    value: (request) => {

      debug('request', request);

      var requester = this.users.get(request.requester.toString());
      var requested = this.users.get(request.requested.toString());

      debug('requester.requests', requester.requests);
      debug('requested.requests', requested.requests);

      // if either user doesn't exist, return false
      if (!this.users.has(requester.id) || !this.users.has(requested.id)) return false;

      this.requests.set(request.id, request);

      this.requests.byUserId.get(requester.id).set(requested.id, request);
      this.requests.byUserId.get(requested.id).set(requester.id, request);

      requester.requests.sent.add(requested);
      requested.requests.received.add(requester);

      return request;

    }
  });

  Object.defineProperty(this.requests, 'accept', {
    value: (requestId) => {

      var request = this.requests.get(requestId);

      // make sure the request exists and its not accepted yet
      if (request && request.status === 'accepted') return false;

      request.status = 'accepted';

      this.requests.remove(requestId);
      this.friendships.add(request);

      return request;
    }
  });

  Object.defineProperty(this.requests, 'remove', {
    value: (requestId) => {

      var request = this.requests.get(requestId);

      var requester = this.users.get(request.requester.id);
      var requested = this.users.get(request.requested.id);

      // if either user doesn't exist, return false
      if (! requester || !requested) return false;

      this.requests.delete(request.id);

      // remove the request refs
      this.requests.byUserId.get(requester.id).delete(requested.id, request);
      this.requests.byUserId.get(requested.id).delete(requester.id, request);

      requester.requests.sent.delete(requested);
      requester.requests.received.delete(requested);

      return request;
    }
  });

  Object.defineProperty(this.sockets, 'connect', {
    value: (userId, socketId) => {

      // debug('userId', userId);
      // debug('socketId', socketId);

      // get a ref to the user
      var user = this.users.get(userId);

      // make sure the user exists
      if (!user) return false;

      if (!this.online.has(userId)) {
        this.online.add(userId);
      }

      // add the socketId to the map and sets
      this.sockets.add(socketId);

      // create a reference to the user by this socketId
      this.users.bySocketId.set(socketId, user);
      this.sockets.byUserId.get(user.id).add(socketId);

      // give the user a reference to the socketId
      user.sockets.add(socketId);

      return true;

    }
  });

  Object.defineProperty(this.sockets, 'disconnect', {
    value: (socketId) => {

      // debug('this.sockets.has(' + socketId + '),', this.sockets.has(socketId));

      // make sure the socket exists
      if (!this.sockets.has(socketId)) return false;

      // get the user that belongs to this socket
      var user = this.users.bySocketId.get(socketId);

      this.sockets.delete(socketId);

      // delete the reference to the user by this socketId
      this.users.bySocketId.delete(socketId);

      // remove the user's reference to this socketId
      user.sockets.delete(socketId);

      return true;
      
    }
  });

  debug('this', this);

};

module.exports = State;
