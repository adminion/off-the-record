
global.Debug = require('debug');

var events = require('events'),
  debug = Debug('off-the-record:client'),
  privacy = require('../data/privacy'),
  relationships = require('../../node_modules/friends-of-friends/lib/relationships'),
  url = require('url'),
  util = require('util'),
  utils = require('techjeffharris-utils');

var DEBUG_SCOPE = 'off-the-record:client*'

function OffTheRecord_Client (options) {

  if (!(this instanceof OffTheRecord_Client)) return new OffTheRecord_Client(options);

  options = options || {};

  var defaults = {
    debug: false,
    chunkSize: 512,
    pickerId: 'send-files-picker'
  };

  var config = utils.extend(defaults, options);

  // get the enabled debug scopes
  var enabledDebugScopes = localStorage.getItem('debug').split(', ');

  var indexOfDebugScope = enabledDebugScopes.indexOf(DEBUG_SCOPE);

  // if debug is enabled
  if (config.debug) {
    if (indexOfDebugScope === -1) {
      enabledDebugScopes.push(DEBUG_SCOPE);
    }
  } else {
    if (~indexOfDebugScope) {
      enabledDebugScopes.splice(indexOfDebugScope, 1);
    }
  }
    
  localStorage.setItem('debug', enabledDebugScopes.join(', '));

  var self = this;

  this.config = config;
  this.io = {};
  this.blobURLs = [];
  this.readers = [];
  this.files = [];
  this.url = url.parse(window.location.href);
  this.user;
  this.convos = {};

  var socketioURL = util.format('%s//%s', this.url.protocol, this.url.host);

  debug('socketioURL', socketioURL);

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
      debug(err);
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
      location.reload();
    }
  });

  // the server has initialized this user and is ready for client requests
  this.io.on('ready', function (user) {

    self.user = user;

    debug('this.user', self.user);
    
    debug('ready!');
    self.emit('ready');
  });

  this.io.on('requests:sent', function (request) {
    debug('requests:sent', request);
    self.emit('requests:sent', request);
  });

  this.io.on('requests:received', function (request) {
    debug('requests:received', request);
    self.emit('requests:received', request);
  });

  this.io.on('requests:accepted', function (friendship) {
    debug('requests:accepted', friendship);
    self.emit('requests:accepted', friendship);
  });

  this.io.on('requests:denied', function (request) {
    debug('requests:denied', request);
    self.emit('requests:denied', request);
  });

  this.io.on('requests:canceled', function (request) {
    debug('requests:canceled', request);
    self.emit('requests:canceled', request);
  });

  this.io.on('friends:unfriended', function (previousFriend) {
    debug('friends:unfriended', previousFriend);
    self.emit('friends:unfriended', previousFriend);
  });

  this.io.on('friends:logon', function (username) {
    debug('friends:logon', username);
    self.emit('friends:logon', username);
  });

  this.io.on('friends:logoff', function (username) {
    debug('friends:logoff', username);
    self.emit('friends:logoff', username);
  });

  this.io.on('convos:started', function (convo) {
    self.user.convos[convoId] = convo;
    self.emit('convos:started', convo);
  });

  this.io.on('convos:ended', function (convoId) {
    self.emit('convos:ended', convoId);
  });

  this.io.on('convos:joined', function (convo) {});

  this.io.on('convos:left', function (convo) {});

  this.io.on('convos:entered', function (convoId, username) {});

  this.io.on('convos:exited', function (convoId, username) {});

  this.io.on('convos:message', function message (convoId, username, text) {

    self.emit('convos:message', convoId, username, text);
    
  });

  this.io.on('convos:binary:incoming', binaryIncoming);
  this.io.on('convos:binary:chunk', receiveChunk);

  function binaryIncoming (convoId, username, transfer) {

    // save a copy of this file transfer
    self.user.convos[convoId].transfers[transfer.id] = transfer;

    // every so many chunks, there will be a progress update
    transfer.on('progress', function () {
      debug('')
      self.io.emit('convos:binary:progress', convoId, username, transferId);
    });

    transfer.on('file-progress', function (fileId) {
      self.io.emit('convos:binary:progress', convoId, username, transferId);
    });

    transfer.on('file-complete', function (fileId) {
      var file = transfer.files[fileId]


      if (this.user.username !== username) {

      }

      file.data = b64toBlob(file.chunks.join(''));

      debug(util.format('transfer %s: %s complete.',transfer.id, file.name));

    });

    transfer.on('complete', function () {
      debug('transfer ' + transfer.id + 'complete');

      // delete the transfer data
      transfer = undefined;
      delete state.transfers[transfer.id];
    });

    if (this.user.username === username) {
      debug('server ready for transfer', transfer.id);

      debug('this.files', this.files);

      debug('starting binary transfer ' + transfer.id);

      sendChunk(transfer.id);
      
    } else {
      debug(util.format('convo %s: incoming transfer %s from %', convoId, transfer.id, username));
    }
  }

  function receiveChunk (convoId, username, transferId, fileId, chunkId, chunk) {

    // debug('%s, %s, %s', transferId, fileId, chunkId);

    var transfer = self.transfers[transferId];

    // debug('transfer', transfer);
    
    if (this.user.username !== username) {
      transfer.files[fileId].chunks[chunkId] = chunk;
    }

    transfer.chunk(fileId, chunk);

    if (this.user.username === username) {
      sendChunk(transferId);
    }

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
          debug('creating blob: ' + progress + '% complete...');
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

    debug('creating blob: 100% complete...');


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
};

