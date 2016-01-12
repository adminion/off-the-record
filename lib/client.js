"use strict";

/* eslint-env browser */
/* globals io */

let events = require('events'),
  privacy = require('./privacy'),
  relationships = require('../node_modules/friends-of-friends/lib/relationships'),
  url = require('url'),
  util = require('util'),
  utils = require('techjeffharris-utils'),
  Debug = require('debug'),
  BinaryTransfer = require('./BinaryTransfer'),
  TextMessage = require('./TextMessage');


function OffTheRecord_Client (options) {

  if (!(this instanceof OffTheRecord_Client)) return new OffTheRecord_Client(options);

  options = options || {};

  let defaults = {
    chunkSize: 512,
    pickerId: 'send-files-picker'
  };

  let config = utils.extend(defaults, options);

  let self = this;

  self.blobURLs = [];
  self.config = config;
  self.files = [];
  self.io = {};
  self.log = Debug('off-the-record:client');
  self.readers = [];
  self.url = url.parse(window.location.href);
  self.user;
  self.BinaryTransfer = BinaryTransfer;
  self.TextMessage = TextMessage;

  let socketioURL = util.format('%s//%s', self.url.protocol, self.url.host);

  self.log('socketioURL', socketioURL);

  self.io = io(socketioURL);

  //////////////////////////////////////////////////////////////////////////////
  //
  //  Define handlers for events received from server
  //
  //////////////////////////////////////////////////////////////////////////////

  // the socket has connected, but is not totally initialized, OR
  // an error has occurred while attempting to connect.
  self.io.on('connect', function ioConnecet (err) {
    if (err) {
      self.log(err);
      self.emit('error', err);
    }
  });

  // the socket has disconnected from the server
  self.io.on('disconnect', function ioDisconnect () {
    self.emit('disconnect')
  });

  // the server encountered an error handling this socket
  self.io.on('error', function connectionError (err) {
    // passport.socketio error message when authorization fails
    if (err === 'No session found') {
      window.location.href='/login';
    } else {
      self.emit('error', err);
    }
  });

  self.io.on('shutdown', function serverShutdown () {
    self.emit('shutdown');
  });

  // the server has initialized this user and is ready for client requests
  self.io.on('ready', function ioReady (user) {
    
    self.log('user', user);

    user.convos = new Map(user.convos);
    user.friends = new Set(user.friends);
    user.onlineFriends = new Set(user.onlineFriends);
    user.requests.received = new Set(user.requests.received);
    user.requests.sent = new Set(user.requests.sent);

    self.log('user', user);

    let permissions = new Map();

    user.permissions.forEach(entry => {

      self.log('entry', entry);

      let [username, perms] = entry
      permissions.set(username, new Set(perms));
    });
    
    user.permissions = permissions;

    self.log('user', user);
    
    self.user = user;
    self.log('self.user', self.user);
    
    self.log('ready');
    self.emit('ready');
  });

  self.io.on('requests:received',           requestsReceived);
  self.io.on('requests:received:accepted',  requestsReceivedAccepted);
  self.io.on('requests:received:canceled',  requestsReceivedCanceled);
  self.io.on('requests:received:denied',    requestsReceivedDenied);
  self.io.on('requests:sent',               requestsSent);
  self.io.on('requests:sent:accepted',      requestsSentAccepted);
  self.io.on('requests:sent:canceled',      requestsSentCanceled);
  self.io.on('requests:sent:denied',        requestsSentDenied);

  self.io.on('friends:logout',              friendsLogout);
  self.io.on('friends:login',               friendsLogin);
  self.io.on('friends:unfriended',          friendsUnfriended);

  self.io.on('convos:started',              convosStarted);
  self.io.on('convos:ended',                convosEnded);
  self.io.on('convos:joined',               convosJoined);
  self.io.on('convos:left',                 convosLeft);
  self.io.on('convos:entered',              convosEntered);
  self.io.on('convos:exited',               convosExited);
  self.io.on('convos:text',                 convosText);
  self.io.on('convos:binary:incoming',      convosBinaryIncoming);
  self.io.on('convos:binary:chunk',         convosBinaryChunk);

  self.io.on('users:deleted',               usersDeleted);

  function convosBinaryIncoming (convoId, username, transfer) {

    // save a copy of this file transfer
    self.user.convos.get(convoId).transfers.set(transfer.id, transfer);

    // every so many chunks, there will be a progress update
    transfer.on('progress', function () {
      self.log('convos:binary:progress', convoId, username, transfer.id);
      self.io.emit('convos:binary:progress', convoId, username, transfer.id);
    });

    transfer.on('file-progress', function (fileId) {
      self.log('convos:binary:progress', convoId, username, transfer.id, fileId);
      self.io.emit('convos:binary:progress', convoId, username, transfer.id, fileId);
    });

    transfer.on('file-complete', function (fileId) {
      let file = transfer.files[fileId]

      if (this.user.username !== username) {
        file.data = b64toBlob(file.chunks.join(''));
      }

      self.log(util.format('transfer %s: %s complete.',transfer.id, file.name));

    });

    transfer.on('complete', function () {
      self.log('transfer ' + transfer.id + 'complete');

      // delete the transfer data
      transfer = undefined;
      self.user.convos.get(convoId).transfers.delete(transfer.id);
    });

    if (self.user.username === username) {
      self.log('server ready for transfer', transfer.id);

      self.log('self.files', self.files);

      self.log('starting binary transfer ' + transfer.id);

      sendChunk(convoId, transfer.id);
      
    } else {
      self.log(util.format('convo %s: incoming transfer %s from %', convoId, transfer.id, username));
    }
  }

  function convosBinaryChunk (convoId, username, transferId, fileId, chunkId, chunk) {

    // self.log('%s, %s, %s', transferId, fileId, chunkId);

    let transfer = self.transfers[transferId];

    // self.log('transfer', transfer);
    
    if (self.user.username !== username) {
      transfer.files[fileId].chunks[chunkId] = chunk;
    }

    transfer.chunk(fileId, chunk);

    if (self.user.username === username) {
      sendChunk(convoId, transferId);
    }

  }

  function convosEnded (convoId) {
    self.emit('convos:ended', convoId);
  }


  function convosEntered (convoId, username) {

    username;
    /* @todo */

  }

  function convosExited (convoId, username) {
    username
    /* @todo */
  }

  function convosJoined (convo) {
    convo;
    /* @todo */

  }

  function convosLeft (convo) {
    convo;
    /* @todo */
  }

  function convosText (message) {
    self.log('convos:text', message)
    self.emit('convos:text', message);
    
  }

  function convosStarted (convo) {
    self.log('convos:started', convo);
    self.user.convos[convo.id] = convo;
    self.emit('convos:started', convo);
  }

  function friendsLogout (username) {
    self.log('friends:logout', username);

    self.user.onlineFriends.delete(username);

    self.emit('friends:logout', username);
  }

  function friendsLogin (username) {
    self.log('friends:login', username);

    self.user.onlineFriends.add(username);

    self.emit('friends:login', username);
  }

  function friendsUnfriended (unfriendedEvent) {
    self.log('friends:unfriended', unfriendedEvent);

    let initiatedByClientUser = (self.user.username === unfriendedEvent.unfriender);

    self.log('initiatedByClientUser', initiatedByClientUser);

    let username = (initiatedByClientUser) ? unfriendedEvent.unfriended : unfriendedEvent.unfriender;

    self.log('username', username);

    // remove the friend's username from the user's friends
    self.user.friends.delete(username);
    self.user.onlineFriends.delete(username);

    self.user.permissions.delete(username);

    self.emit('friends:unfriended', unfriendedEvent);
  }

  function requestsReceivedAccepted (acceptEvent) {
    self.log('requests:received:accepted', acceptEvent);
    self.log('self.user.requests.received', self.user.requests.received);

    // determine the username of the friend
    let friendUsername = acceptEvent.from

    self.log()

    self.log(self.user);

    // remove the friend's username from the user's requests
    self.user.requests.received.delete(friendUsername);

    // add the new friend to the user's friends
    self.user.friends.add(friendUsername);
    self.user.permissions.set(friendUsername, acceptEvent.permissions);

    self.log('self.user', self.user);

    self.emit('requests:received:accepted', friendUsername);
  }

  function requestsSentAccepted (acceptEvent) {
    self.log('requests:sent:accepted', acceptEvent);

    self.log('self.user', self.user);

    // determine the username of the friend
    let friendUsername = acceptEvent.to;

    self.log('friendUsername', friendUsername);

    // remove the friend's username from the user's requests
    self.user.requests.sent.delete(friendUsername);

    // add the new friend to the user's friends
    self.user.friends.add(friendUsername);
    self.user.permissions.set(friendUsername, acceptEvent.permissions);

    self.log('self.user', self.user);

    self.emit('requests:sent:accepted', friendUsername);
  }

  function requestsReceivedCanceled (from) {
    self.log('requests:received:canceled', from);

    // remove the friend's username from the user's requests
    self.user.requests.received.delete(from);

    self.user.permissions.delete(from);

    self.log('self.user', self.user);

    self.emit('requests:received:canceled', from);
  }

  function requestsSentCanceled (to) {
    self.log('requests:sent:canceled', to);

    // remove the friend's username from the user's requests
    self.user.requests.sent.delete(to);

    self.user.permissions.delete(to);

    self.log('self.user', self.user);

    self.emit('requests:sent:canceled', to);
  }

  function requestsReceivedDenied (from) {
    self.log('requests:received:denied', from);

    // remove the friend's username from the user's requests
    self.user.requests.received.delete(from);

    self.user.permissions.delete(from);

    self.log('self.user', self.user);

    self.emit('requests:received:denied', from);
  }

  function requestsSentDenied (to) {
    self.log('requests:sent:denied', to);

    // remove the friend's username from the user's requests
    self.user.requests.sent.delete(to);

    self.user.permissions.delete(to);

    self.log('self.user', self.user);

    self.emit('requests:sent:denied', to);
  }

  function requestsReceived (receivedEvent) {
    self.log('requests:received', receivedEvent);

    let username = receivedEvent.from;

    self.user.requests.received.add(username);
    self.user.permissions.set(username, receivedEvent.permissions);

    self.log('self.user', self.user);

    self.emit('requests:received', username);
  }

  function requestsSent (sentEvent) {
    self.log('requests:sent', sentEvent);

    let username = sentEvent.to;

    self.user.requests.sent.add(username);
    self.user.permissions.set(username, sentEvent.permissions);

    self.log('self.user', self.user);

    self.emit('requests:sent', username);
  }

  function sendChunk (convoId, transferId) {

    let transfer = self.transfers[transferId];
    let fileId  = transfer.fileId;
    let chunkId = transfer.chunkId;
    let chunk   = transfer.files[fileId].data.slice(transfer.offset, transfer.offset + self.config.chunkSize);

    self.io.emit('transfer-data', convoId, transferId, fileId, chunkId, chunk);
  }

  function b64toBlob(b64Data, contentType) {

    contentType = contentType || '';
    
    let blob;
    let byteCharacters = atob(b64Data);
    let byteArrays = [];
    let progress = 0;
    let totalChars = byteCharacters.length;

    for (let offset = 0; offset < byteCharacters.length; offset += self.config.chunkSize) {

      let percentage = Math.floor(offset / totalChars * 100)

      if (percentage > progress) {
        progress = percentage;

        if (progress % 10 === 0) {
          self.log('creating blob: ' + progress + '% complete...');
        }
      }

      let chunk = byteCharacters.slice(offset, offset + self.config.chunkSize);

      let byteNumbers = new Array(chunk.length);
      for (let i = 0; i < chunk.length; i++) {
        byteNumbers[i] = chunk.charCodeAt(i);
      }

      let byteArray = new Uint8Array(byteNumbers);

      byteArrays.push(byteArray);
    }

    self.log('creating blob: 100% complete...');


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
        let bb = new window.BlobBuilder();
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
  }

  function usersDeleted (err, success) {

    if (err) {
      console.error(err);
    }

    self.log('users:deleted', err, success);
    self.emit('usersDeleted', success);
  }

}

