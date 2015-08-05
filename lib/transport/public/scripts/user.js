
var debug = Debug('off-the-record:client:user')

$(document).ready(function documentReady () {


    var client = new OffTheRecord_Client();

    client.once('ready', function clientReady() {

    	var acceptRequest = $('#acceptRequest');
        var cancelRequest = $('#cancelRequest');
        var denyRequest = $('#denyRequest');
        var endFriendship = ('#endFriendship');
        var friendRequest = $('#friendRequest');

    	acceptRequest.click(function (clickEvent) {
            debug('accepting friendRequest');

            client.acceptRequest(this.value, function (err, friendship) {
                if (err) return console.error(err);

                alert('accepted friendRequest!');
                acceptRequest.hide();            
                // window.location = window.location;
                debug('friendship', friendship);
            });
        });

        cancelRequest.click(function (clickEvent) {
            debug('canceling friendRequest');

            client.cancelRequest(this.value, function (err, friendship) {
                if (err) return console.error(err);

                alert('canceled friendRequest!');
                cancelRequest.hide();            
                // window.location = window.location;
                debug('friendship', friendship);
            });
        });

        denyRequest.click(function (clickEvent) {
            debug('denying friendRequest');

            client.denyRequest(this.value, function (err, friendship) {
                if (err) return console.error(err);

                alert('denied friendRequest!');
                denyRequest.hide();            
                // window.location = window.location;
                debug('friendship', friendship);
            });
        });

        endFriendship.click(function (clickEvent) {
            debug('ending friendship...');

            client.endFriendship(this.value, function (err, numberOfDocsRemoved) {
                if (err) {
                    throw (err);
                } else {
                    alert('ended friendship!');
                    endFriendship.hide();
                }
            });
        });

        friendRequest.click(function (clickEvent) {
            debug('sending friendRequest...');

            client.friendRequest(this.value, function (err, request) {
                if (err) return console.error(err);

                alert('sent friendRequest!');
                friendRequest.hide();
                // window.location = window.location;
                debug('request', request);
            });
        });

        
    });
});
