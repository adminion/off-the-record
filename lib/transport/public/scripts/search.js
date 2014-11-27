
$(document).ready(function documentReady () {

	var client = OffTheRecord();

	client.once('ready', function clientReady() {
        var searchAccounts = $('#search-accounts').attr('disabled', false);
        var searchInput = $('#search-input').attr('disabled', false);

        var resultLists = {
        	friends: $('#friends'),
        	friendsOfFriends: $('#friendsOfFriends'),
        	nonFriends: $('#non-friends')
        };

        searchInput.on('search', function onSearch (searchEvent) {

        	client.search(this.value, null, searchResults);

        });

        searchAccounts.click(function searchAccounts_onclick (clickEvent) {

        	var searchTerm = searchInput[0].value;

        	console.log('searchTerm', searchTerm);

        	client.search(searchTerm, null, searchResults);
        }).click();

        function searchResults (err, results) {
    		if (err) {
    			console.error(err);
    		}

    		console.log('results', results);

    		if (results) {
    			for (var category in results) {
                    resultLists[category].empty();
    				results[category].forEach(eachAccount);
    			}
        		
        		function eachAccount (account) {
        			resultLists[category].append('<li><a href="/profile/' + account.email + '">' + account.profile.displayName + '</a></li>');
        		}
    		}
    	};
    });
});