OffTheRecord_Client.prototype = new events.EventEmitter();

OffTheRecord_Client.prototype.privacy = privacy;
OffTheRecord_Client.prototype.relationships = relationships;

OffTheRecord_Client.prototype.search = function (findParams, done) {

  this.log('searching...');

  this.log('findParams', findParams);
  
  this.io.emit('users:search', findParams, done);

};

OffTheRecord_Client.prototype.pageId = function () {
  return window.location.pathname.split('/')[2]
};

OffTheRecord_Client.prototype.sendFiles = function (convoId) {
  let count = 0,
    picker = document.getElementById(this.config.pickerId),
    reader,
    fileList = [],
    total = picker.files.length;

  let self = this;

  self.files = [];

  let files = [];

  for (let i = 0; i< picker.files.length; i++) {
    files[i] = picker.files[i];
  }

  self.log('files', files);

  files.forEach(function (file) {

    reader = new FileReader();

    // TODO: setup events for each FileReader
    // specificly: 
    //  * onprogress
    // https://developer.mozilla.org/en-US/docs/Web/API/FileReader#Event_handlers

    reader.onprogress = function (progressEvent) {

      let percentage = Math.floor(progressEvent.loaded / progressEvent.total * 100);

      self.log('reading %s %s\%...', file.name, percentage);
    };

    reader.onload = function (progressEvent) {

      let data = progressEvent.target.result;

      self.log('data.length', data.length);

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

      self.log('file encoded!');

      if (++count === total) {
        self.log('all files encoded!');

        self.io.emit('convos:binary:init', convoId, fileList);
      }
    };

    reader.readAsDataURL(file);
  });
};

