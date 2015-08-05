
var debug = Debug('off-the-record:client:friends')

$(document).ready(function documentReady () {

	var client = OffTheRecord_Client(),
		friendsList = $('#friends'),
		requestsSentList = $('#requests-sent'),
		requestsReceivedList = $('#requests-received');

	client.once('ready', function clientReady() {

		client.getFriends(gotFriends);

		function gotFriends (err, friends) {
			if (err) {
				console.error(err);
			} else {

				console.log('friends', friends);

				client.getRequests(function (err, requests) {

					console.log('')

					friendsList.empty();
					friends.forEach(function (friend) {
						friendsList.append('<li><a href="/profile/' + friend.username +  '">' + friend.username + '</a></li>');
					});

					requestsSentList.empty();
					requests.sent.forEach(function (sentRequest) {
						var listItem = '<li><a href="/profile/' + sentRequest.requested.username +  '">' + sentRequest.requested.username + '</a>'
							+ '&nbsp;<button id="cancel-request">cancel</button></li>';

						requestsSentList.append(listItem);
					});

					requestsReceivedList.empty();
					requests.received.forEach(function (receivedRequest, whichRequest) {
						var listItem = '<li><a href="/profile/' + receivedRequest.requester.username +  '">' + receivedRequest.requester.username + '</a>' 
							+ '&nbsp;<button id="accept-request-' + whichRequest + '">accept</button>' 
							+ '&nbsp;<button id="deny-request-' + whichRequest + '">deny</button></li>';

						requestsReceivedList.append(listItem);

						$('#accept-request-'+whichRequest).click(function (clickEvent) {
							client.acceptRequest(receivedRequest.requester.username, function (err, friendship) {
								if (err) {
									console.error(err);
								} else {
									client.getFriends(gotFriends);
								}
							});
						});
					});
				});
			}
		}
	});
});
