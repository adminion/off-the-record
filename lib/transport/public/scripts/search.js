
$(document).ready(function documentReady () {

	var client = OffTheRecord();

	client.on('ready', function clientReady() {
        var searchAccounts = $('#search-accounts');
        var searchInput = $('#search-input');
        var friends = $('#friends');
        var friendsOfFriends = $('#friendsOfFriends');
        var public = $('public');

        searchAccounts.click(searchAccounts_onclick);

        function searchAccounts_onclick (clickEvent) {

        	var searchTerm = searchInput[0].value;

        	console.log('searchTerm', searchTerm);

        	client.search(searchTerm, function (err, searchResults) {

        		if (err) console.error(err);

        		console.log('searchResults', searchResults);

        		searchResults.friends.forEach(function (friend) {
        			friends.append('<li><a href="/profile/' + friend.email + '">' + friend.profile.displayName + '</a></li>');
        		});



        	});            
        }
        
    });

});
