
var debug = Debug('off-the-record:client:convos')

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

  // the usernames of the users toinviteesinviteesinvitees invite
  var invitees = [];

  startConvoInputs.startConvoBtn.click(function (clickEvent) {
  	convoInputs.toggle();
  });

  startConvoInputs.searchInput.on('search', function onSearch (searchEvent) {
    var term = this.value;
    var findParams = {};

    if (term) findParams.conditions = { username: term };

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

  function updateSearchResults () {

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

