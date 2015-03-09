
var debug = Debug('off-the-record:client:search')

$(document).ready(function documentReady () {

	var client = new OffTheRecord_Client();

    var searchUsers = $('#search-users').attr('disabled', false);
    var searchInput = $('#search-input').attr('disabled', false);

    var resultLists = {
        friends: $('#friends'),
        friendsOfFriends: $('#friendsOfFriends'),
        nonFriends: $('#non-friends')
    };

	client.once('ready', function clientReady() {
        searchInput.on('search', function onSearch (searchEvent) {

        	client.search(this.value, null, searchResults);

        });

        searchUsers.click(function searchUsers_onclick (clickEvent) {

        	var searchTerm = searchInput[0].value;

        	console.log('searchTerm', searchTerm);

        	client.search(searchTerm, null, searchResults);
        });

        function searchResults (err, results) {
    		if (err) {
    			console.error(err);
    		}

    		console.log('results', results);

    		if (results) {
    			for (var category in results) {
                    resultLists[category].empty();
    				results[category].forEach(function (user) {
        			    resultLists[category].append('<li><a href="/profile/' + user.username + '">' + user.username + '</a></li>');
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
