$(document).ready(function documentReady () {

	var client = OffTheRecord(),
		friendsList = $('#friends'),
		requestsSentList = $('#requests-sent'),
		requestsReceivedList = $('#requests-received');

	client.once('ready', function clientReady() {

		client.getFriends(function (err, friends) {
			if (err) {
				console.error(err);
			} else {

				console.log('friends', friends);

				client.getRequests(function (err, requests) {

					console.log('')

					friendsList.empty();
					friends.forEach(function (friend) {
						friendsList.append('<li><a href="/profile' + friend.email +  '">' + friend.profile.displayName + '</a></li>');
					});

					requestsSentList.empty();
					requests.sent.forEach(function (sentRequest) {
						var listItem = '<li><a href="/profile' + sentRequest.requested.email +  '">' + sentRequest.requested.profile.displayName + '</a>'
							+ '&nbsp;<button id="cancel-request">cancel</button></li>';

						requestsSentList.append(listItem);
					});

					requestsReceivedList.empty();
					requests.received.forEach(function (receivedRequest, whichRequest) {
						var listItem = '<li><a href="/profile' + receivedRequest.requester.email +  '">' + receivedRequest.requester.profile.displayName + '</a>' 
							+ '&nbsp;<button id="accept-request-' + whichRequest + '">accept</button>' 
							+ '&nbsp;<button id="deny-request-' + whichRequest + '">deny</button></li>';

						requestsReceivedList.append(listItem);

						$('#accept-request-'+whichRequest).click(function (clickEvent) {
							client.acceptRequest(receivedRequest.requester._id, function (err, friendship) {
								if (err) {
									console.error(err);
								} else {
									console.log('friendship', friendship);
								}
							});
						});
					});
				});
			}
		});
	});
});