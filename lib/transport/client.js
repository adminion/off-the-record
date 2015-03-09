
global.Debug = require('debug');

var events = require('events'),
    debug = Debug('off-the-record:client'),
    privacy = require('../data/privacy'),
    relationships = require('../../node_modules/friends-of-friends/lib/relationships'),
    url = require('url'),
    util = require('util'),
    utils = require('techjeffharris-utils');

function OffTheRecord_Client (options) {

    if (!(this instanceof OffTheRecord_Client)) return new OffTheRecord_Client(options);

    options = options || {};

    var defaults = {
        debug: 'off-the-record*',
        chunkSize: 512,
        pickerId: 'send-files-picker'
    };

    var config = utils.extend(defaults, options);

    localStorage.setItem('debug', config.debug)

    var self = this;

    this.config = config;
    this.io = {};
    this.blobURLs = [];
    this.files = [];
    this.transfers = {};
    this.readers = [];
    this.url = url.parse(window.location.href);

    var socketioURL = util.format('%s//%s', this.url.protocol, this.url.host);

    debug('socketioURL', socketioURL);

    this.io.users = io.connect(socketioURL + '/users');
    this.io.convos = io.connect(socketioURL + '/conversations');

    this.io.users.on('connect', function (err) {
        if (err) {
            debug(err);
            self.emit('error', err);
        } else {
            debug('connected to users namespace!');

            debug('this.io.users', self.io.users);

            if (bothConnected()) {
                self.emit('ready');
            }
            
        }
    });

    this.io.convos.on('connect', function (err) {
        if (err) {
            debug(err);
            self.emit('error', err);
        } else {
            debug('connected to convos namespace!');

            if (bothConnected()) {
                self.emit('ready');
            }
        }
    });

    function bothConnected() { 

        return Boolean(self.io.users.connected /* && self.io.convos.connected */);

    }

};

OffTheRecord_Client.prototype = new events.EventEmitter();

OffTheRecord_Client.prototype.privacy = privacy;
OffTheRecord_Client.prototype.relationships = relationships;

