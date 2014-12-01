$(document).ready(function documentReady () {

    var client = new OffTheRecord();

    client.on('ready', function clientReady() {

    	var friendRequest = $('#friendRequest')

    	friendRequest.click(function (clickEvent) {
    		console.log('sending friendRequest...');
    		client.friendRequest(client.pageId(), function (err, request) {
    			if (err) console.error(err)
    			console.log('sent friendRequest!');
    			console.log('request', request);
    		});
    	});
    });
});