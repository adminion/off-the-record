"use strict";

var EventEmitter = require('events').EventEmitter;
var util = require('util');

var env = require('./env');
var debug = require('debug')(env.package.name + ':state');
var relationships = new require('friends-of-friends').prototype.relationships;

var LOGOUT_DELAY = 2000;

function State () {

  // create maps of useful realtime stuffs to their ids
  this.convos = new Map();
  this.friendships = new Map();
  this.online = new Map();
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

  Object.defineProperty(this.friendships, 'getByUserIds', {
    value: (requester, requested) => this.friendships.byUserId.get(requester).get(requested)
  });

  Object.defineProperty(this.friendships, 'getByUserNames', {
    value: (requester, requested) => this.friendships.byUserName.get(requester).get(requested)
  });

  Object.defineProperty(this.online, 'byUserName', {
    value: new Map()
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
      
      user.convos = new Map();

      this.convos.byUserId.set(userId, user.convos);
      this.convos.byUserName.set(username, user.convos);

      this.friendships.byUserId.set(userId, new Map());
      this.friendships.byUserName.set(username, this.friendships.byUserId.get(userId));

      user.friends = new Map();
      
      Object.defineProperty(user.friends, 'byUserName', {
        value: new Map()
      });

      Object.defineProperty(user.friends, 'online', {
        value: () => {
          let onlineIds = Array.from(user.friends.keys()).filter(friend => {
            debug('friend', friend);
            debug('this.online', this.online);
            if (this.online.has(friend.toString())) {
              return true;
            }
          });

          let onlineFriends = new Set();

          onlineIds.forEach(id => {
            onlineFriends.add( this.users.get(id.toString()).username );
          });

          return onlineFriends;
        }
      });

      this.requests.byUserId.set(userId, new Map());
      this.requests.byUserName.set(username, this.requests.get(userId));

      user.requests = {
        sent: new Map(),
        received: new Map()
      };

      Object.defineProperty(user.requests.sent, 'byUserId', {
        value: new Map()
      });

      Object.defineProperty(user.requests.sent, 'byUserName', {
        value: new Map()
      });

      Object.defineProperty(user.requests.received, 'byUserId', {
        value: new Map()
      });
      
      Object.defineProperty(user.requests.received, 'byUserName', {
        value: new Map()
      });

      user.sockets = new Map();

      // create a set of sockets accessible by the userId and username
      this.sockets.byUserId.set(userId, user.sockets);
      this.sockets.byUserName.set(user.username, user.sockets);

      debug('added user to state', user);

      return true;
    }
  });

  // create a method of this.user to remove a user from the state
  Object.defineProperty(this.users, 'remove', {
    value: (userId) => {

      // return false if the user doesn't exist
      if (!this.users.has(userId)) return false;

      // get a reference to the user's username
      var user = this.users.get(userId);

      // delete the user and its username reference
      this.users.delete(userId);
      this.users.byUserName.delete(user.username);

      this.convos.byUserId.delete(userId);
      this.convos.byUserName.delete(user.username);

      // @TODO: delete friendship references, then delete user.friends

      this.friends.delete(userId);
      this.friends.byUserName.delete(user.username);

      this.requests.delete(userId);
      this.requests.byUserName.delete(user.username);

      this.sockets.byUserId.delete(userId);
      this.sockets.byUserName.delete(user.username);

      debug('removed user', user);

      user = undefined;

      return true;
    }
  });

  Object.defineProperty(this.convos, 'add', {
    value: (convo) => {

      // create ref to the String form of convo.id
      var convoId = convo.id;

      // return false if the convo already exists
      if (this.convos.has(convoId)) return false;

      convo.members = new Map();
      Object.defineProperty(convo.members, 'byUserName', {
        value: new Map()
      });

      // add the convo document to the map by its Id
      this.convos.set(convoId, convo);

      var members = [convo.starter].concat(convo.invitees);

      // each member joins the convo
      members.forEach((member) => {
        this.convos.join(convo.id, member);
      });

      debug('added convo to state', convo);

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
      convo.members.forEach((member) => {
        this.convos.leave(convoId, member.id);
      });

      // delete the convo
      this.convos.delete(convoId);

      debug('removed convo', convo);

      convo = undefined;

      return true;
    }
  });

  Object.defineProperty(this.convos, 'join', {
    value: (convoId, userId) => {

      userId = userId.toString()

      var convo = this.convos.get(convoId);
      var user = this.users.get(userId);

      if (!convo || !user) return false;

      convo.members.set(userId, user);
      convo.members.byUserName.set(user.username, user);

      user.convos.set(convoId, convo);

      // subscribe this user to the convo's event feed
      this.subscribe(user.id, convoId);

      debug('%s joined convo %s', user.username, convo.id);

      return true;
    }
  });

  Object.defineProperty(this.convos, 'leave', {
    value: (convoId, userId) => {

      var convo = this.convos.get(convoId);
      var user = this.users.get(userId);

      if (!convo) return false;

      // delete the users's reference to the convo
      user.convos.delete(convoId);

      // delete the convos's reference to the user
      convo.members.delete(userId);
      convo.members.byUserName.delete(user.username);

      // unsubscribe this user to the convo's event feed
      this.unsubscribe(user.id, convoId);

      debug('%s left convo %', user.username, convo.id);

      return true;
    }
  });


  Object.defineProperty(this.friendships, 'add', {
    value: (friendship) => {

      // get the users
      var requester = this.users.get(friendship.requester.toString());
      var requested = this.users.get(friendship.requested.toString());

      // if either user doesn't exist or this is a request return false
      if (!requester || !requested || friendship.status === 'pending') return false;

      // add the friendship to the map of
      this.friendships.set(friendship.id, friendship);

      // give each user a reference to the friendship
      this.friendships.byUserId.get(requester.id).set(requested.id, friendship);
      this.friendships.byUserId.get(requested.id).set(requester.id, friendship);

      // create refs to the new friend by their userId and byUserName  
      requester.friends.set(requested.id, requested);
      requester.friends.byUserName.set(requested.username, requested);

      // create refs to the new friend by their userId and byUserName
      requested.friends.set(requester.id, requester);
      requested.friends.byUserName.set(requester.username, requester);

      // subscribe the users from each other's activity feeds
      this.subscribe(requester.id, requested.id);
      this.subscribe(requested.id, requester.id);

      debug('added friendship to state', friendship);
    
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

      // if either user doesn't exist or this is a request, return false
      if (!requester || !requested || friendship.status === 'pending') return false;

      this.friendships.delete(friendshipId);

      // delete each user's reference to the friendship
      this.friendships.byUserId.get(requester.id).delete(requested.id);
      this.friendships.byUserId.get(requested.id).delete(requester.id);

      // delete refs to the new friend by their userId and byUserName  
      requester.friends.delete(requested.id);
      requester.friends.byUserName.delete(requested.username);

      // delete refs to the new friend by their userId and byUserName
      requested.friends.delete(requester.id);
      requested.friends.byUserName.delete(requester.username);

      // unsubscribe the users from each other's activity feeds
      this.unsubscribe(requester.id, requested.id);
      this.unsubscribe(requested.id, requester.id);

      debug('removed friendship', friendship)

      friendship = undefined;

      return true;
    }

  });

  Object.defineProperty(this.requests, 'add', {
    value: (request) => {

      var requester = this.users.get(request.requester.toString());
      var requested = this.users.get(request.requested.toString());

      // if either user doesn't exist, return false
      if (!this.users.has(requester.id) || !this.users.has(requested.id)) return false;

      this.requests.set(request.id, request);

      this.requests.byUserId.get(requester.id).set(requested.id, request);
      this.requests.byUserId.get(requested.id).set(requester.id, request);

      requester.requests.sent.set(requested.id, requested);
      requester.requests.sent.byUserName.set(requested.username, requested);

      requested.requests.received.set(requester.id, requester);
      requested.requests.received.byUserName.set(requester.username, requester);

      debug('added request to state', request);

      return request;

    }
  });

  Object.defineProperty(this.requests, 'accept', {
    value: (requestId) => {

      var request = this.requests.get(requestId);

      // make sure the request exists and its not accepted yet
      if (request && request.status === 'accepted') return false;

      this.requests.remove(requestId);

      var friendship = request;
      friendship.status = 'accepted';
      
      this.friendships.add(friendship);

      debug('accepted request', friendship);

      return friendship;
    }
  });

  Object.defineProperty(this.requests, 'remove', {
    value: (requestId) => {

      debug('requestId', requestId);

      var request = this.requests.get(requestId);

      var requester = this.users.get(request.requester.toString());
      var requested = this.users.get(request.requested.toString());

      debug('request', request);
      debug('requester', requester);
      debug('requested', requested);

      // if either user doesn't exist, return false
      if (!request || ! requester || !requested) {
        debug('request, requester, or requested not found');
        return false;
      }

      this.requests.delete(request.id);

      // remove the request refs
      this.requests.byUserId.get(requester.id).delete(requested.id, request);
      this.requests.byUserId.get(requested.id).delete(requester.id, request);

      requester.requests.sent.delete(requested.id);
      requester.requests.sent.byUserName.delete(requested.username);

      requested.requests.received.delete(requester.id);
      requested.requests.received.byUserName.delete(requester.username);

      debug('removed request', request);

      request = undefined;

      return true;
    }
  });

  Object.defineProperty(this.sockets, 'connect', {
    value: (userId, socket) => {

      // get a ref to the user
      var user = this.users.get(userId);

      // make sure the user exists
      if (!user) return false;

      debug('user.sockets.size', user.sockets.size);

      // if the user is not online
      if (!this.online.has(userId)) {

        this.online.set(userId, user);
        this.online.byUserName.set(user.username, user);

        this.emit('login', user);
      }

      // if the user is pending logout (disconnected within the last second)
      if (user.logoutTimeout) {
        // cancel pending logout
        clearTimeout(user.logoutTimeout);
        user.logoutTimeout = undefined;
      }

      // add the socketId to the map and sets
      this.sockets.set(socket.id, socket);

      // give the user a reference to the socketId
      user.sockets.set(socket.id, socket);

      // create reference to the user by its socketId
      this.users.bySocketId.set(socket.id, user);

      // join user to their friends' event feeds
      user.friends.forEach(friend => socket.join(friend.id));

      // join user to their convos' event feeds
      user.convos.forEach(convo => {
        socket.join(convo.id);
      });

      debug('user %s socket connected', user.username, socket.id);
      debug(user.username, user.sockets.size);

      return true;

    }
  });

  Object.defineProperty(this.sockets, 'disconnect', {
    value: (socketId) => {

      debug('socketId', socketId);

      // get the user that belongs to this socket
      var user = this.users.bySocketId.get(socketId);

      // debug('user', user);

      // make sure the socket exists
      if (!this.sockets.has(socketId)) return false;

      this.sockets.delete(socketId);
      user.sockets.delete(socketId);
      this.users.bySocketId.delete(socketId);

      // if that was their last socket
      if (user.sockets.size === 0) {

        // set a timeout for 1 second to log the user off.
        // if they login within 1 second (i.e. page refresh), the timeout
        // will be cleared and they won't get logged off
        user.logoutTimeout = setTimeout(() => {
          // logout the user
          user.logoutTimeout = null;

          this.online.delete(user.id);
          this.online.byUserName.delete(user.id);

          this.emit('logout', user);
          
        }, LOGOUT_DELAY);

      }

      debug('user %s socket disconnected', user.username, socketId);

      return true;
      
    }
  });

  Object.defineProperty(this.transfers, 'init', {
    value: (convoId, transfer) => {

      // get the convo
      var convo = this.convos.get(convoId);

      if (!convo) {
        return false;
      }

      this.transfers.set(transfer.id, transfer);

      // save the transfer to the conversation's list of active transfers
      convo.transfers.set(transfer.id, transfer);

      // subscribe all current members of the conversation to this transfer's id.
      this.subscribe(convo.members, transfer.id);

      // when the transfer has finished
      transfer.on('complete', () => {

        // delete the reference to the transfer
        this.transfers.delete(transfer.id);
        
        // remove the transfer.id key from the conversation's list of transfers
        convo.transfers.delete(transfer.id);

        // unsubscribe users from the transfer now that its done
        this.unsubscribe(convo.members, transfer.id);

        debug('BinaryTransfer complete', transfer.id);

        // delete reference to the transfer
        transfer = undefined;
        
      });

      debug('BinaryTransfer initialized', transfer);

      return transfer;
    }
  });

  this.subscribe = function (userIds, feed) {
    if (!Array.isArray(userIds)) {
      userIds = [ userIds ];
    }

    userIds.forEach((userId) => {
      debug('userId', userId);

      this.users.get(userId).sockets.forEach((socket) => {
        socket.join(feed);
      });
    });
  }; // subscribe

  this.unsubscribe = function (userIds, feed) {
    if (!Array.isArray(userIds)) {
      userIds = [ userIds ];
    }

    userIds.forEach((userId) => {
      debug('userId', userId);

      this.users.get(userId).sockets.forEach((socket) => {
        socket.leave(feed);
      });
    });
  }; // unsubscribe

  this.getPermissions = function (requesterId, requestedId) {

    // debug('requesterId', typeof requesterId);
    // debug('requestedId', typeof requestedId);

    var permissions = new Set();

    var requester = this.users.get(requesterId);
    var requested = this.users.get(requestedId);

    // debug('requester', requester);
    // debug('requested', requested);

    var relationship = this.getRelationship(requesterId, requestedId);

    // debug('relationship', relationship);

    // debug('data.privacy', data.privacy);

    for (var property in requested.privacy.toObject()) {

      var value = requested.privacy[property];

      // debug('property', property);
      // debug('value', value);

      // friend requests are a bit different in that privacy settings really 
      // only apply to SENDING friend requests.  If userA is not allowed to 
      // friend request userB and userB sends a request to userA, userA certainly
      // may accept/deny the request.
      // 
      // likewise if they are friends, they can always un-friend the other
      if (property === 'friendRequest') {

        // if they are friends
        if (relationship === relationships.FRIENDS) {
          permissions.add('unfriend');

        // if they are pendingFriends
        } else if (relationship === relationships.PENDING_FRIENDS) {

          var request = this.requests.byUserId.get(requester.id).get(requested.id);

          // debug('request', request);

          // debug('request.requester', request.requester);
          // debug('requested._id', request.requester._id.equals(requested._id))

          if (request.requester.equals(requester._id)) {
            permissions.add('cancelRequest');

          } else {
            permissions.add('acceptRequest');
            permissions.add('denyRequest');
          }

        // if they're not friends
        } else if (relationship >= value) {
          permissions.add('friendRequest');
        } 

      } else {

        if (relationship >= value) {
          permissions.add(property);
        }
      }
      

    }

    debug(util.format('%s has given %s the following permissions:', 
          requested.username, requester.username), permissions);

    return permissions;
  }; // getPermissions

  this.getRelationship = function (userId1, userId2) {

    var user1 = this.users.get(userId1);
    var user2 = this.users.get(userId2);

    // debug('user1', user1);
    // debug('user2', user2);

    // debug('user1.requests', user1.requests);
    // debug('user2.requests', user2.requests);

    // are they friends?
    for (var friendsEntry of user1.friends) {
      if (user2.id === friendsEntry[0]) {
        return relationships.FRIENDS;
      }
    }

    // if they aren't friends, are they pending friends?
    for (var requestsEntry of user1.requests.sent) {
      if (user2.id === requestsEntry[0]) {
        return relationships.PENDING_FRIENDS;
      }
    }

    for (requestsEntry of user1.requests.received) {
      if (user2.id === requestsEntry[0]) {
        return relationships.PENDING_FRIENDS;
      }
    }

    // if they aren't pending friends, are they friends-of-friends?

    // check user1's friends' friends    
    for (friendsEntry of user1.friends) {
      for (var friendsOfFriendsEntry of friendsEntry[1].friends) {
        if (user2.id === friendsOfFriendsEntry[0]) {
          return relationships.FRIENDS_OF_FRIENDS;
        }
      }
    }

    // then check user2's friends' friends
    for (friendsEntry of user2.friends) {
      for (friendsOfFriendsEntry of friendsEntry[1].friends) {
        if (user1.id === friendsOfFriendsEntry[0]) {
          return relationships.FRIENDS_OF_FRIENDS;
        }
      }
    }

    // they are NOT-FRIENDS
    return relationships.NOT_FRIENDS;
  };

  // debug('this', this);

}

State.prototype = new EventEmitter();

module.exports = State;
