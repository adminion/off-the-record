var debug = Debug('off-the-record:indexs')

$(document).ready(function documentReady () {

  var client = new OffTheRecord_Client();

  client.on('error', function (err) {
    debug('error', err);
  });

});
