
var events = require('events'),
    debug = require('debug')('off-the-record:client'),
    privacy = require('../data/friends/privacy'),
    relationships = require('../data/friends/relationships'),
    url = require('url'),
    util = require('util'),
    utils = require('techjeffharris-utils');

var client;

function OffTheRecord (options) {

    options = options || {};

    var defaults = {
        debug: 'off-the-record*',
        chunkSize: 512,
        pickerId: 'send-files-picker'
    }

    config = utils.extend(defaults, options);

    localStorage.setItem('debug', config.debug)
    
    if (!client) {
        client = new Client(config);
    }

    return client;

};

function Client (config) {

    var self = this;

    this.config = config;
    this.io = {};
    this.blobURLs = [];
    this.files = [];
    this.transfers = {};
    this.readers = [];
    this.url = { chunks: window.location.href.split('/'), }

    this.io.accounts = io('/accounts');
    this.io.convos = io('/conversations');

    this.io.accounts.on('connect', function (err) {
        if (err) {
            debug(err);
            self.emit('ready', err);
        } else {
            debug('connected to accounts namespace!');

            debug('this.io.accounts', self.io.accounts);

            if (bothConnected()) {
                self.emit('ready', err);
            }
            
        }
    });

    this.io.convos.on('connect', function (err) {
        if (err) {
            debug(err);
            self.emit('ready', err);
        } else {
            debug('connected to convos namespace!');

            if (bothConnected()) {
                self.emit('ready', err);
            }
        }
    });

    function bothConnected() { 

        return Boolean(self.io.accounts.connected && self.io.convos.connected);

    }

};

util.inherits(Client, events.EventEmitter);

Client.prototype.privacy = privacy;
Client.prototype.relationships = relationships;

Client.prototype.joinConversation = function (convoId, joined) {

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

Client.prototype.search = function (term, options, done) {

    debug('searching for '+ term);

    this.io.accounts.emit('search', term, options, done);

};

Client.prototype.pageId = function () {
    return window.location.pathname.split('/')[2]
};

Client.prototype.sendFiles = function (convoId) {
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

Client.prototype.friendRequest = function (email, done) {

    this.io.accounts.emit('request', email, done);

};

Client.prototype.sendMessage = function (convoId, message) {

    this.io.convos.emit('sendMessage', convoId, message);

};

Client.prototype.startConversation = function (invitees, started) {

    this.io.convos.emit('start', invitees);

    this.io.convos.once('started', function (convo) {
        started(convo);
    });

};

Client.prototype.inspectConversation = function (convoId) {

};

Client.prototype.endConversation = function (convoId) {

};

Client.prototype.leaveConversation = function (convoId) {

};

Client.prototype.getFriends = function (done) {

    this.io.accounts.emit('get-friends', done);

};

Client.prototype.updatePrivacy = function (updates, done) {

    debug('updates', updates);

    this.io.accounts.emit('update-privacy', updates, done);

};

Client.prototype.updateProfile = function (updates, done) {

    debug('updates', updates);

    this.io.accounts.emit('update-profile', updates, done);

};


global.OffTheRecord = OffTheRecord;