OffTheRecord_Client.prototype = new events.EventEmitter();

OffTheRecord_Client.prototype.privacy = privacy;
OffTheRecord_Client.prototype.relationships = relationships;

OffTheRecord_Client.prototype.search = function (findParams, done) {

  debug('searching...');

  debug('findParams', findParams);
  debug('done', done);

  this.io.emit('search:users', findParams, done);

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

  debug('files', files);

  files.forEach(function (file, i) {

    readers[i] = new FileReader();
    reader = readers[i];

    // TODO: setup events for each FileReader
    // specificly: 
    //  * onprogress
    // https://developer.mozilla.org/en-US/docs/Web/API/FileReader#Event_handlers

    reader.onprogress = function (progressEvent) {

      var percentage = Math.floor(progressEvent.loaded / progressEvent.total * 100);

      debug('reading %s %s\%...', file.name, percentage);
    };

    reader.onload = function (progressEvent) {

      var data = progressEvent.target.result;

      debug('data.length', data.length);

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

      debug('file encoded!');

      if (++count === total) {
        debug('all files encoded!');

        self.io.emit('convos:binary:init', convoId, fileList);
      };
    };

    reader.readAsDataURL(file);
  });
};

OffTheRecord_Client.prototype.friendRequest = function (username, done) {
  this.io.emit('requests:send', username, done);
};

OffTheRecord_Client.prototype.getRequests = function (done) {
  this.io.emit('requests:get', done);
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

OffTheRecord_Client.prototype.getConsentedInteractions = function (username, done) {
  this.io.emit('get-consented-interactions', username, done);
}

OffTheRecord_Client.prototype.sendMessage = function (convoId, message) {

  this.io.emit('convos:message', convoId, message);

};

OffTheRecord_Client.prototype.startConversation = function (invitees, done) {

  this.io.emit('convos:start', invitees, function (err, conversation) {
    done(conversation);
  });

};

OffTheRecord_Client.prototype.inspectConversation = function (convoId) {

};

OffTheRecord_Client.prototype.endConversation = function (convoId) {

};

OffTheRecord_Client.prototype.leaveConversation = function (convoId) {

};

OffTheRecord_Client.prototype.getFriends = function (done) {

  this.io.emit('friends:get', done);

};

OffTheRecord_Client.prototype.updatePrivacy = function (updates, done) {

  debug('updates', updates);

  this.io.emit('privacy:update', updates, done);

};

OffTheRecord_Client.prototype.updateProfile = function (updates, done) {

  debug('updates', updates);

  this.io.emit('profile:update', updates, done);

};

OffTheRecord_Client.prototype.viewProfile = function (username, done) {
  debug('attempting to view ' + username + '\'s profile...');

  this.io.emit('profile:view', username, done);
};

global.OffTheRecord_Client = OffTheRecord_Client;