OffTheRecord_Client.prototype.joinConversation = function (convoId, joined) {

    this.io.convos.emit('join', convoId, function (success) {

        var confirmation = ((success)?'Yes!':'No!') + ' we ' + ((success)?'were':'weren\'t') + ' able to join the conversation!';

        debug(confirmation);

        if (success) {

            this.io.convos.on('message', message);

            this.io.convos.on('transfer-data', transferData);

            this.io.convos.on('transfer-progress', transferProgress);

            this.io.convos.on('send-files', sendFiles);

            this.io.convos.on('transfer-complete', transferComplete);

            function b64toBlob(b64Data, contentType) {

                contentType = contentType || '';
                
                var blob;
                var byteCharacters = atob(b64Data);
                var byteArrays = [];
                var progress = 0;
                var totalChars = byteCharacters.length;

                for (var offset = 0; offset < byteCharacters.length; offset += this.config.chunkSize) {

                    var percentage = Math.floor(offset / totalChars * 100)

                    if (percentage > progress) {
                        progress = percentage;

                        if (progress % 10 === 0) {
                            debug('creating blob: ' + progress + '% complete...');
                        }
                    }

                    var chunk = byteCharacters.slice(offset, offset + this.config.chunkSize);

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

            function message () {}


            function transferComplete (transferId) {
                debug('transfer %s complete', transferId);

                // h$('#transfer-status').replaceWith('<div id="transfer-status"></div>');

            };

            function transferData (transferId, fileId, chunkId, chunk) {

                // debug('%s, %s, %s', transferId, fileId, chunkId);

                var transfer = this.transfers[transferId];

                // debug('transfer', transfer);

                var file = transfer.files[fileId];

                file.chunks[chunkId] = chunk;

                file.transferred += chunk.length;
                transfer.transferred += chunk.length; 

                var filePercentage = Math.floor(file.transferred / file.encodedLength * 100 );
                var overallPercentange = Math.floor(transfer.transferred / transfer.encodedLength * 100)

                if (filePercentage > file.progress) {
                    file.progress = filePercentage;
                }

                if (overallPercentange > transfer.progress) {
                    transfer.progress = overallPercentange;
                }

                if (file.transferred === file.encodedLength) {
                    file.data = function () {
                        return file.chunks.join('');
                    }

                    var data = file.data().split(',')[1];
                    var blob = b64toBlob(data, file.type);
                    var url = URL.createObjectURL(blob);

                    $('#files-received').append('<li><a target="_blank" download="' + file.name + '" href="' + url + '">' + file.name + '</a></li>');

                    this.BLobURLs.push(url);
                }

                if (transfer.transferred === transfer.encodedLength) {
                    //the transfer is complete!

                }

            };

            function sendFiles (transfer) {

                debug('incoming file transfer', transfer);

                transfer.on('progress', function (fileId) {
                    var file = transfer.files[fileId]

                    debug(transfer.id + ': ' + transfer.progress + '%, ' + file.name + ': ' + file.progress + '%')

                });

                this.transfers[transfer.id] = transfer;

            }

            function transferProgress (transferId, txProgress, fileId, fileProgress) {

                $('#transfer-status').replaceWith('<div id="transfer-status"><p>' + transferId + ': ' + txProgress + '%, '
                    + this.transfers[transferId].files[fileId].name + ': ' + fileProgress + '%</p></div>');

            };
        }

        joined(success);

    });
};

OffTheRecord_Client.prototype.search = function (term, options, done) {

    debug('searching for '+ term);

    this.io.users.emit('search', term, options, done);

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
        foo[i] = picker.files[i];
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

                this.io.convos.emit('send-files', convoId, fileList, transferReady);
            };
        };

        reader.readAsDataURL(file);
    });

    function transferReady (transfer) {

        this.transfers[transfer.id] = transfer;

        debug('server ready for transfer', transfer.id);

        debug('this.files', this.files);

        // bombard the server with chunks of each file
        this.files.forEach(function (file, fileId) {
            var chunk,
                chunkId,
                offset;

            debug('sending file chunks to server!');

            // send files in chunks to provide progress feedback
            // chunks won't neccessarily be received in order, so use "chunkId" to preserve order
            for (chunkId = 0, offset = 0; offset < file.data.length; chunkId++, offset += chunkSize) {

                chunk = file.data.slice(offset, offset + chunkSize);

                debug('chunk', chunkId);

                this.io.convos.emit('transfer-data', convoId, transfer.id, fileId, chunkId, chunk);
            }

        });

        debug('Files uploaded!');

    }

};

OffTheRecord_Client.prototype.friendRequest = function (email, done) {

    this.io.users.emit('request', email, done);

};

OffTheRecord_Client.prototype.getRequests = function (done) {
    this.io.users.emit('get-requests', done);
};

OffTheRecord_Client.prototype.acceptRequest = function (userId, done) {
    this.io.users.emit('request-accept', userId, done);
};

OffTheRecord_Client.prototype.sendMessage = function (convoId, message) {

    this.io.convos.emit('sendMessage', convoId, message);

};

OffTheRecord_Client.prototype.startConversation = function (invitees, started) {

    this.io.convos.emit('start', invitees);

    this.io.convos.once('started', function (convo) {
        started(convo);
    });

};

OffTheRecord_Client.prototype.inspectConversation = function (convoId) {

};

OffTheRecord_Client.prototype.endConversation = function (convoId) {

};

OffTheRecord_Client.prototype.leaveConversation = function (convoId) {

};

OffTheRecord_Client.prototype.getFriends = function (done) {

    this.io.users.emit('get-friends', done);

};

OffTheRecord_Client.prototype.updatePrivacy = function (updates, done) {

    debug('updates', updates);

    this.io.users.emit('update-privacy', updates, done);

};

OffTheRecord_Client.prototype.updateProfile = function (updates, done) {

    debug('updates', updates);

    this.io.users.emit('update-profile', updates, done);

};


global.OffTheRecord_Client = OffTheRecord_Client;
