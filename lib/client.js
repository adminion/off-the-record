'use strict'

var events = require('events'),
  privacy = require('./privacy'),
  relationships = require('../node_modules/friends-of-friends/lib/relationships'),
  url = require('url'),
  util = require('util'),
  utils = require('techjeffharris-utils');

function OffTheRecord_Client (options) {

  if (!(this instanceof OffTheRecord_Client)) return new OffTheRecord_Client(options);

  options = options || {};

  var defaults = {
    chunkSize: 512,
    pickerId: 'send-files-picker'
  };

  var config = utils.extend(defaults, options);

  var self = this;

  this.blobURLs = [];
  this.config = config;
  this.files = [];
  this.io = {};
  this.readers = [];
  this.url = url.parse(window.location.href);
  this.user;

  var socketioURL = util.format('%s//%s', this.url.protocol, this.url.host);

  console.log('socketioURL', socketioURL);

  this.io = io(socketioURL);

  //////////////////////////////////////////////////////////////////////////////
  //
  //  Define handlers for events received from server
  //
  //////////////////////////////////////////////////////////////////////////////

  // the socket has connected, but is not totally initialized, OR
  // an error has occurred while attempting to connect.
  this.io.on('connect', function ioConnecet (err) {
    if (err) {
      console.log(err);
      self.emit('error', err);
    }
  });

  // the socket has disconnected from the server
  this.io.on('disconnect', function ioDisconnect () {
    self.emit('disconnect')
  });

  // the server encountered an error handling this socket
  this.io.on('error', function connectionError (err) {
    // passport.socketio error message when authorization fails
    if (err === 'No session found') {
      window.location.href='/logon';
    } else {
      self.emit('error', err);
    }
  });

  this.io.on('shutdown', function serverShutdown () {
    self.emit('shutdown');
  });

  // the server has initialized this user and is ready for client requests
  this.io.on('ready', function ioReady (user) {

    self.user = user;
    
    console.log('user', user);
    
    console.log('ready');
    self.emit('ready');
  });

  this.io.on('requests:received',           requestsReceived);
  this.io.on('requests:received:accepted',  requestsReceivedAccepted);
  this.io.on('requests:received:canceled',  requestsReceivedCanceled);
  this.io.on('requests:received:denied',    requestsReceivedDenied);
  this.io.on('requests:sent',               requestsSent);
  this.io.on('requests:sent:accepted',      requestsSentAccepted);
  this.io.on('requests:sent:canceled',      requestsSentCanceled);
  this.io.on('requests:sent:denied',        requestsSentDenied);

  this.io.on('friends:logout',              friendsLogout);
  this.io.on('friends:logon',               friendsLogon);
  this.io.on('friends:unfriended',          friendsUnfriended);

  this.io.on('convos:started',              convosStarted);
  this.io.on('convos:ended',                convosEnded);
  this.io.on('convos:joined',               convosJoined);
  this.io.on('convos:left',                 convosLeft);
  this.io.on('convos:entered',              convosEntered);
  this.io.on('convos:exited',               convosExited);
  this.io.on('convos:message',              convosMessage);
  this.io.on('convos:binary:incoming',      convosBinaryIncoming);
  this.io.on('convos:binary:chunk',         convosBinaryChunk);

  this.io.on('users:deleted',               usersDeleted);

  function convosBinaryIncoming (convoId, username, transfer) {

    // save a copy of this file transfer
    self.user.convos[convoId].transfers[transfer.id] = transfer;

    // every so many chunks, there will be a progress update
    transfer.on('progress', function () {
      console.log('convos:binary:progress', convoId, username, transferId);
      self.io.emit('convos:binary:progress', convoId, username, transferId);
    });

    transfer.on('file-progress', function (fileId) {
      console.log('convos:binary:progress', convoId, username, transferId);
      self.io.emit('convos:binary:progress', convoId, username, transferId);
    });

    transfer.on('file-complete', function (fileId) {
      var file = transfer.files[fileId]

      if (this.user.username !== username) {
        file.data = b64toBlob(file.chunks.join(''));
      }

      console.log(util.format('transfer %s: %s complete.',transfer.id, file.name));

    });

    transfer.on('complete', function () {
      console.log('transfer ' + transfer.id + 'complete');

      // delete the transfer data
      transfer = undefined;
      delete state.transfers[transfer.id];
    });

    if (this.user.username === username) {
      console.log('server ready for transfer', transfer.id);

      console.log('this.files', this.files);

      console.log('starting binary transfer ' + transfer.id);

      sendChunk(transfer.id);
      
    } else {
      console.log(util.format('convo %s: incoming transfer %s from %', convoId, transfer.id, username));
    }
  }

  function convosBinaryChunk (convoId, username, transferId, fileId, chunkId, chunk) {

    // console.log('%s, %s, %s', transferId, fileId, chunkId);

    var transfer = self.transfers[transferId];

    // console.log('transfer', transfer);
    
    if (this.user.username !== username) {
      transfer.files[fileId].chunks[chunkId] = chunk;
    }

    transfer.chunk(fileId, chunk);

    if (this.user.username === username) {
      sendChunk(transferId);
    }

  };

  function convosEnded (convoId) {
    self.emit('convos:ended', convoId);
  };

  function convosEntered (convoId, username) {

  };

  function convosExited (convoId, username) {

  };

  function convosJoined (convo) {

  };

  function convosLeft (convo) {

  };

  function convosMessage (convoId, username, text) {

    self.emit('convos:message', convoId, username, text);
    
  };

  function convosStarted (convo) {
    console.log('convos:started', convo);
    self.user.convos[convoId] = convo;
    self.emit('convos:started', convo);
  };

  function friendsLogout (username) {
    console.log('friends:logout', username);
    self.emit('friends:logout', username);
  };

  function friendsLogon (username) {
    console.log('friends:logon', username);
    self.emit('friends:logon', username);
  };

  function friendsUnfriended (unfriendedEvent) {
    console.log('friends:unfriended', unfriendedEvent);

    var initiatedByClientUser = (self.user.username === unfriendedEvent.unfriender);

    console.log('initiatedByClientUser', initiatedByClientUser);

    var username = (initiatedByClientUser) ? unfriendedEvent.unfriended : unfriendedEvent.unfriender;

    console.log('username', username);

    // remove the friend's username from the user's friends
    index = self.user.friends.indexOf(username);
    self.user.friends.splice(index, 1);

    delete self.user.permissions[username];

    self.emit('friends:unfriended', unfriendedEvent);
  };

  function requestsReceivedAccepted (acceptEvent) {
    console.log('requests:received:accepted', acceptEvent);

    // determine the username of the friend
    var friendUsername = acceptEvent.from

    // remove the friend's username from the user's requests
    index = self.user.requests.received.indexOf(friendUsername);
    self.user.requests.received.splice(index, 1);

    // add the new friend to the user's friends
    self.user.friends.push(friendUsername);
    self.user.permissions[friendUsername] = acceptEvent.permissions;

    console.log('this.user', self.user);

    self.emit('requests:received:accepted', friendUsername);
  };

  function requestsSentAccepted (acceptEvent) {
    console.log('requests:sent:accepted', acceptEvent);

    // determine the username of the friend
    var friendUsername = acceptEvent.to;

    // remove the friend's username from the user's requests
    index = self.user.requests.sent.indexOf(friendUsername);
    self.user.requests.sent.splice(index, 1);

    // add the new friend to the user's friends
    self.user.friends.push(friendUsername);
    self.user.permissions[friendUsername] = acceptEvent.permissions;

    console.log('this.user', self.user);

    self.emit('requests:sent:accepted', friendUsername);
  };

  function requestsReceivedCanceled (from) {
    console.log('requests:received:canceled', from);

    // remove the friend's username from the user's requests
    index = self.user.requests.received.indexOf(from);
    self.user.requests.received.splice(index, 1);

    delete self.user.permissions[from];

    console.log('this.user', self.user);

    self.emit('requests:received:canceled', from);
  };

  function requestsSentCanceled (to) {
    console.log('requests:sent:canceled', to);

    // remove the friend's username from the user's requests
    index = self.user.requests.sent.indexOf(to);
    self.user.requests.sent.splice(index, 1);

    delete self.user.permissions[to];

    console.log('this.user', self.user);

    self.emit('requests:sent:canceled', to);
  };

  function requestsReceivedDenied (from) {
    console.log('requests:received:denied', from);

    // remove the friend's username from the user's requests
    index = self.user.requests.received.indexOf(from);
    self.user.requests.received.splice(index, 1);

    delete self.user.permissions[from];

    console.log('this.user', self.user);

    self.emit('requests:received:denied', from);
  };

  function requestsSentDenied (to) {
    console.log('requests:sent:denied', to);

    // remove the friend's username from the user's requests
    index = self.user.requests.sent.indexOf(to);
    self.user.requests.sent.splice(index, 1);

    delete self.user.permissions[to];

    console.log('this.user', self.user);

    self.emit('requests:sent:denied', to);
  };

  function requestsReceived (receivedEvent) {
    console.log('requests:received', receivedEvent);

    var username = receivedEvent.from;

    self.user.requests.received.push(username);
    self.user.permissions[username] = receivedEvent.permissions;

    console.log('this.user', self.user);

    self.emit('requests:received', username);
  };

  function requestsSent (sentEvent) {
    console.log('requests:sent', sentEvent);

    var username = sentEvent.to;

    self.user.requests.sent.push(username);
    self.user.permissions[username] = sentEvent.permissions;

    console.log('this.user', self.user);

    self.emit('requests:sent', username);
  };

  function sendChunk (transferId) {

    var transfer = self.transfers[transferId];
    var fileId  = transfer.fileId;
    var chunkId = transfer.chunkId;
    var chunk   = transfer.files[fileId].data.slice(transfer.offset, transfer.offset + self.config.chunkSize);

    self.io.emit('transfer-data', convoId, transferId, fileId, chunkId, chunk);
  }

  function b64toBlob(b64Data, contentType) {

    contentType = contentType || '';
    
    var blob;
    var byteCharacters = atob(b64Data);
    var byteArrays = [];
    var progress = 0;
    var totalChars = byteCharacters.length;

    for (var offset = 0; offset < byteCharacters.length; offset += self.config.chunkSize) {

      var percentage = Math.floor(offset / totalChars * 100)

      if (percentage > progress) {
        progress = percentage;

        if (progress % 10 === 0) {
          console.log('creating blob: ' + progress + '% complete...');
        }
      }

      var chunk = byteCharacters.slice(offset, offset + self.config.chunkSize);

      var byteNumbers = new Array(chunk.length);
      for (var i = 0; i < chunk.length; i++) {
        byteNumbers[i] = chunk.charCodeAt(i);
      }

      var byteArray = new Uint8Array(byteNumbers);

      byteArrays.push(byteArray);
    }

    console.log('creating blob: 100% complete...');


    try {
       blob = new Blob( byteArrays, {type : contentType});
    }
    catch(e){
      // TypeError old chrome and FF
      window.BlobBuilder = window.BlobBuilder || 
                 window.WebKitBlobBuilder || 
                 window.MozBlobBuilder || 
                 window.MSBlobBuilder;

      if (e.name == 'TypeError' && window.BlobBuilder){
        var bb = new BlobBuilder();
        bb.append(byteArrays);
        blob = bb.getBlob(contentType);
      }

      else if (e.name == "InvalidStateError") {
        // InvalidStateError (tested on FF13 WinXP)
        blob = new Blob(byteArrays, {type : contentType});
      }

      else {
        alert("We're screwed, blob constructor unsupported entirely");

      }
    }

    return blob;
  };

  function usersDeleted (error, success) {

    if (error) {
      console.error(err);
    }

    console.log('users:deleted', error, success);
    self.emit('usersDeleted', success);
  };

};

