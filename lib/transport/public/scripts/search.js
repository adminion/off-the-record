
$(document).ready(function documentReady () {

	var client = OffTheRecord();

	client.once('ready', function clientReady() {
        var searchAccounts = $('#search-accounts');
        var searchInput = $('#search-input');

        var resultLists = {
        	friends: $('#friends'),
        	friendsOfFriends: $('#friendsOfFriends'),
        	nonFriends: $('#non-friends')
        };

        searchAccounts.click(searchAccounts_onclick);

        function searchAccounts_onclick (clickEvent) {

        	var searchTerm = searchInput[0].value;

        	console.log('searchTerm', searchTerm);

        	client.search(searchTerm, null, function (err, searchResults) {

        		if (err) {
        			console.error(err);
        		}

        		console.log('searchResults', searchResults);

        		if (searchResults) {
        			for (var category in searchResults) {
        				searchResults[category].forEach(eachAccount);
        			}
	        		
	        		function eachAccount (account) {
	        			resultLists[category].empty()
	        				.append('<li><a href="/profile/' + account.email + '">' + account.profile.displayName + '</a></li>');
	        		}

        		}



        	});            
        }
        
    });

});
