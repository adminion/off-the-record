Off-The-Record 
==============

# Chat for the paranoid.. 

A self-hosted volatile messaging server with strict privacy by default that is always hosted over https.

```javascript
var OffTheRecord = require('./lib/'),
    server;

server = new OffTheRecord();

server.on('started', function () {
    console.log('off-the-record server is running!');
});

server.start();
```

## Install

    $ npm install -g off-the-record

#### SSL Private Key and Certificate

HTTPS requires a private key and certificate.  You should purchase a Private Key and Signed Certificate if you are using Off-The-Record in production.

If you're developing, however, you probably don't want to purchase a professionally-signed key/certificate.  To get developing you can generate a key, create a certificate and sign it all in one command:

    $ npm run gen-key-signed-cert

which will prompt you for certificate attributes (which don't really matter when developing), then create (if it doesn't exist) `.ssl/` with `otrd-cert.pem` and `otrd-key.pem` inside.

You may optionally provide a string to be prepended their names:

    $ npm run gen-key-signed-cert myServer

which will name the files `myServer-cert.pem` and `myServer-key.pem`, respectively.

#### Starting 
To start the server, simply run `node server`

    $ node server

##### Enable debug output
Off-The-Record uses [visionmeida's](https://github.com/visionmedia) [debug](https://github.com/visionmedia/debug) to display debugging information.  To enable all Off-The-Record debug messages, set `DEBUG` to `"off-the-record*"` before starting

    $ DEBUG="off-the-record*" node server

Each file's output is prepended with a unique namespace.  To only enable debug output for the file `lib/transport/http.js`, you would set `DEBUG="off-the-record:transport:http"`

    $ DEBUG="off-the-record:transport:http" node server

To enable all debug messages (including those of express, socket.io, mongoose, and several other dependencies) set  `"*"` or `\*`:

    $ ./off-the-record.sh "*"
    // or
    $ ./off-the-record.sh \*

## Configure
Off the record is configured using [config](https://github.com/lorenwest/node-config).

You might want to define some custom configuration options in `config/production.json` or `config/development.json` to override those in `config/default.json`.

```json
{
  "host": "localhost", 
  "cert": ".ssl/otrd-cert.pem",
  "key": ".ssl/otrd-key.pem",
  "mongoose": {
    "conversationCollectionName": "",
    "conversationModelName": "Conversation",
    "options": {
      "auto_reconnect": true
    },
    "personCollectionName": "",
    "personModelName": "User",
    "uri": "mongodb://localhost/off-the-record"
  },
  "port": "443",
  "serverName": "Off-The-Record",
  "session": {
    "cookie": { "maxAge" : 18000000, "secure": true }, 
    "hash": { "salt": "off-the-record" },
    "key": "off-the-record.sid",
    "resave": false,
    "saveUninitialized": false,
    "secret": "use sha1pass (or similar) to make your own secret!"
  },
  "shutdownTimeout": 5000
}
```

## API

### OffTheRecord
Exposed by `require('./lib/')`, extends nodejs [EventEmitter](http://nodejs.org/api/events.html#events_class_events_eventemitter).

### OffTheRecord()
Creates a new `OffTheRecord` `Server`.  Works with and without `new`:

```javascript
var OffTheRecord = require('./lib/');
var server = new OffTheRecord();
  // or
var server = require('./lib/')();
```

### Server.start(done:Function)
* done `Function` Optional callback to be called when server has started

Start the server:
```javascript
server.start(function () {
    console.log('the server has started!');
})
```

### Server.stop(done:Function)
* done `Function` Optional callback to be called when server has stopped

Stop the server:
```javascript
server.stop(function () {
    console.log('the server has stopped!');
})
```

### Event: 'starting'
Emitted when the server starts:

```javascript
server.on('starting', function onserverStarting () {
    console.log('starting server...');
});
```

### Event: 'started'
Emitted when the server has started:

```javascript
server.on('started', function onServerStarted () {
    console.log('server started!');
});
```

### Event: 'stopping'
Emitted when the server begins stopping:

```javascript
server.on('stopping', function onServerStopping () {
    console.log('stopping server...');
});
```

### Event: 'stopped'
Emitted when the server has stopped:

```javascript
server.on('stopped', function onServerStopped () {
    console.log('server stopped!');
});
```

## LICENSE
Copyright (c) 2014-2015 Jeff Harris
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