OffTheRecord_Client.prototype = new events.EventEmitter();

OffTheRecord_Client.prototype.privacy = privacy;
OffTheRecord_Client.prototype.relationships = relationships;

OffTheRecord_Client.prototype.search = function (findParams, done) {

  console.log('searching...');

  console.log('findParams', findParams);
  
  this.io.emit('users:search', findParams, done);

};

OffTheRecord_Client.prototype.pageId = function () {
  return window.location.pathname.split('/')[2]
};

OffTheRecord_Client.prototype.sendFiles = function (convoId) {
  var count = 0,
    file,
    picker = document.getElementById(this.config.pickerId),    
    reader,
    fileList = [],
    total = picker.files.length;

  this.files = [];

  var files = [];

  for (var i = 0; i< picker.files.length; i++) {
    files[i] = picker.files[i];
  }

  console.log('files', files);

  files.forEach(function (file, i) {

    readers[i] = new FileReader();
    reader = readers[i];

    // TODO: setup events for each FileReader
    // specificly: 
    //  * onprogress
    // https://developer.mozilla.org/en-US/docs/Web/API/FileReader#Event_handlers

    reader.onprogress = function (progressEvent) {

      var percentage = Math.floor(progressEvent.loaded / progressEvent.total * 100);

      console.log('reading %s %s\%...', file.name, percentage);
    };

    reader.onload = function (progressEvent) {

      var data = progressEvent.target.result;

      console.log('data.length', data.length);

      this.files.push({
        // content-type and encoding are before but binary data itself is found after the comma
        data: data,
        lastModifiedDate: new Date(file.lastModifiedDate),
        name: file.name,
        size: file.size,
        type: file.type
      });

      fileList.push({
        encodedLength: data.length,
        lastModifiedDate: new Date(file.lastModifiedDate),
        name: file.name,
        size: file.size,
        type: file.type
      });

      console.log('file encoded!');

      if (++count === total) {
        console.log('all files encoded!');

        self.io.emit('convos:binary:init', convoId, fileList);
      };
    };

    reader.readAsDataURL(file);
  });
};

