
// node core
var url = require('url');

var env = require('../env');

// 3rd party
var debug = require('debug')(env.context('transport:sockets'));
    utils = require('techjeffharris-utils');

module.exports = function Sockets () {

    if (!(this instanceof Sockets)) {
        return new Sockets();
    }
    
    // quick reference arrays
    var byID        = {}, 
        byConvo      = {}, 
        byAccount   = {};

    function getAccountID (socket) {
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

    Object.defineProperty(byAccount, 'length', {
        writable: true,
        value: 0
    });

    function initAccount (accountID) {
        if (byAccount[accountID] === undefined) {
            debug('Initializing account', accountID);

            byAccount[accountID] = [];
            byAccount.length +=1;

            Object.defineProperty(byAccount[accountID], 'byConvo', {
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
            debug('Account', accountID, 'already Initialized')
        }
    };

    function initConvo (convoID) {
        if (byConvo[convoID] === undefined) {
            debug('Initializing convo', convoID);

            byConvo[convoID] = [];
            byConvo.length +=1;

            // declare byAccount method to get sockets belonging to one player
            Object.defineProperty(byConvo[convoID], 'byAccount', {
                value: function (accountID) {
                    var belongToAccount = [];
                    var socket;

                    for ( var i = 0; i < this.length; i+=1) {
                        socket = this[i];

                        if (getAccountID(socket).toString() === accountID.toString()) {
                            belongToAccount.push(socket);
                        }
                    }

                    return belongToAccount;
                }
            });
        } else {
            debug('Convo', convoID, 'already Initialized')
        }   
    };

    // public method for caching a socket
    this.add = function (socket) {

        debug('adding socket ' + socket.id);

        var accountID = getAccountID(socket);
        var convoID = getConvoID(socket);

        // create references to the stored socket
        byID[socket.id] = socket;
        byID.length +=1;

        if (byConvo[convoID] === undefined ) {
            initConvo(convoID);
        }

        if (byAccount[accountID] === undefined ) {
            initAccount(accountID);
        }

        byAccount[accountID].push(socket);
        byConvo[convoID].push(socket);

        // debug('byID.length', byID.length);
        // debug('byAccount.length', byAccount.length);
        // debug('byConvo.length', byConvo.length);

        debug('byID', byID);
        debug('byConvo', byConvo);
        debug('byAccount', byAccount);

        return byID.length;

    };

    // public method for removing a socket from cache
    this.remove = function (socketID) {

        // debug('byID', byID);
        // debug('byConvo', byConvo);
        // debug('byAccount', byAccount);

        debug('removing socket ' + socketID);

        var socket = byID[socketID];

        if (socket === undefined) {
            return false;
        }

        // get details for readability
        var socketID = socket.id;
        var convoID = getConvoID(socket);
        var accountID = getAccountID(socket);

        // delete references to the stored socket...
        delete byID[socketID];
        byID.length -= 1;

        // for this socket in the byAccount array
        for (var i = 0; i < byAccount[accountID].length; i+=1) {

            // debug('byAccount[accountID]', byAccount[accountID]);

            // when we find it
            if (byAccount[accountID][i].id === socketID) {
                // delete the index and stop searching
                byAccount[accountID].splice(i,1);;
                break;
            }
        }

        // if this user has no more sockets in this convo, delete their list 
        if (byAccount[accountID].length === 0) {
            delete byAccount[accountID];
            byAccount.length -=1;
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
        // debug('byAccount.length', byAccount.length);
        // debug('byConvo.length', byConvo.length);

        debug('byID', byID);
        debug('byAccount', byAccount);
        debug('byConvo', byConvo);

        return byID.length;
    };


    // public method for returning sockets indexed by their ID
    this.byID = function (socketID) {
        return byID[socketID] || false;
    };

    // public method for returning all sockets belonging to the specified Account
    this.byAccount = function (accountID) {
        
        return byAccount[accountID] || false;
    };

    // public method for returning sockets connected to the Convo with the given id
    this.byConvo = function (convoID) {
        
        return byConvo[convoID] || false;
    };

    // debug('byID', byID);
    // debug('byConvo', byConvo);
    // debug('byAccount', byAccount);

};
