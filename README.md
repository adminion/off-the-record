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
* `/profille/:email`: other users' profiles.
* `/search`: search friends and publicly discoverable users
* `/convos`: a list of conversations which the user either has started or has been invited
* `/convos/:convoID`: a particular conversation
* `/friends`: user's list of friends

## Client API

### OffTheRecord
Exposed as the `OffTheRecord` global in `window`, extends nodejs [EventEmitter](http://nodejs.org/api/events.html#events_class_events_eventemitter).

#### OffTheRecord(options:Object):Client
* options `Object` An optional Object containing configuration options.

Connect to an `OffTheRecord` server:
```javascript
var options = {
    debug: "Jeff'sSecretServer*",
    chunkSize: 128,
    pickerId: 'my-file-picker'
};

var client = OffTheRecord(options);
// or use defaults:
var client = OffTheRecord();
```

### Client.getFriends(gotFriends:Function)
* gotFriends `Function` Called once friends have been retreived.  Passed err (null on success) and an array of friends retreived (empty on failure).

Get all friends for the current user:
```javascript
client.getFriends(function(err, friends) {
    if (err) throw err;
    for (var i=0; i< friends.length; i++) {
        console.log('friend' + i, friends[i]);
    }
});
```

### Client.updateProfile(updates:Object, onceUpdated:Function)
* updates `Object` An object containing the profile properties to be updated.
* onceUpdated `Function` Called when update completes, passing an err (null if success) and the newly updated user.

Update the current user's profile:
```javascript

var updates = {
    firstName: "John",
    lastName: "Doe",
    displayName: "Unknown"
};

client.updateProfile(updates, function(err, updateUser) {
    console.log('updated user ' + updateUser._id + '\'s profile:', updatedUser);
});
```


### Client.updatePrivacy(updates:Object, onceUpdated:Function) 
* updates `Object` An object containing the privacy properties to be updated.
* onceUpdated `Function` Called when update completes, passing an err (null if success) and the newly updated user.

Update the current user's privacy:
```javascript

var updates = {
    firstName: "John",
    lastName: "Doe",
    displayName: "Unknown"
};

client.updatePrivacy(updates, function(err, updateUser) {
    console.log('updated user ' + updateUser._id + '\'s privacy:', updatedUser);
});
```

### Client.startConversation(invitees:Array, started:Function)
* invitees `Array` An Array of Mongoose ObjectIds belonging to users that are invited to join the conversation.
* started `Function` A Function called when the conversation has started which is passed the newly created conversation object.

Start a conversation:
```javascript
var invitees = [
    ObjectId('asdfghjkl;'),
    ObjectId('qwertyuiop['),
    ObjectId('zxcvbnm,.'),
    ...
];

client.startConversation(invitees, function (convo) {
    console.log('started conversation '+ convo._id);
});
```

### Client.joinConversation(convoId:ObjectId, joined:Function)
* convoId `ObjectId` A Mongoose ObjectId belonging to the conversation to join.
* joined `Function` A function called when the join operation has completed, passed a `Boolean` `success` indicating that the message was sent. 

Attempt to Join a conversation:
```javascript
client.joinConversation(convoId, function (success) {
    if (success) {
        console.log('Joined conversation ' + convoId + '!');
    } else {
        console.log('Failed to join conversation ' + convoId + '!');
    }
});
```

### Client.sendMessage(convoId:ObjectId, message:String, sent:Function)
* convoId `ObjectId` A Mongoose ObjectId belonging to the conversation to which the message will be sent.
* message `String` A string message to be sent to the conversation.

Attempt to send a message to a conversation:
```javascript
client.sendMessage(convoId, 'I made it everyone!', function(success) {
    if (!success) {
        console.err('unable to send message to conversation ' + convoId+ '!');
    }
});
```

### Client.sendFiles(convoId: ObjectId, success:Function)
* convoId `ObjectId` A Mongoose ObjectId belonging to the conversation to which the files will be sent.

Send files (selected by the file picker specified at instantiation) to a conversation: 
```javascript
client.sendFiles(convoId, function(success) {
    if (!success) {
        console.err('unable to send files to conversation ' + convoId+ '!');
    }
});
```

## LICENSE
MIT