OffTheRecord_Client.prototype.friends = function (done) {
  this.io.emit('friends', done);
};

OffTheRecord_Client.prototype.friendRequest = function (username, done) {
  this.io.emit('requests:send', username, done);
};

OffTheRecord_Client.prototype.acceptRequest = function (username, done) {
  this.io.emit('requests:accept', username, done);
};

OffTheRecord_Client.prototype.cancelRequest = function (username, done) {
  this.io.emit('requests:cancel', username, done);
};

OffTheRecord_Client.prototype.denyRequest = function (username, done) {
  this.io.emit('requests:deny', username, done);
};

OffTheRecord_Client.prototype.unfriend = function (username, done) {
  this.io.emit('friends:unfriend', username, done);
};

OffTheRecord_Client.prototype.getInteractions = function (username, done) {
  this.io.emit('friends:interactions', username, done);
}

OffTheRecord_Client.prototype.sendMessage = function (convoId, message) {

  this.io.emit('convos:message', convoId, message);

};

OffTheRecord_Client.prototype.startConversation = function (invitees, done) {

  this.io.emit('convos:start', invitees, function (err, conversation) {
    console.log('err', err);
    if (err) return done(err);

    done(null, conversation);
  });

};

OffTheRecord_Client.prototype.inspectConversation = function (convoId) {

};

OffTheRecord_Client.prototype.endConversation = function (convoId) {

};

OffTheRecord_Client.prototype.leaveConversation = function (convoId) {

};

OffTheRecord_Client.prototype.updatePrivacy = function (updates, done) {

  console.log('updates', updates);

  this.io.emit('privacy:update', updates, done);

};

OffTheRecord_Client.prototype.updateProfile = function (updates, done) {

  console.log('updates', updates);

  this.io.emit('profile:update', updates, done);

};

OffTheRecord_Client.prototype.viewProfile = function (username, done) {
  console.log('attempting to view ' + username + '\'s profile...');

  this.io.emit('profile:view', username, done);
};

OffTheRecord_Client.prototype.deleteAccount = function (done) {
  console.log('deleting ' + this.user.username + '\'s account...');

  this.io.emit('users:delete', done);
}

global.OffTheRecord_Client = OffTheRecord_Client;
