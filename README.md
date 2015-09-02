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

### Dependencies

You will need to have `nodejs` and `mongodb` installed to run the server.  You will also need `openssl` installed if you want to generate a key and self-signed certificate.

### Production

Installing off-the-record globally will create a binary in your system prefix. 

    $ npm install -g off-the-record

### Development

If you're looking to contribute/develop you should omit the `-g` option to install locally to the current folder.  See [#contributing](Contributing) below. 

## Configure
Off the record is configured using [config](https://github.com/lorenwest/node-config).

You might want to define some custom configuration options in `config/production.json` or `config/development.json` to override those in `config/default.json`.

```json
{
  "serverName": "Off-The-Record",
  "shutdownTimeout": 5000,
  "http": {
    "host": "localhost", 
    "port": "443",
    "session": {
      "cookie": { "maxAge" : 18000000, "secure": true }, 
      "hash": { "salt": "off-the-record" },
      "key": "off-the-record.sid",
      "resave": false,
      "saveUninitialized": false,
      "secret": "use sha1pass (or similar) to make your own secret!"
    },
    "ssl": {
      "cert": "off-the-record-cert.pem",
      "key": "off-the-record-key.pem",
      "prefix": ".ssl"
    } 
  },
  "mongoose": {
    "conversationCollectionName": "",
    "conversationModelName": "Conversation",
    "options": {
      "auto_reconnect": true
    },
    "personCollectionName": "",
    "personModelName": "User",
    "uri": "mongodb://localhost/off-the-record"
  }
}
```

### SSL Private Key and Certificate

#### Professionally Signed

HTTPS requires a private key and certificate.  You should purchase a Private Key and Signed Certificate if you are using Off-The-Record in production.  

When providing your own key and certificate, modify `ssl.prefix` in `config/production.json` to point to the folder in which your key and cert live. 

    {
      "http": {
        "ssl": {
          "cert": "myCert.pem",
          "key": "myKey.pem",
          "prefix": "/home/jeff/.ssl"
        }
      }
    }

**WARNING:** *Do not move your key/cert files to `.ssl/` as it is inside this package and npm will delete this package if instructed to do so.  You don't want to lose your cert and key do you?

#### Self Signed

If you're developing, however, you probably don't want to purchase a professionally-signed key/certificate.  To get developing you can generate a key, create a certificate and sign it all in one command:

    $ npm run gen-key-signed-cert

which will prompt you for certificate attributes (which don't really matter when developing), then create (if it doesn't exist) `.ssl/` with `off-the-record-cert.pem` and `off-the-record-key.pem` inside.

You may optionally provide a string to be prepended their names:

    $ npm run gen-key-signed-cert myServer

which will name the files `myServer-cert.pem` and `myServer-key.pem`, respectively.

## Start
To start the server, run `off-the-record`

    $ off-the-record

### Enable debug output
Off-The-Record uses [visionmeida's](https://github.com/visionmedia) [debug](https://github.com/visionmedia/debug) to display debugging information.  To enable all Off-The-Record debug messages, set export `DEBUG` environment var to `"off-the-record*"` before starting

    $ DEBUG="off-the-record*" off-the-record

Each file's output is prepended with a unique namespace.  To only enable debug output for the file `lib/transport/http.js`, you would set `DEBUG` to `"off-the-record:server:transport:http"`

    $ DEBUG="off-the-record:server:transport:http" off-the-record

To enable debugging for the all files in `lib/data`, set `DEBUG` to `"off-the-record:server:data*`

    $ DEBUG="off-the-record:server:data*" off-the-record

To enable all debug messages (including those of express, socket.io, mongoose, and several other dependencies) set `DEBUG` to `"*"` or `\*`:

    $ DEBUG="*" off-the-record

or

    $ DEBUG=\* off-the-record

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

## Contributing
I'm sure there are bugs, please help me find/fix them!  If you make valuable contributions, I'll make you a collaborator :)

See the [Contribution Guide](https://github.com/adminion/contributing) for more information on how to contribute, run tests, and generate coverage reports. _**NOTE** I haven't actually made any test for this repo yet... :D_

## LICENSE
Copyright (c) 2014-2015 Jeff Harris
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
