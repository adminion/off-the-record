'use strict'

var stream = require('stream');
var util = require('util');

const ERR_INVALID_PARAM = 'Source must be a String or an instance of Buffer.';

// turn a given source Buffer into a Readable Stream
class BufferReadStream extends stream.Readable {
  constructor (source) {
    // make sure the source is an instance of a buffer
    if ( ! (source instanceof Buffer) ) {
      if ( typeof source === 'string' ) {
        source = new Buffer(source);
      } else {
        throw new Error(ERR_INVALID_PARAM);
      }
    }

    // call stream.Readable's constructor
    super();

    this._source = source;
    this._offset = 0;
    this._length = source.length;

    this.on('end', this._destroy);

  }

  _destroy () {

    this._source = null;
    this._offset = null;
    this._length = null;
  }

  _read (size) {

    if ( this._offset < this._length) {
      this.push( this._source.slice( this._offset, (this._offset + size) ) );

      this._offset += size;
    }

    if ( this._offset >= this._length) {
      this.push(null);
    }

  }
};

module.exports = BufferReadStream;
