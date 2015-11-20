var debug = Debug('off-the-record:convos')

$(document).ready(function documentReady () {

  var client = new OffTheRecord_Client();

  client.on('error', function (err) {
    debug('error', err);
  });

});
