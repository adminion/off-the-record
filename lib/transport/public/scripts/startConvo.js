/**
 *  lib/transport/public/scripts/startConvo.js
 * 
 *
 */

var accounts = [];

var invited = [];

$(document).ready(function documentReady () {

    OffTheRecord.connect(clientReady);

    function clientReady() {
        console.log('off-the-record client ready!');

        OffTheRecord.getFriends(function (err, friends) {

            accounts = friends;

            var addInvitee = $('#addInvitee');

            addInvitee.on('search', onSearch)
                .attr('enabled', true);

        });

        var startConvo = $('#startConvo').click(startConvo_onClick);

        function addInvitee_onSearch (searchEvent) {

            console.log('this', this);

            value = this.value;

            console.log('value', value);

            var suggestions = searchAccounts(value);
            var suggestionsDefault = '<div id="searchSuggestions"><ul id="suggestionList"></ul><div>';   
            var searchSuggestions = $('#searchSuggestions');
            var suggestionList = $('#suggestionList');

            console.log('suggestionList', suggestionList);

            if (suggestions.length === 0) {
                searchSuggestions.hide();

            } else {

                $('#suggestionList li').remove();

                suggestions.forEach(function (suggestion) {

                    var suggestedListItem = $('<li id="account-' + suggestion.id + '">' + suggestion.displayName + '</li>');

                    suggestedListItem.click(function (clickEvent) {
                        console.log(this.innerText + ' will be invited.');

                        accounts.splice(accounts.indexOf(suggestion), 1);

                        invited.push(suggestion)

                        var newlyInvited = $('<li id="account-' + suggestion.id + '">' + suggestion.displayName + '</li>');

                        newlyInvited.click(function (clickEvent) {

                            console.log(this.innerText + ' will not be invited.');

                            invited.splice(invited.indexOf(suggestion), 1);
                            accounts.push(suggestion);

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

            OffTheRecord.startConversation(invites, function (convo) {

                var windowObjectReference,
                    strUrl = '/convos/' + convo._id,
                    strWindowName = '/convos/' + convo._id
                    strWindowFeatures = "resizable,scrollbars,status";

                windowObjectReference = window.open(strUrl, strWindowName, strWindowFeatures);
                
            });
        };
    }

});

function searchAccounts (query) {

    console.log('search query: "', query, '"' );

    if (query === '') {
        return [];
    }

    var numSuggestions = 20;
    var suggestions = []

    var searchPattern = new RegExp(escapeRegExp(query),'i');



    console.log('searchPattern', searchPattern);
    console.log('accounts', accounts);

    for (var i=0; i < accounts.length; i++) {
        var account = accounts[i];
        console.log('account', account);

        if (account.displayName.search(searchPattern) > -1) {
            console.log('pattern match!')
            suggestions.push(account);

            if (suggestions.length === numSuggestions) {
                console.log('max suggestions limit reached; search complete!')
                break;
            }
        }
    }

    console.log('suggestions', suggestions);

    return suggestions;

};

function escapeRegExp(str) {
  return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
}
