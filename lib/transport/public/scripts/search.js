
var debug = Debug('off-the-record:client:search')

$(document).ready(function documentReady () {

  var client = new OffTheRecord_Client({
    debug: true
  });

  var searchUsers = $('#search-users').attr('disabled', false);
  var searchInput = $('#search-input').attr('disabled', false);

  var resultLists = {
    friends: $('#friends'),
    friendsOfFriends: $('#friends-of-friends'),
    nonFriends: $('#non-friends')
  };

  client.once('ready', function clientReady() {
    searchInput.on('search', function onSearch (searchEvent) {
      var term = this.value;
      var findParams = {};

      if (term) findParams.conditions = { username: term };
  
      client.search(findParams, searchResults);
    });

    searchUsers.click(function searchUsers_onclick (clickEvent) {
      var term = searchInput[0].value;
      var findParams = {};

      if (term) findParams.conditions = { username: term };

      client.search(findParams, searchResults);
    });

    function searchResults (err, results) {
      if (err) {
        console.error(err);
      }

      debug('results', results);

      if (results) {
        // loop through the result categories
        for (var category in results) {

          debug('category', category);

          // empty the unordered list of this result category
          resultLists[category].empty();
          
          // loop through the users in this catetory
          results[category].users.forEach(function (user, key) {

            debug('results[' + category + '].users[' + key + ']', user);

            // make a simple reference to the consentedInteractions of this user
            var consentedInteractions = results[category].consentedInteractions[key];

            var result = $('<li></li>');

            // if the searcher is not consented to view this user's profile, just display their username
            var username = (consentedInteractions.indexOf('profile') < 0) 
              ? user.username
              : '<a href="/profile/' + user.username + '">' + user.username + '</a>';

            // append their username to the result list item
            result.append(username);


            // loop through the consentedInteractions
            consentedInteractions.forEach(function (consentedInteraction) {

              debug('consentedInteraction', consentedInteraction);

              // they wouldn't show up if we weren't consented to search, and we already handled 
              // providing a link to their profile above
              if (consentedInteraction !== 'search' && consentedInteraction !== 'profile') {

                // create the base interactionButton element and store it in a local variable
                // so we don't need to give it an id to assign it a click handler
                var interactionButton = $('<button>' + consentedInteraction + '</button>');

                // since we stored the element in a var, we can attach a click handler to it
                // without needing to query for an id.
                interactionButton.click(function (clickEvent) {

                  debug('attempting to call client["' + consentedInteraction + '"](...)...');
                  
                  // call the corresponding client method to handle the interaction
                  client[consentedInteraction](user.username, function (err, request) {
                    if (err) {
                      debug('error when interacting with ' + user.username +': ' + consentedInteraction);
                    } else {
                      debug('successfully interacted with ' + user.username + ': ' + consentedInteraction);
                      interactionButton.hide();
                      searchUsers.click();
                    }
                  })
                });

                
                result.append(interactionButton);
              }

            });
            
            debug('result', result);

            resultLists[category].append(result);

          });
        }
      }
    };
  });

  client.on('error', function (err) {
    console.err("OffTheRecord:client err:", err);
  });

  client.on('ready', function () {
    searchUsers.click();
  });
});
