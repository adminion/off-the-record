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

  startConvoInputs.startConvoBtn.click(function (clickEvent) {
  	convoInputs.toggle();
  });

  startConvoInputs.searchInput.on('search', function onSearch (searchEvent) {

    debug('searching...')

    var term = this.value;

    debug('term', term);

    var findParams = {};

    if (term) findParams.conditions = { username: term };

    debug('findParams', findParams);

    client.search(findParams, updateSearchResults);
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

  function updateSearchResults (err, searchResults) {

    // when search results arrive...
    // we need to keep a list of the users (and whether or not we can view their profile)
    // each user should have a button to move them from the search results to the list of invitees
    // we also need to be able to remove a user from the list of invitees
    // if a user is in the list of invitees, they should not be displayed in the search results
    // 

    if (err) return console.error(err);

    debug('searchResults', searchResults);

    var results = [];
    var permissions = [];

    for (var cat in searchResults) {
      searchResults[cat].users.forEach(function (user, index) {
        if (~searchResults[cat].permissions[index].indexOf('startConversation')) {
          results.push(user.username);
          permissions.push(searchResults[cat].permissions[index]);
        }
      });
    }

    debug('results', results);
    debug('permissions', permissions);

    results.forEach(function (user, index) {
      var resultListItem = $('<li><li>');

      // if the searcher is not consented to view this user's profile, just display their username
      var username = (~permissions[index].indexOf('profile')) 
        ? '<a href="/profile/' + user.username + '">' + user.username + '</a>'
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

