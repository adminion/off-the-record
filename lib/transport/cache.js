
function Cache () {
  this.convos = {};
  this.users = {};
};

Cache.prototype.addUser = function addUser (userId) {
  // create an entry in users cache to hold the user and the ids of the 
  // conversations they have started or joined
  this.users[userId] = {
    // the user document
    user: user,
    // a hash of the user's friends keyed by their id
    friends: {},
    // a list of ids of the user's connected sockets
    sockets: [],
    // a list of the ids of conversations related to the user
    convos: {
      // ids of conversations the user has started
      started: [],
      // ids of conversations the user has joined
      joined: []
    }
  };
};

Cache.prototype.removeUser = function removeUser (userId) {
  delete this.users[userId];
};

Cache.prototype.addFriend = function addFriend (userId, friend) {
  this.users[userId].friends[friend._id] = friend;
};

Cache.prototype.removeFriend = function removeFriend (userId, friend) {
  delete this.users[userId].friends
};

module.exports = new Cache();
