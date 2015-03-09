
// node core
var url = require('url');

var env = require('../env');

// 3rd party
var debug = require('debug')(env.context('server:transport:sockets'));
    utils = require('techjeffharris-utils');

module.exports = function Sockets () {

    if (!(this instanceof Sockets)) {
        return new Sockets();
    }
    
    // quick reference arrays
    var byID        = {}, 
        byConvo      = {}, 
        byUser   = {};

    function getUserID (socket) {
        return socket.request.user['_id'];
    };

    function getConvoID (socket) {
        var pathname = url.parse(socket.request.headers.referer).pathname;
        convoID = pathname.split('/')[2];

        return convoID;
    };

    Object.defineProperty(byID, 'length', {
        writable: true,
        value: 0
    });

    Object.defineProperty(byConvo, 'length', {
        writable: true,
        value: 0
    });

    Object.defineProperty(byUser, 'length', {
        writable: true,
        value: 0
    });

    function initUser (userID) {
        if (byUser[userID] === undefined) {
            debug('Initializing user', userID);

            byUser[userID] = [];
            byUser.length +=1;

            Object.defineProperty(byUser[userID], 'byConvo', {
                value: function (convoID) {
                    var inConvo = [];
                    var socket;

                    for ( var i = 0; i < this.length; i +=1) {
                        socket = this[i];

                        if (getConvoID(socket).toString() === convoID.toString()) {
                            inConvo.push(socket); 
                        }
                    }

                    return inConvo;
                }
            });
        } else {
            debug('User', userID, 'already Initialized')
        }
    };

    function initConvo (convoID) {
        if (byConvo[convoID] === undefined) {
            debug('Initializing convo', convoID);

            byConvo[convoID] = [];
            byConvo.length +=1;

            // declare byUser method to get sockets belonging to one player
            Object.defineProperty(byConvo[convoID], 'byUser', {
                value: function (userID) {
                    var belongToUser = [];
                    var socket;

                    for ( var i = 0; i < this.length; i+=1) {
                        socket = this[i];

                        if (getUserID(socket).toString() === userID.toString()) {
                            belongToUser.push(socket);
                        }
                    }

                    return belongToUser;
                }
            });
        } else {
            debug('Convo', convoID, 'already Initialized')
        }   
    };

    // public method for caching a socket
    this.add = function (socket) {

        debug('adding socket ' + socket.id);

        var userID = getUserID(socket);
        var convoID = getConvoID(socket);

        // create references to the stored socket
        byID[socket.id] = socket;
        byID.length +=1;

        if (byConvo[convoID] === undefined ) {
            initConvo(convoID);
        }

        if (byUser[userID] === undefined ) {
            initUser(userID);
        }

        byUser[userID].push(socket);
        byConvo[convoID].push(socket);

        // debug('byID.length', byID.length);
        // debug('byUser.length', byUser.length);
        // debug('byConvo.length', byConvo.length);

        debug('byID', byID);
        debug('byConvo', byConvo);
        debug('byUser', byUser);

        return byID.length;

    };

    // public method for removing a socket from cache
    this.remove = function (socketID) {

        // debug('byID', byID);
        // debug('byConvo', byConvo);
        // debug('byUser', byUser);

        debug('removing socket ' + socketID);

        var socket = byID[socketID];

        if (socket === undefined) {
            return false;
        }

        // get details for readability
        var socketID = socket.id;
        var convoID = getConvoID(socket);
        var userID = getUserID(socket);

        // delete references to the stored socket...
        delete byID[socketID];
        byID.length -= 1;

        // for this socket in the byUser array
        for (var i = 0; i < byUser[userID].length; i+=1) {

            // debug('byUser[userID]', byUser[userID]);

            // when we find it
            if (byUser[userID][i].id === socketID) {
                // delete the index and stop searching
                byUser[userID].splice(i,1);;
                break;
            }
        }

        // if this user has no more sockets in this convo, delete their list 
        if (byUser[userID].length === 0) {
            delete byUser[userID];
            byUser.length -=1;
        }

        // search for this socket in the byConvo array
        for (var i = 0; i < byConvo[convoID].length; i+=1) {
            // when we find it
            if (byConvo[convoID][i].id === socketID) {
                // remove the socket from the list and stop searching
                byConvo[convoID].splice(i,1);
                break;
            }
        }

        // if there are no more sockets connected to this convo, delete the list
        if (byConvo[convoID].length === 0) {
           delete byConvo[convoID];
           byConvo.length -=1;
        }

        // debug('byID.length', byID.length);
        // debug('byUser.length', byUser.length);
        // debug('byConvo.length', byConvo.length);

        debug('byID', byID);
        debug('byUser', byUser);
        debug('byConvo', byConvo);

        return byID.length;
    };


    // public method for returning sockets indexed by their ID
    this.byID = function (socketID) {
        return byID[socketID] || false;
    };

    // public method for returning all sockets belonging to the specified User
    this.byUser = function (userID) {
        
        return byUser[userID] || false;
    };

    // public method for returning sockets connected to the Convo with the given id
    this.byConvo = function (convoID) {
        
        return byConvo[convoID] || false;
    };

    // debug('byID', byID);
    // debug('byConvo', byConvo);
    // debug('byUser', byUser);

};
