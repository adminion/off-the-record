
var debug = Debug('off-the-record:client:user')

$(document).ready(function documentReady () {

  var client = new OffTheRecord_Client();

  client.once('ready', function clientReady() {

    var username = client.pageId();

    debug('username', username);

    client.viewProfile(username, function (err, userInfo) {
      
      if (err) return console.error(err); 

      $('#username-heading').append(userInfo.user.username);

      var profileTable = $('#profile-table');

      var profileTableBody = $('<tbody></tbody>');

      Object.keys(userInfo.user.profile).forEach(function (propName) {

        if (userInfo.user.profile[propName]) {
          var profileTableRow = $('<tr><td>' + propName + '</td><td>' + userInfo.user.profile[propName] + '</td></tr>');

          profileTableBody.append(profileTableRow);
        }
      });

      profileTable.append(profileTableBody);

      var interactionButtonsList = $('#interaction-buttons-list');

      // loop through the consentedInteractions
      userInfo.consentedInteractions.forEach(function (consentedInteraction) {

        debug('consentedInteraction', consentedInteraction);

        // search is irrelevant and we already made sure we can view their profile
        if (consentedInteraction !== 'search' && consentedInteraction !== 'profile') {
          
          var interactionButtonListItem = $('<li></li>');

          // create the base interactionButton element and store it in a local variable
          // so we don't need to give it an id to assign it a click handler
          var interactionButton = $('<button>' + consentedInteraction + '</button>');

          // since we stored the element in a var, we can attach a click handler to it
          // without needing to query for an id.
          interactionButton.click(function (clickEvent) {

            debug('attempting to call client["' + consentedInteraction + '"](...)...');

            if (consentedInteraction === 'startConversation') {
              client.startConversation([user.username], function (err, conversation) {
                window.location.href = '/conversations/' + conversation._id
              });
            } else {
              // call the corresponding client method to handle the interaction
              client[consentedInteraction](user.username, function (err, request) {
                if (err) {
                  debug('error when interacting with ' + user.username +': ' + consentedInteraction);
                } else {
                  debug('successfully interacted with ' + user.username + ': ' + consentedInteraction);
                  interactionButton.hide();
                  searchUsers.click();
                }
              });
            }
          });

          interactionButtonListItem.append(interactionButton);
          interactionButtonsList.append(interactionButtonListItem);
        }

      });


    });
    
  });
});
