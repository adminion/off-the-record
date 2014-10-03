Off-The-Record 
==============

## Chat for the paranoid.. 

a boilerplate messaging app with strict privacy by default 

always hosted over https, and all messags are volatile

no message or file is persisted to any database, ever!

```javascript
var OffTheRecord = require('./lib/'),
    server;

server = new OffTheRecord();

server.on('ready', function () {
    console.log('off-the-record server is running!');
});

server.start();
```

### installation

Installation is a snap, but you must be a [sudoer](https://help.ubuntu.com/community/Sudoers).

    $ git clone https://github.com/techjeffharris/off-the-record.git
    $ cd off-the-record/
    $ ./setup.sh

If you don't care about having a valid certificate, you may generate one at setup by supplying flags.  
    
    $ ./setup.sh -g
    $ ./setup.sh --generate
    $ ./setup.sh -s
    $ ./setup.sh --ssl
_any of the above will trigger generation/signing of key and certificate._

Upon successful installation, setup will create and start an upstart job by the name of `off-the-record`:

    $ ./setup.sh
    off-the-record start/running, process 22709
    off-the-record server installed!

### uninstallation

Uninstallation is just as easy as installation; however, you must also be a [sudoer](https://help.ubuntu.com/community/Sudoers).

    $ .uninstall.sh

### configuration

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


