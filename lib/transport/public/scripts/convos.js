'use strict'

var debug = Debug('off-the-record:convos')

$(document).ready(function documentReady () {

  var client = new OffTheRecord_Client();



  // create a letter-by-letter search box to search by username, firstname, lastname
  // order results by username
  // each result gets an 'invite' button that adds them to the list of invitees
  
  var convos = [];
  var convosList = $('#convos');

  var convoInputs = $('.convoInputs');

  var startConvoInputs = {
	  createConvoBtn: $('#createConvoBtn'),
	  searchInput: $('#searchInput'),
	  searchResults: $('#searchResults'),
	  inviteesList: $('#invitees'),
	  cancelConvoBtn: $('#cancelConvoBtn'),
	  startConvoBtn: $('#startConvoBtn')
  };

  // the usernames of the users to invite
  var invitees = [];
  var users = [];

  startConvoInputs.startConvoBtn.click(function (clickEvent) {
  	convoInputs.toggle();

    var term = startConvoInputs.searchInput.val();

    searchForUsers(term);

  });

  startConvoInputs.searchInput.on('search', function onSearch (searchEvent) {

    debug('searching...')

    var term = this.value;

    searchForUsers(term);
  });

  startConvoInputs.cancelConvoBtn.click(function cancelConvoBtn_onclick (clickEvent) {
  	convoInputs.toggle();
  });

  startConvoInputs.createConvoBtn.click(function createConvoBtn_onclick (clickEvent) {

  	client.startConversation(invitees, function convoStarted (err, convo) {
  		if (err) return console.error(new Error(err));

  		convos.push(convo);

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

    var permissions = [];

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

    users.forEach(function (user, index) {
      var resultListItem = $('<li id="' + user + '"><li>');

      // if the searcher is not consented to view this user's profile, just display their username
      var username = (~permissions[index].indexOf('profile')) 
        ? '<a href="/profile/' + user + '">' + user + '</a>'
        : user.username;

      resultListItem.append(username);

      var inviteButton = $('<button>invite</button>').click(function (clickEvent) {
        // this is the tricky part...
      });
      
    });

  };

  function updateConvosList () {

  	convosList.empty();

  	convos.forEach(function convosIteration (convo) {

  		var convoTitle;
			
			if (convo.starter === client.user.username) {

			} else {
  			convoTitle = [convo.starter].concat(convo.invitees).join(', ');

  			if (convoTitle.length > 30) {
  				convoTitle = convoTitle.slice(0, 30) + '...';
  			}
			}

  		convosList.append('<li><a href="/convos/' + convo._id + '">' + convoTitle + '<a><li>');
  	});
  }
});

