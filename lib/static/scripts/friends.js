
var debug = Debug('off-the-record:client:friends')

$(document).ready(function documentReady () {

  var client = new OffTheRecord_Client();
  var permissions;
  var userLists = {
    friends:  $('#friends'),
    sent:     $('#sent'),
    received: $('#received')
  }

  client.on('requests:received', function (username) {
    alert('received request from ' + username);

  });

  client.on('requests:accepted', function (friendship) {

    var friend; 
    if (this.user._id === friendship.requester._id) {
      friend = friendship.requested.username;
      alert(friend + ' accepted your friend request');
    } else {
      friend = friendship.requester.username;
      alert('You accepted ' + friend + '\'s request');
    }

  });

  client.on('requests:denied', function (request) {
    username = request.requester.username;
  
    alert('You denied ' + username + '\'s request');

  });

  client.on('requests:canceled', function (request) {

    username = request.requested.username;

    alert('You canceled your request to ' + request.requester.username);  
          
  });

  client.on('ready', function () {
    client.friends(gotFriends);
  });

  function gotFriends (err, interactions) {
      if (err) return console.error(err);

      permissions = interactions;
      update();
  }

  function update () {
    
    debug('client.user.friends', client.user.friends);
    debug('client.user.requests', client.user.requests);
    debug('permissions', permissions);

    var users = {
      friends:  client.user.friends,
      sent:     client.user.requests.sent,
      received: client.user.requests.received
    };

    for (var list in users) {

      debug('list', list);

      userLists[list].empty();

      users[list].forEach(function (user) {

        debug('user', user);
        
        var userListItem = $('<li></li>');

        debug('userListItem', userListItem);

        debug('permissions[' + list + ']['+user+']', permissions[list][user]);

        var username = (~permissions[list][user].indexOf('profile')) 
          ? user
          : '<a href="/profile/' + user + '">' + user + '</a>';

        userListItem.append(username);

        permissions[list][user].forEach(function (permission) { 


          if (permission !== 'search' && permission !== 'profile') {    
            var interactionButton = $('<button>' + permission +'</button>').click(function (clickEvent) {
              client[permission](user, function (err, result) {
                if (err) {
                  console.error(err);
                } 

                client.friends(gotFriends);
              });
            });

            userListItem.append(interactionButton);
          }
        });

        userLists[list].append(userListItem);        
      });
    }
  };
});
