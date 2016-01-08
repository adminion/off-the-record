Off-The-Record 
==============

Off-The-Record is private, encrypted messaging system that remembers you and your friends, but not what you were talking about.

    $ off-the-record
    starting off-the-record v0.0.5...
     --> https://localhost:443

[![bitHound Dependencies](https://www.bithound.io/github/adminion/off-the-record/badges/dependencies.svg)](https://www.bithound.io/github/adminion/off-the-record/master/dependencies/npm)
[![NPM](https://nodei.co/npm/off-the-record.png)](https://nodei.co/npm/off-the-record/)

  If you would like to contribute, please take a look at our [Contribution Guide][].

## Install

### Dependencies

You will need to have `nodejs` and `mongodb` installed to run the server.  You will also need `openssl` installed if you want to generate a private key and self-signed certificate.

### Global

In production environments, you'll want to install globally

    $ npm install -g off-the-record

See [Installing npm packages globally][].

### Local

If you're looking to develop your own app using off-the-record, simply omit the `-g` option to install locally.

    $ npm install off-the-record

See [Installing npm packages locally][]. 

## Configure

Off the record uses a 3 step configuration process:

1) Load the default configuration (See [Default Configuration][] below)

2) Load configuration overrides from a json file whos' name is the lowercased value of `NODE_ENV`.  If `NODE_ENV` is not set, `development.json` will be used (and silently created if not found).

    $ NODE_ENV=production off-the-record # "production.json" will be used

3) Load configuration overrides parsed from the json value of `OTR_CONFIG`, if set.  This allows you to provide additional configuration overrides at runtime after your environment-specific configuration has been applied. 

    $ OTR_CONFIG='{ "serverName": "my-server" }' off-the-record

### Custom Directory
By default, the configuration directory will be `config/` relative to your installation path.  You may optionally specify another directory via the `OTR_CONFIG_DIR` environment variable.

    $ OTR_CONFIG_DIR=/path/to/your/config/ off-the-record

### Default Configuration

```json
{
  "serverName": "Off-The-Record",
  "shutdownTimeout": 30000,
  "http": {
    "host": "", 
    "port": 443,
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
      "prefix": ""
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

HTTPS servers require a private key and certificate.  We make it easy to generate a key and self-signed certificate to make development easier (see [Self-Signed][] below), but you should purchase a signed certificate from a trusted Certificate Authority if you are using Off-The-Record in the real world.

*You are strongly advised to keep your private key and certificate files in a safe place __outside__ of your installation folder unless you're ok with them being deleted by `npm remove`.*

#### Professionally Signed

When providing your own key and certificate, set `http.ssl.prefix` to the folder in which your key and certificate live. 

    {
      "http": {
        "ssl": {
          "cert": "myCert.pem",
          "key": "myKey.pem",
          "prefix": "/home/jeff/.ssl"
        }
      }
    }

#### Self-Signed

If you're developing or don't want to purchase a professionally-signed key/certificate, you can generate a key, create a certificate and sign it all in one command:

    $ npm run gen-key-signed-cert

which will prompt you for certificate attributes (don't really matter when developing), create (if it doesn't exist) `.ssl/` in your installation directory, then save `off-the-record-cert.pem` and `off-the-record-key.pem` inside.

You may optionally pass a name to `gen-key-signed-cert` that will be used as the name prefix:

    $ npm run gen-key-signed-cert myServer


which will generate `myServer-cert.pem` and `myServer-key.pem`.

## Start

### Installed Globally

    $ off-the-record

If you are hosting in a production environment, set `NODE_ENV=production` to make it go harder, better, faster, stronger.

### Installed Locally

    cd /path/to/off-the-record
    node server.js

### Enable debug output
Off-The-Record uses [visionmeida's debug][] to display all debugging information.  To enable all Off-The-Record debug messages, set `DEBUG` to `"off-the-record*"` before starting

    $ DEBUG="off-the-record*" off-the-record

Each file's output is prepended with a unique namespace.  To only enable debug output for the file `lib/transport.js`, you would set `DEBUG` to `"off-the-record:transport"`

To enable debugging for the all models in `lib/models`, set `DEBUG` to `"off-the-record:models*`

To enable all debug messages (including those of express, socket.io, and several other dependencies) set `DEBUG` to `"*"` or `\*`:

## API

### OffTheRecord
Exposed by `require('./lib/')`, extends nodejs [EventEmitter][].

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

See the [Contribution Guide][] for more information on how to contribute, run tests, and generate coverage reports. _**NOTE** I haven't actually made any test for this repo yet... :D_

## LICENSE
Copyright (c) 2014-2015 Jeff Harris and contributors
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

[Contribution Guide]: #contributing
[Installing npm packages globally]: https://docs.npmjs.com/getting-started/installing-npm-packages-globally
[Installing npm packages locally]: https://docs.npmjs.com/getting-started/installing-npm-packages-locally
[Default Configuration]: #default-configuration
[Self-Signed]: #self-signed
[visionmeida's debug]: https://github.com/visionmedia/debug
[EventEmitter]: http://nodejs.org/api/events.html#events_class_events_eventemitter
