'use strict'

var debug = Debug('off-the-record:convos')

$(document).ready(function documentReady () {

  var client = new OffTheRecord_Client();



  // create a letter-by-letter search box to search by username, firstname, lastname
  // order results by username
  // each result gets an 'invite' button that adds them to the list of invitees
  
  var convosList = $('#convosList');

  var convoInputs = $('.convoInputs');

  var createConvoInputs = {
	  createConvoBtn: $('#createConvoBtn'),
	  searchInput: $('#searchInput'),
	  searchResults: $('#searchResults'),
	  inviteesList: $('#invitees'),
	  cancelConvoBtn: $('#cancelConvoBtn'),
	  startConvoBtn: $('#startConvoBtn')
  };

  // the usernames of the users to invite
  var invitees = [];
  var resultListItems = [];
  var permissions = [];
  var users = [];

  createConvoInputs.createConvoBtn.click(function (clickEvent) {
  	convoInputs.toggle();

    var term = createConvoInputs.searchInput.val();

    searchForUsers(term);

  });

  createConvoInputs.searchInput.on('search', function onSearch (searchEvent) {

    var term = this.value;

    searchForUsers(term);
  });

  createConvoInputs.cancelConvoBtn.click(function cancelConvoBtn_onclick (clickEvent) {
  	convoInputs.toggle();
  });

  createConvoInputs.startConvoBtn.click(function startConvoBtn_onclick (clickEvent) {

    debug('starting conversation with ' + invitees);

  	client.startConversation(invitees, function convoStarted (err, convo) {
  		if (err) return console.error(err);

      debug('conversation started! ', convo);

  		client.user.convos.push(convo);

  		updateConvosList();
  	});
  });

  client.on('error', function clientError(err) {
  	console.error(err);
  });

  client.on('ready', function clientReady () {

  });

  function searchForUsers (term) {

    debug('term', term);

    var findParams = {};

    if (term) findParams.conditions = { username: term };

    debug('findParams', findParams);

    client.search(findParams, updateSearchResults);
  }

  function updateSearchResults (err, results) {

    // when search results arrive...
    // save a list of users and their permissions
    // if the user is in invitees, set that result display to none
    // each user should have a button to hide their search result and add them to invitees
    // each user in invitees needs a button to remove them from the list of invitees.
    // when removed from invitees, if they exist in the search results, enable display of their search result

    if (err) return console.error(err);

    debug('results', results);

    users = [];
    permissions = [];

    for (var cat in results) {
      results[cat].users.forEach(function (user, index) {
        if (~results[cat].permissions[index].indexOf('startConversation')) {
          users.push(user.username);
          permissions.push(results[cat].permissions[index]);
        }
      });
    }

    debug('users', users);
    debug('permissions', permissions);

    createConvoInputs.searchResults.empty();

    users.forEach(function (user, index) {

      debug('user', user);

      var resultListItem = $('<li id="result-' + user + '"></li>');

      debug('resultListItem', resultListItem);

      // resultListItem.id = user;

      // debug('resultListItem', resultListItem);

      // if the searcher is not consented to view this user's profile, just display their username
      var username = (~permissions[index].indexOf('profile')) 
        ? '<a href="/profile/' + user + '">' + user + '</a>'
        : user;

      // add the username text node to the result list item
      resultListItem.append(username);

      // initialize our invite button
      var inviteButton = $('<button>invite</button>');

      debug('inviteButton', inviteButton);

      // setup the click handler for the invite button
      inviteButton.click(function inviteButtonClicked (clickEvent) {
        debug('You clicked the button to invite '+ user);

        // add the user to the invitees list
        invitees.push(user);

        // hide the result list item for the user
        resultListItem.hide();

        var inviteesListItem = $('#invitee-' + user);

        if (inviteesListItem.length === 0) {
          
          // create the list item for the invitee
          inviteesListItem = $('<li id="invitee-' + user + '"></li>');

          // add the username text node to the invitee list item
          inviteesListItem.append(username);

          // create the remove button for the user
          var removeButton = $('<button>remove</button>');

          removeButton.click(function removeButtonClicked (clickEvent) {

            debug('you clicked the button to remove ' + user);

            inviteesListItem.hide();

            var index = invitees.indexOf(user);
            invitees.splice(index, 1);

            var possibleResultListItem = $('#result-' + user);

            debug('possibleResultListItem', possibleResultListItem);

            if (possibleResultListItem.length > 0) {
              possibleResultListItem.show();
            }
          });

          inviteesListItem.append(removeButton);

        } else {
          inviteesListItem.show();
        }

        createConvoInputs.inviteesList.append(inviteesListItem);
      });

      resultListItem.append(inviteButton);

      // if the user is in the invitees array
      if (~invitees.indexOf(user)) {

        debug('this search result user is invited, hiding the result list item');

        resultListItem.hide();
      }

      createConvoInputs.searchResults.append(resultListItem);

    });


  };

  function updateConvosList () {

    debug('convos', convos);

  	convosList.empty();

  	client.user.convos.forEach(function convosIteration (convo) {

  		var convoTitle;
			
			if (convo.starter.username === client.user.username) {

			} else {
  			convoTitle = [convo.starter.username].concat(convo.invitees).join(', ');

  			if (convoTitle.length > 30) {
  				convoTitle = convoTitle.slice(0, 30) + '...';
  			}
			}

  		convosList.append('<li><a href="/convos/' + convo._id + '">' + convoTitle + '<a><li>');
  	});
  }
});

