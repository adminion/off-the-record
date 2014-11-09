Off-The-Record 
==============

# Chat for the paranoid.. 

a boilerplate messaging app with strict privacy by default 

always hosted over https, and all messages are volatile

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

### Production install
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
    $ sudo npm install
    
#### Certificate/key

If you're developing, you probably don't have--let alone care about having--a valid certificate.  To get started quickly you can generate a key, create a certificate and sign it all in one command:

    $ ./gen-key-signed-cert.sh

which will prompt you for certificate pertinents (which don't matter in dev), then create (if it doesn't exist) `.ssl/` with `otrd-cert.pem` and `otrd-key.pem` inside.

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
    
*Enabling debug output will set NODE_ENV to 'developement'.  See [Configure](https://github.com/techjeffharris/off-the-record#configure) below for details.*

## Uninstall

Uninstalling is like installing: you must be a [sudoer](https://help.ubuntu.com/community/Sudoers).

    $ ./uninstall.sh

## Configure
Off the record is configured using [config](https://github.com/lorenwest/node-config).

You might want to define some custom configuration options in `config/production.json` or `config/development.json` to override those in `config/default.json`:

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
        "secret": "notagoodsecretnoreallydontusethisone"
    },
    "shutdownTimeout": 5000
}
```
_You should generate your own session secret!!_

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

## HTTP Routes

### Publicly Accessible Routes
* `/`: Splash screen telling the world about off-the-record
* `/logon`: Account logon page
* `/logoff`: logs out the current user and kills the session
* `/register`: A new account registration form

### Routes Requiring Authentication
* `/home`: user's home page; shows preview of friends online and conversations
* `/profile`: user's profile; shows information about user based upon privacy preferences.
* `/search`: search friends and publicly discoverable users
* `/convos`: a list of conversations which the user either has started or has been invited
* `/convos/:convoID`: a particular conversation
* `/friends`: user's list of friends
* `/friends/:friendID`: a particular friend's profile

## Socket.io Server API

### NSP: `/accounts`

#### Event: 'friends'
* accountID `String` Optional `_id` of a particular account

Get info about friends

#### Event: 'preferences'
* changes `Object` Optional preferences to be updated

Get or set user preferences

#### Event: 'requests-sent'
Get all friend requests the user has sent

#### Event: 'requests-pending'
Get all friend requests that are pending the user's approval

#### Event: 'request-send'
* accountID `String` The `_id` of the account whose friendship is being requested

Request another user's friendship

#### Event: 'request-accept'
* accountID `String` The `_id` of the account whose friendship request is to be accepted

Accept another user's friendship request

#### Event: 'request-deny'
* accountID `String` The `_id` of the account whose friendship request is to be denied

Deny another user's friendship request

#### Event: 'search'
* conditions `Object` The search conditions.

Search accounts, friends, friends of friends

#### Event: 'un-friend'
* accountID `String` The `_id` of the account to un-friend.

Abolish a friendship

### NSP: `/conversations`

#### Event: 'get'
Get conversations that the user has either started or been invited

#### Event: 'join'
* conversationID `String` The `_id` of the conversation

Join a conversation

#### Event: 'leave'
* conersationID `String` The `_id` of the conversation

Leave a conversation

#### Event: 'send-message'
* conversationID `String` The `_id` of the conversation
* message `String` The message to be sent

Send a message to a conversation

#### Event: 'send-file'
* conversationID `String` the `_id` of the conversation
* filename `String` The name of the file
* data `ArrayBuffer` The file data

Send a file to a conversation

#### Event: 'start'
* invitees `Array` People invited to join the conversation

Start a conversation

#### Event: 'boot'
* conversationID `String` The `_id` of the conversation
* accountID `String` The `_id` of the account to boot

Boot an account from a conversation

#### Event: 'invite'
* conversationID `String` The `_id` of the conversation
* invitees `Array` People invited to join the conversation

Invite one or more people to a conversation

#### Event: 'end'
* conversationID `String` The `_id` of the conversation

End a conversation
