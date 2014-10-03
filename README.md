Off-The-Record 
==============

## Chat for the paranoid.. 

a boilerplate messaging app
with strict privacy by default
always hosted over https
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

