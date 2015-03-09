
var debug = Debug('off-the-record:client:convo')

$(document).ready(function documentReady () {

    OffTheRecord_Client.connect(function () {
        console.log('off-the-record client ready!');
    });


});

