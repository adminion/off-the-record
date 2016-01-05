"use strict";

var events = require('events');
var util = require('util'); 

var env = require('./env');

var debug = require('debug')(env.package.name + ':transport:binary');

var shortId = require('shortid');

module.exports = BinaryTransfer;

function BinaryTransfer (filesInfo) {

  this.id = shortId.generate();
  this.complete;
  this.offset = 0;
  this.encodedLength = 0;
  this.fileId = 0;
  this.filesInfo = filesInfo;
  this.progress = 0;
  this.sender;
  this.size = 0;
  this.start;
  this.transferred = 0;

  var self = this;

  this.files.forEach(function (file) {
    debug('file', file);

    file.chunks = [];
    file.transferred = 0; // the number of bytes transferred
    file.progress = 0; // the progress percentage as an integer

    self.encodedLength += file.encodedLength;
    self.size += file.size;
  });

  // add event handlers for debugging
  this.on('progress', function () {
    debug(util.format('binary transfer %s: %s%',this.id, this.progress));
  });

  this.on('file-progress', function (fileId) {
    var file = this.files[fileId];
    debug(util.format('binary transfer %s: %s %s%',this.id, file.name, file.progress));
  });

  this.on('file-complete', function (fileId) {
    var file = this.files[fileId];
    debug(util.format('binary transfer %s: %s complete.',this.id, file.name));
  });

  this.on('complete', function () {
    debug('this ' + this.id + 'complete');
  });

}

BinaryTransfer.prototype = new events.EventEmitter();

BinaryTransfer.prototype.chunk = function (fileId, chunkId, chunk) {

  if (!this.start) {
    this.start = Date.now();

    this.emit('start', this.start);
  }

  var file = this.files[fileId];

  file.transferred += chunk.length;
  this.transferred += chunk.length; 

  var filePercentage = Math.floor(file.transferred / file.encodedLength * 100);
  var overallPercentange = Math.floor(this.transferred / this.encodedLength * 100)
  
  if (overallPercentange > this.progress) {
    this.progress = overallPercentange;

    this.emit('progress');
  }

  if (filePercentage > file.progress) {
    file.progress = filePercentage;
    
    this.emit('file-progress', fileId);
  }

  if (file.transferred === file.encodedLength) {

    fileId++;

    this.emit('file-complete', fileId);
  }

  if (this.transferred === this.encodedLength) {
    this.complete = Date.now();
    this.emit('complete', this.complete);
    debug('transfer %s complete', this.id);
  }
};

