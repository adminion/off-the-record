
var debug = Debug('off-the-record:client:profile');

$(document).ready(function documentReady () {

  var client = new OffTheRecord_Client();

  debug('client', client);  

  client.once('ready', function clientReady() {

    

    
  });

});
