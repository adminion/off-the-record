
var debug = Debug('off-the-record:search')

$(document).ready(function documentReady () {

  var client = new OffTheRecord_Client({
    debug: true
  });

  var searchUsers = $('#search-users').attr('disabled', true);
  var searchInput = $('#search-input').attr('disabled', true);

  searchInput.on('search', function onSearch (searchEvent) {
    var term = this.value;
    var findParams = {};

    if (term) findParams.conditions = { username: term };

    client.search(findParams, searchResults);
  });

  searchUsers.click(function searchUsers_onclick (clickEvent) {
    var term = searchInput[0].value;
    var findParams = {
      conditions: { 
        username: term 
      }
    };

    client.search(findParams, searchResults);
  });

  var resultLists = {
    friends: $('#friends'),
    friendsOfFriends: $('#friends-of-friends'),
    nonFriends: $('#non-friends')
  };

  client.on('ready', function clientReady() {

    searchInput.attr('disabled', false);
    searchUsers.attr('disabled', false);

    searchUsers.click();
  });

  client.on('error', function (err) {
    console.err("OffTheRecord:client err:", err);
  });

  client.on('requests:sent', function requestSent (username) {
    alert('sent request to ' + username);
    searchUsers.click();
  });

  client.on('requests:received', function requestReceived (username) {
    alert('received request from ' + username);
    searchUsers.click();
  });

  client.on('requests:accepted', function requestAccepted (friendship) {
    if (friendship.requester._id === client.user._id) {
      alert(friendship.requested.username + ' accepted your friend request');
    } else {
      alert('You accepted ' + friendship.requester.username + '\'s request');
    }
    searchUsers.click();
  });

  client.on('requests:denied', function requestDenied (username) {
    alert('You denied ' + username + '\'s request');

    searchUsers.click();

  });

  client.on('requests:canceled', function requestCanceled (username) {
    alert('You canceled your request to ' + username);
    searchUsers.click();
  });

  client.on('friends:unfriended', function unfriended (username) {

    alert('You unfriended ' + username);

    searchUsers.click();
  });

  client.on('friends:logon', function friendLogon (friendId) {
    alert(this.user.friends[friendId].username + " logged on");
  });

  client.on('friends:logoff', function friendLogoff (friendId) {
    alert(this.user.friends[friendId].username + " logged off");
  });

  function searchResults (err, results) {
    if (err) {
      console.error(err);
    }

    debug('results', results);

    // loop through the result categories
    for (var category in results) {

      // debug('category', category);

      // empty the unordered list of this result category
      resultLists[category].empty();
      
      // loop through the users in this catetory
      results[category].users.forEach(function (user, key) {

        // debug('results[' + category + '].users[' + key + ']', user);

        // make a simple reference to the permissions of this user
        var permissions = results[category].permissions[key];

        var result = $('<li></li>');

        // if the searcher is not consented to view this user's profile, just display their username
        var username = (~permissions.indexOf('profile')) 
          ? '<a href="/profile/' + user.username + '">' + user.username + '</a>'
          : user.username;

        // append their username to the result list item
        result.append(username);


        // loop through the permissions
        permissions.forEach(function (permission) {

          // debug('permission', permission);

          // they wouldn't show up if we weren't consented to search, and we already handled 
          // providing a link to their profile above
          if (permission !== 'search' && permission !== 'profile') {

            // create the base interactionButton element and store it in a local variable
            // so we don't need to give it an id to assign it a click handler
            var interactionButton = $('<button>' + permission + '</button>');

            // since we stored the element in a var, we can attach a click handler to it
            // without needing to query for an id.
            interactionButton.click(function (clickEvent) {

              debug('attempting to call client["' + permission + '"](...)...');
              
              // call the corresponding client method to handle the interaction
              client[permission](user.username, function (err, request) {
                if (err) {
                  debug('error when interacting with ' + user.username +': ' + permission);
                  debug('err', err);
                } else {
                  debug('successfully interacted with ' + user.username + ': ' + permission);
                }
              })
            });

            
            result.append(interactionButton);
          }

        });
        
        // debug('result', result);

        resultLists[category].append(result);

      });
    }
    
  };
});
