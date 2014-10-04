Off-The-Record 
==============

# Chat for the paranoid.. 

a boilerplate messaging app with strict privacy by default 

always hosted over https, and all messags are volatile

no message or file is persisted to any database, ever!

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

### Production install (default)
The setup script will download and install all system dependencies and node-module dependencies via npm, then create and start an upstart service.

Clone the repo with git or download a copy then open a terminal, cd to that directory, then run `./setup.sh`.  You should not use sudo for the setup script, but you must be a [sudoer](https://help.ubuntu.com/community/Sudoers) as some internal commands within the setup script use sudo.

    $ git clone https://github.com/techjeffharris/off-the-record.git
    $ cd off-the-record/
    $ ./setup.sh
    
Upon successful installation, setup will create and start an upstart job by the name of `off-the-record`:

    $ ./setup.sh
    ...
    off-the-record start/running, process 22709
    off-the-record server installed!
    $ 

### Development install 
#### Dependencies
If you plan on installing for development or testing purposes, you will need to manually install system dependencies and node-module dependencies:

    $ sudo apt-get update
    $ sudo apt-get install openssl nodejs npm mongodb
    $ sudo npm-install
    
#### Certificate/key

If you're developing, you probably don't have--let alone care about having--a valid certificate.  To get started quickly you can generate a key, create a certificate and sign it all in one command:

    $ ./gen-key-signed-cert.sh

which will prompt you for certificate pertinents, then create (if it doesn't exist) `.ssl/` with `otrd-cert.pem` and `otrd-key.pem` inside.

You may optionally provide a string to be prepended their names:

    $ ./gen-key-signed-cert.sh myServer
    
which will name the files `myServer-cert.pem` and `myServer-key.pem`, respectively.

#### Starting manually
To manually start the server, simply run `off-the-record.sh`:

    $ ./off-the-record.sh
    
##### Enable debug output
Off-The-Record uses [visionmeida's](https://github.com/visionmedia) [debug](https://github.com/visionmedia/debug) to display debugging information.  To enable Off-The-Record debug messages, pass `"off-the-record*"` to the startup script:

    $ ./off-the-record.sh "off-the-record*"
    
Each file's output is prepended with a unique namespace, so to only enable debug output for the file `lib/transport/http.js`, you would pass "off-the-record:transport:http" to the startup script:

    $ ./off-the-record.sh "off-the-record:transport:http"
    
To enable all debug messages (including those of express, socket.io, mongoose, etc.) pass `"*"` or `\*`:

    $ ./off-the-record.sh "*"
    // or
    $ ./off-the-record.sh \*
    
_See [visionmedia/debug](https://github.com/visionmedia/debug) for more information._

## Uninstall

Uninstallation is just as easy as installation; however, you must also be a [sudoer](https://help.ubuntu.com/community/Sudoers).

    $ ./uninstall.sh

## Configure

You might want to define some custom configuration options in `config/production.json` or `config/development.json` to override the defaults:

```json
{
    "host": "localhost", 
    "cert": ".ssl/otrd-cert.pem",
    "key": ".ssl/otrd-key.pem",
    "mongodb": {
        "uri": "mongodb://localhost/off-the-record",
        "options": {
            "auto_reconnect": true
        }
    },
    "port": "80",
    "serverName": "Off-The-Record",
    "session": {
        "cookie": { "maxAge" : 18000000, "secure": true }, 
        "key": "off-the-record.sid",
        "resave": true,
        "saveUninitialized": true,
        "secret": "$1$lbr0SzZt$neYMrLZD/UfOcoxxg7Onl."
    },
    "shutdownTimeout": 5000
}
```
_its recommended that you generate your own session secret!_

## Server API

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

## Events

### Event: 'starting'
Emitted before the  server starts:

```javascript
server.on('starting', function onserverStarting () {
    console.log('starting server...');
});
```

### Event: 'stopping'
Emitted before the server stops:

```javascript
server.on('stopping', function onServerStopping () {
    console.log('stopping server...');
});
```

### Event: 'stopped'
Emitted once the server has stopped:

```javascript
server.on('stopped', function onServerStopped () {
    console.log('server stopped!');
});
```

### Event: 'started'
Emitted once the server is started:

```javascript
server.on('started', function onServerStarted () {
    console.log('server started!');
});
```


