
var debug = Debug('off-the-record:client:user')

$(document).ready(function documentReady () {


    var client = new OffTheRecord_Client();

    client.once('ready', function clientReady() {

    	var acceptRequest = $('#acceptRequest'),
            friendRequest = $('#friendRequest');

    	friendRequest.click(function (clickEvent) {
    		console.log('sending friendRequest...');

    		client.friendRequest(this.value, function (err, request) {
    			if (err) return console.error(err);

    			alert('sent friendRequest!');
                friendRequest.hide();
    			console.log('request', request);
    		});
    	});

        acceptRequest.click(function (clickEvent) {
            console.log('accepting friendRequest');

            client.acceptRequest(this.value, function function_name (argument) {
                // body...
            })
        })
    });
});
