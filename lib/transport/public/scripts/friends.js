
var debug = Debug('off-the-record:client:friends')

$(document).ready(function documentReady () {

  var client = new OffTheRecord_Client(),
    friendsList = $('#friends'),
    requestsSentList = $('#requests-sent'),
    requestsReceivedList = $('#requests-received');

  client.on('requests:received', function (request) {
    alert('received request from ' + request.requester.username);

    client.getFriendsAndRequests(gotFriendsAndRequests);
  });

  client.on('requests:accepted', function (friendship) {
    if (this.user._id === friendship.requester._id) {
      alert(friendship.requested.username + ' accepted your friend request');
    } else {
      alert('You accepted ' + friendship.requester.username + '\'s request');
    }

    client.getFriendsAndRequests(gotFriendsAndRequests);
  });

  client.on('requests:denied', function (request) {
    if (this.user._id === friendship.requester._id) {
      alert(friendship.requested.username + ' denied your friend request');
    } else {
      alert('You denied ' + friendship.requester.username + '\'s request');
    }

    client.getFriendsAndRequests(gotFriendsAndRequests);

  });

  client.on('requests:canceled', function (request) {
    if (this.user._id === friendship.requester._id) {
      alert(friendship.requested.username + ' canceled your friend request');
    } else {
      alert('You canceled ' + friendship.requester.username + '\'s request');
    }

    client.getFriendsAndRequests(gotFriendsAndRequests);
  });

  client.on('ready', function clientReady() {

    client.getFriendsAndRequests(gotFriendsAndRequests);

  });

  function gotFriendsAndRequests (err, results) {
    if (err) {
      console.error(err);
    } else {

      console.log('results.friends', results.friends);

      friendsList.empty();

      results.friends.forEach(function (friend, index) {
        
        var friendListItem = $('<li></li>');

        debug('friendListItem', friendListItem);

        // if the searcher is not consented to view this user's profile, just display their username
        var username = (results.friends.interactions[index].indexOf('profile') < 0) 
          ? user.username
          : '<a href="/profile/' + friend.username + '">' + friend.username + '</a>';

        friendListItem.append(username);

        var endFriendshipButton = $('<button>end friendship</button>');

        endFriendshipButton.click(function (clickEvent) {
          client.endFriendship(friend.username, function (err, result) {
            if (err) {
              console.error(err);
            } else {
              client.getFriendsAndRequests(gotFriendsAndRequests);
            }
          });
        });

        friendListItem.append(endFriendshipButton);

        friendsList.append(friendListItem);
        
      });


      requestsSentList.empty();

      requests.sent.forEach(function (sentRequest) {

        var requestee = sentRequest.requested;

        debug('requestee', requestee);

        client.getConsentedInteractions(requestee.username, function (err, consentedInteractions) {

          var listItem = $('<li></li>');

          // if the searcher is not consented to view this user's profile, just display their username
          var username = (consentedInteractions.indexOf('profile') < 0) 
            ? requestee.username
            : '<a href="/profile/' + requestee.username + '">' + requestee.username + '</a>';

          listItem.append(username);

          var cancelButton = $('<button>cancel</button>')

          cancelButton.click(function (clickEvent) {
            client.cancelRequest(requestee.username, function (err, result) {
              if (err) {
                console.error(err);
              } else {
                client.getFriendsAndRequests(gotFriendsAndRequests);
              }
            });
          });

          listItem.append(cancelButton);

          requestsSentList.append(listItem);

        });
      });

      requestsReceivedList.empty();
      requests.received.forEach(function (receivedRequest) {

        var requester = receivedRequest.requester;

        debug('requester', requester);

        client.getConsentedInteractions(requester.username, function (err, consentedInteractions) {

          var listItem = $('<li></li>');

          // if the searcher is not consented to view this user's profile, just display their username
          var username = (consentedInteractions.indexOf('profile') < 0) 
            ? requester.username
            : '<a href="/profile/' + requester.username + '">' + requester.username + '</a>';

          listItem.append(username);

          var acceptButton = $('<button>accept request</button>')

          acceptButton.click(function (clickEvent) {
            client.acceptRequest(requester.username, function (err, result) {
              if (err) {
                console.error(err);
              } else {
                client.getFriendsAndRequests(gotFriendsAndRequests);
              }
            });
          });

          listItem.append(acceptButton);

          var denyButton = $('<button>deny request</button>')

          denyButton.click(function (clickEvent) {
            client.denyRequest(requester.username, function (err, result) {
              if (err) {
                console.error(err);
              } else {
                client.getFriendsAndRequests(gotFriendsAndRequests);
              }
            });
          });

          listItem.append(denyButton);

          requestsReceivedList.append(listItem);

        });
      });
      
    }
  }
});
