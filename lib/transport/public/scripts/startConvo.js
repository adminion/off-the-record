/**
 *  lib/transport/public/scripts/startConvo.js
 * 
 *
 *
 *
 */

var debug = Debug('off-the-record:client:startConvo')

var users = [];

var invited = [];

$(document).ready(function documentReady () {

    OffTheRecord_Client.connect(clientReady);

    function clientReady() {
        console.log('off-the-record client ready!');

        OffTheRecord_Client.getFriends(function (err, friends) {

            if (err) {
                console.err(err);
            }

            users = friends;

            console.log('users', users);

            var addInvitee = $('#addInvitee');

            addInvitee.on('search', addInvitee_onSearch);
            addInvitee.attr('disabled', false);

        });

        var startConvo = $('#startConvo').click(startConvo_onClick);

        function addInvitee_onSearch (searchEvent) {

            function searchUsers (query) {

                function escapeRegExp(str) {
                    return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
                }

                console.log('search query: "', query, '"' );

                if (query === '') {
                    return [];
                }

                var numSuggestions = 20;
                var suggestions = []

                var searchPattern = new RegExp(escapeRegExp(query),'i');

                console.log('searchPattern', searchPattern);
                console.log('users', users);

                for (var i=0; i < users.length; i++) {
                    var user = users[i];
                    console.log('user', user);

                    if (user.displayName.search(searchPattern) > -1) {
                        console.log('pattern match!')
                        suggestions.push(user);

                        if (suggestions.length === numSuggestions) {
                            console.log('max suggestions limit reached; search complete!')
                            break;
                        }
                    }
                }

                console.log('suggestions', suggestions);

                return suggestions;

            };

            console.log('this', this);

            value = this.value;

            console.log('value', value);

            var suggestions = searchUsers(value);
            var suggestionsDefault = '<div id="searchSuggestions"><ul id="suggestionList"></ul><div>';   
            var searchSuggestions = $('#searchSuggestions');
            var suggestionList = $('#suggestionList');

            console.log('suggestionList', suggestionList);

            if (suggestions.length === 0) {
                searchSuggestions.hide();

            } else {

                $('#suggestionList li').remove();

                suggestions.forEach(function (suggestion) {

                    var suggestedListItem = $('<li id="user-' + suggestion.id + '">' + suggestion.displayName + '</li>');

                    suggestedListItem.click(function (clickEvent) {
                        console.log(this.innerText + ' will be invited.');

                        users.splice(users.indexOf(suggestion), 1);

                        invited.push(suggestion)

                        var newlyInvited = $('<li id="user-' + suggestion.id + '">' + suggestion.displayName + '</li>');

                        newlyInvited.click(function (clickEvent) {

                            console.log(this.innerText + ' will not be invited.');

                            invited.splice(invited.indexOf(suggestion), 1);
                            users.push(suggestion);

                            newlyInvited.remove();

                            if (invited.length === 0 ) {
                                $('#invitees').hide();
                            }

                            addInvitee.trigger('search');

                        });

                        $('#invited').append(newlyInvited);
                        $('#invitees').show();

                        index = suggestions.indexOf(suggestion);
                        suggestions.splice(index, 1);

                        suggestedListItem.remove(); 

                        if (suggestions.length === 0) {
                            searchSuggestions.hide();
                        }

                    });

                    console.log('suggestedListItem', suggestedListItem);

                    suggestionList.append(suggestedListItem);

                });

                console.log('suggestionList', suggestionList)

                searchSuggestions.show();
            }
        };

        function startConvo_onClick (clickEvent) {

            var invites = []

            invited.forEach(function (invitee) {
                invites.push(invitee.id);
            });

            OffTheRecord_Client.startConversation(invites, function (convo) {

                var windowObjectReference,
                    strUrl = '/convos/' + convo._id,
                    strWindowName = '/convos/' + convo._id
                    strWindowFeatures = "resizable,scrollbars,status";

                windowObjectReference = window.open(strUrl, strWindowName, strWindowFeatures);
                
            });
        };
    }

});