OffTheRecord_Client.prototype.friends = function (done) {
  this.io.emit('friends', done);
};

OffTheRecord_Client.prototype.friendRequest = function (username, done) {
  this.log('requests:send', username);
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

OffTheRecord_Client.prototype.sendMessage = function (convoId, message, done) {

  this.io.emit('convos:text', convoId, message, done);

};

OffTheRecord_Client.prototype.startConversation = function (invitees, done) {

  let self = this;

  this.io.emit('convos:start', invitees, function (err, conversation) {
    self.log('err', err);
    if (err) return done(err);

    done(null, conversation);
  });

};

OffTheRecord_Client.prototype.inspectConversation = function (convoId) {
  convoId;
  /* @todo */
};

OffTheRecord_Client.prototype.endConversation = function (convoId) {
  convoId
  /* @todo */
};

OffTheRecord_Client.prototype.leaveConversation = function (convoId) {
  convoId
  /* @todo */
};

OffTheRecord_Client.prototype.updatePrivacy = function (updates, done) {

  this.log('updates', updates);

  this.io.emit('privacy:update', updates, done);

};

OffTheRecord_Client.prototype.updateProfile = function (updates, done) {

  this.log('updates', updates);

  this.io.emit('profile:update', updates, done);

};

OffTheRecord_Client.prototype.viewProfile = function (username, done) {
  this.log('attempting to view ' + username + '\'s profile...');

  this.io.emit('profile:view', username, done);
};

OffTheRecord_Client.prototype.deleteAccount = function (done) {
  this.log('deleting ' + this.user.username + '\'s account...');

  this.io.emit('users:delete', done);
}

module.exports = OffTheRecord_Client;
