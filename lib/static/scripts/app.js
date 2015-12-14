
console.log('history.state', window.history.state);
console.log('history.length', window.history.length);

(function($) {
    $.fn.hasVerticalScrollBar = function() {

      var element = this.get(0)

      console.log('element', $(element));

      console.log('scrollHeight', element.scrollHeight);
      console.log('offsetHeight', element.offsetHeight);
      console.log('clientHeight', element.clientHeight);

      // if scrollHeight is greater than offsetHeight, there will be overflow-y
      // and therefore the scrollbar will appear.  
      return element ? element.scrollHeight > element.offsetHeight : false;
    }
})(jQuery);

$(document).ready(function () {

  var DEFAULT_VIEW = 'dashboard';
  var currentView;

  var viewElements = $('.pageView');
  var views = {};

  var permissions;

  var userLists = {
    friends:  $('#friends_list'),
    sent:     $('#requests_sent'),
    received: $('#requests_received')
  };

  var resultLists = {
    friends: $('#results_friends'),
    friendsOfFriends: $('#results_friends-of-friends'),
    nonFriends: $('#results_non-friends')
  };

  var buttons = {
    menu: $('#menuBtn'),
    deleteAccount : $('#delete-account'),
    profile : {
      cancel: $('#cancelProfile'),
      edit: $('#editProfile'),
      save: $('#saveProfile')
    },
    privacy: {
      cancel: $('#cancelPrivacy'),
      edit: $('#editPrivacy'),
      save: $('#savePrivacy')
    }
  };

  var searchUsers = $('#search-users').attr('disabled', true);
  var searchInput = $('#search-input').attr('disabled', true);

  var originalValues = {
    profile: {},
    privacy: {}
  };

  buttons.menu.on('tap', function (tapEvent) {

    var wrapper = $('#wrapper');
    
    // State checker
    if( wrapper.attr('data-state') === 'neutral' ) {
      console.log('slide-right');
      wrapper.attr('data-state', 'slide-right');

      setTimeout(function () {
        $('#content').on('tap', clickMenu);
      }, 1);

    } else {
      console.log('slide-left');
      wrapper.attr('data-state', 'neutral');
      $('#content').off('tap');
    }
  });

  // buttons.menu.tap();

  $('.navBtn').on('tap', navBtnClicked);

  // adjustForScrollbar();

  // $(window).on('resize', adjustForScrollbar);

  var client = new OffTheRecord_Client();

  client.on('error', function (err) {
    console.err("OffTheRecord:client err:", err);
  });

  client.on('requests:sent', function requestSent (username) {
    alert('sent friend request to ' + username);
    searchUsers.click();
    client.friends(gotFriends);
  });

  client.on('requests:received', function requestReceived (username) {
    alert('received friend request from ' + username);
    searchUsers.click();
    client.friends(gotFriends);
  });

  client.on('requests:received:accepted', function requestReceivedAccepted (username) {
    alert('You accepted ' + username + '\'s friend request');
    searchUsers.click();
    client.friends(gotFriends);
  });

  client.on('requests:sent:accepted', function requestSentAccepted (username) {
    alert(username + ' accepted your friend request');
    searchUsers.click();
    client.friends(gotFriends);
  });

  client.on('requests:received:denied', function requestReceivedDenied (username) {
    alert('You denied ' + username + '\'s friend request');
    searchUsers.click();
    client.friends(gotFriends);
  });

  client.on('requests:sent:denied', function requestSentDenied (username) {
    searchUsers.click();
    client.friends(gotFriends);
  });

  client.on('requests:received:canceled', function requestCanceled (username) {
    searchUsers.click();
    client.friends(gotFriends);
  });

  client.on('requests:sent:canceled', function requestCanceled (username) {
    alert('You canceled ' + username + '\'s friend request');
    searchUsers.click();
    client.friends(gotFriends);
  });

  client.on('friends:unfriended', function unfriended (unfriendedEvent) {

    if (this.user.username === unfriendedEvent.unfriender) {
      alert('You unfriended ' + unfriendedEvent.unfriended);
    }
    
    searchUsers.click();
    client.friends(gotFriends);
  });

  client.on('friends:logon', function friendLogon (friendId) {
    alert(this.user.friends[friendId].username + " logged on");
  });

  client.on('friends:logout', function friendLogout (friendId) {
    alert(this.user.friends[friendId].username + " logged off");
  });

  client.once('ready', function clientReady () {

    viewElements.each(function (index, viewElement) {
      views[viewElement.id] = viewElement;

      console.log('viewElement', viewElement);

      // register our view attribute change event handler
      // new MutationObserver(viewInitializers[viewElement.id])
      //   .observe(viewElement, { attributes: true });
    });

    console.log('views', views);
    
    var lastView = localStorage.getItem('otr:view');
    var initialView = (lastView in views) ? lastView : DEFAULT_VIEW;

    // if there is no state, then use our initialView above
    if (!window.history.state) {
      navigate(initialView);

    // if the browser was refreshed, the state will be valid, but only update the 
    // view if the current view isn't already displayed.
    } else if (window.history.state !== currentView) {
      switchView(window.history.state);
      currentView = window.history.state;
    }

      // register the attribute mutation observer for each view
    searchUsers.click();
    friends_update();
  
    searchInput.attr('disabled', false);
    searchUsers.attr('disabled', false);

    $('#loggedOnUser').html(client.user.username);
    $('#loggedOnUser').on('tap', navBtnClicked);
    $('#navLogout').on('tap', logout);

    $('#profile-username').html(client.user.username);

    $('#profile-firstName').html(client.user.profile.firstName);
    $('#profile-lastName').html(client.user.profile.lastName);
    $('#privacy-profile').html(client.privacy[client.user.privacy.profile]);
    $('#privacy-search').html(client.privacy[client.user.privacy.search]);
    $('#privacy-friendRequest').html(client.privacy[client.user.privacy.friendRequest]);
    $('#privacy-startConversation').html(client.privacy[client.user.privacy.startConversation]);

    searchInput.on('search', function onSearch (searchEvent) {
      var term = this.value;
      var findParams = {};

      if (term) findParams.conditions = { username: term };

      client.search(findParams, searchResults);
    });

    searchUsers.click(function searchUsers_onclick (clickEvent) {
      var term = searchInput[0].value;
      var findParams = {
        conditions: { 
          username: term 
        }
      };

      client.search(findParams, searchResults);
    });


    

    buttons.profile.cancel.on('tap', cancelProfile_onclick);
    buttons.profile.edit.on('tap', editProfile_onclick);
    buttons.profile.save.on('tap', saveProfile_onclick);

    buttons.privacy.cancel.on('tap', cancelPrivacy_onclick);
    buttons.privacy.edit.on('tap', editPrivacy_onclick);
    buttons.privacy.save.on('tap', savePrivacy_onclick);

    buttons.profile.edit.attr('disabled', false);
    buttons.privacy.edit.attr('disabled', false);

    buttons.deleteAccount.on('tap', deleteAccount_onclick);

    function cancelPrivacy_onclick (clickEvent) {
      clickEvent.preventDefault();

      $('#cancelPrivacy, #savePrivacy').fadeToggle(100).promise().done(function () {
        $('#editPrivacy').fadeToggle(100);
      });

      // remove the input elements
      $('#privacy-info select').each(function () {

        console.log('this', this);

        var property = this.id.split('privacy-')[1];
        // get the original value
        var value = originalValues.privacy[ property];

        console.log('property', property);
        console.log('value', property);

        $('#privacy-'+property).replaceWith('<span id="privacy-' +property + '" class="editable">' +value + '</span>');
      });

    }

    function cancelProfile_onclick (clickEvent) {
      clickEvent.preventDefault();

      $('#cancelProfile, #saveProfile').fadeToggle(100).promise().done(function () {
        $('#editProfile').fadeToggle(100);
      });

      // remove the input elements
      $('#profile-info input').each(function () {

        var property = this.id.split('profile-')[1];
        var value = originalValues.profile[property];

        console.log('property', property);
        console.log('value', value);

        // now set the cell to just the value rather than an input with that value
        $('#profile-' + property).replaceWith('<span id="profile-' + property + '" class="editable">' + value + '</span>');

      });

    }

    // when the user clicks the deleteAccount button...
    function deleteAccount_onclick (clickEvent) {

      clickEvent.preventDefault();

      var confirmation = 'Are you sure you want to delete your account?\n\nTHIS CANNOT BE UNDONE!\n\n Please type "delete account" below to confirm.';

      if (prompt(confirmation) === 'delete account') {
        client.deleteAccount(function (err) {
          if (err) return console.error(err);

          alert('We successfully deleted your account!');
          window.location.href='/';
        });
      }
    }

    // when the user clicks the editPrivacy button...
    function editPrivacy_onclick (clickEvent) {

      clickEvent.preventDefault();

      // 1) update the 'edit' button to say "cancel"
      // 2) change current values to input elements
      // 3) .show() / .toggle() save button

      $('#editPrivacy').fadeToggle(100, function () {
        $('#cancelPrivacy, #savePrivacy').fadeToggle(100);
      });

      // for each editable table cell
      $('#privacy-info .editable').each(function () {

        // this is the privacy property name
        var property = this.id.split('-')[1];
        var value = this.innerHTML;

        console.log('property', property);
        console.log('value', value)

        originalValues.privacy[property] = value;

        // create the select element
        var replacementHTML = '<select id="privacy-' + property + '">';

        // loop through each privacy property
        for (var level in client.privacy.values) {
          console.log('level', level);

          if (! (property === 'friendRequest' && level === 'FRIENDS')) {
            replacementHTML += '<option';
            
            if (level === value) {
              replacementHTML += ' selected';
            }

            replacementHTML += '>' + level + '</option>';
          }
        }

        replacementHTML += '</select>';

        $('#privacy-' + property).replaceWith(replacementHTML);

      });

      console.log('originalValues.privacy', originalValues.privacy)

    }

    // when the user clicks the editProfile button...
    function editProfile_onclick (clickEvent) {
      clickEvent.preventDefault();

      $('#editProfile').fadeToggle(100, function () {
        $('#cancelProfile, #saveProfile').fadeToggle(100);
      });

      $('#profile-info .editable').each(function () {

        console.log('this', this);

        var property = this.id.split('-')[1];
        var value = this.innerHTML;

        console.log('property', property);
        console.log('value', value);

        originalValues.profile[property] = value;

        $('#profile-' + property).replaceWith('<input id="profile-' + property + '" placeholder="' + value + '" value="' + value + '" />');

      });

      console.log('originalValues.profile', originalValues.profile);

    }

    function savePrivacy_onclick (clickEvent) {

      clickEvent.preventDefault();

      $('#cancelPrivacy, #savePrivacy').fadeToggle(100).promise().done(function () {
        $('#editPrivacy').fadeToggle(100);
      });

      // setup an object that represents the updates made
      var updates = {};

      // remove the select elements
      $('#privacy-info select').each(function () {

        var property = this.id.split('privacy-')[1];
        var level = $(this).find(':selected')[0].value;

        console.log('property', property);
        console.log('level', level);

        // save the value to updates by the property name of the labeling cell
        updates[property] = client.privacy[level];

        console.log('updates[' + property + "]", updates[property]);

        // now set the cell to just the value rather than an input with that value
        $('#privacy-'+property).replaceWith('<span id="privacy-' +property + '" class="editable">' +level+ '</span>');
      });

      console.log('updates', updates)

      client.updatePrivacy(updates, function (err, user) {

        if (err) {
          console.error(err);
        } else {
          alert('privacy updated!');

          console.log('updatedUser', user);
          
        }
      });

    };

    function saveProfile_onclick (clickEvent) {

      clickEvent.preventDefault();

      $('#cancelProfile, #saveProfile').fadeToggle(100).promise().done(function () {
        $('#editProfile').fadeToggle(100);
      });

      // setup an object that represents the updates made
      var updates = {};

      // remove the input elements
      $('#profile-info input').each(function () {

        var property = this.id.split('profile-')[1];

        // get the value of the input element
        var value = this.value;

        console.log('property', property); 
        console.log('value', value);

        // save the value to updates by the property name of the labeling cell
        updates[property] = value

        // now set the cell to just the value rather than an input with that value
        $('#profile-' + property).replaceWith('<span id="profile-' + property + '" class="editable">' + value + '</span>');
      });

      console.log('updates', updates)

      client.updateProfile(updates, function(err, user) {

        if (err) {
          console.error(err);
        } else {
          alert('profile updated!');

          console.log('updatedUser', user);
          
        }
      });
    }


  });

  function friends_update () {
    
    console.log('client.user.friends', client.user.friends);
    console.log('client.user.requests', client.user.requests);
    console.log('permissions', permissions);

    var users = {
      friends:  client.user.friends,
      sent:     client.user.requests.sent,
      received: client.user.requests.received
    };

    for (var list in users) {

      console.log('list', list);

      userLists[list].empty();

      users[list].forEach(function (user) {

        console.log('user', user);
        
        var userListItem = $('<li></li>');

        console.log('userListItem', userListItem);

        console.log('permissions[' + user + ']', client.user.permissions[user]);

        var username = (~client.user.permissions[user].indexOf('profile')) 
          ? '<a href="/app#profile?user=' + user + '">' + user + '</a>'
          : user;

        userListItem.append(username);

        client.user.permissions[user].forEach(function (permission) { 


          if (permission !== 'search' && permission !== 'profile') {    
            var interactionButton = $('<button>' + permission +'</button>').click(function (clickEvent) {
              client[permission](user, function (err, result) {
                if (err) {
                  console.error(err);
                } 

                client.friends(gotFriends);
              });
            });

            userListItem.append(interactionButton);
          }
        });

        userLists[list].append(userListItem);        
      });
    }
  };

  function searchResults (err, results) {
    if (err) {
      console.error(err);
    }

    console.log('results', results);

    // loop through the result categories
    for (var category in results) {

      // console.log('category', category);

      // empty the unordered list of this result category
      resultLists[category].empty();
      
      // loop through the users in this catetory
      results[category].users.forEach(function (user, key) {

        // console.log('results[' + category + '].users[' + key + ']', user);

        // make a simple reference to the permissions of this user
        var permissions = results[category].permissions[key];

        var result = $('<li></li>');

        // if the searcher is not consented to view this user's profile, just display their username
        var username = (~permissions.indexOf('profile')) 
          ? '<a href="/profile/' + user.username + '">' + user.username + '</a>'
          : user.username;

        // append their username to the result list item
        result.append(username);


        // loop through the permissions
        permissions.forEach(function (permission) {

          // console.log('permission', permission);

          // they wouldn't show up if we weren't consented to search, and we already handled 
          // providing a link to their profile above
          if (permission !== 'search' && permission !== 'profile') {

            // create the base interactionButton element and store it in a local variable
            // so we don't need to give it an id to assign it a click handler
            var interactionButton = $('<button>' + permission + '</button>');

            // since we stored the element in a var, we can attach a click handler to it
            // without needing to query for an id.
            interactionButton.click(function (clickEvent) {

              console.log('attempting to call client["' + permission + '"](...)...');
              
              // call the corresponding client method to handle the interaction
              client[permission](user.username, function (err, request) {
                if (err) {
                  console.log('error when interacting with ' + user.username +': ' + permission);
                  console.log('err', err);
                } else {
                  console.log('successfully interacted with ' + user.username + ': ' + permission);
                }
              })
            });

            
            result.append(interactionButton);
          }

        });
        
        // console.log('result', result);

        resultLists[category].append(result);

      });
    }
    
  };

  var viewInitializers = {

  };

  window.onpopstate = function (event) {
    console.log('popstate', event.state);

    var hash;

    // if no state is set, then this is a new entry from manually changing the hash
    if (!event.state) {

      hash = location.hash

      // make sure that the hash is actually set
      if (hash) {
        // navigate to the new hash
        navigate(hash.split('#')[1]);
      } else {
        navigate(initialView);
      }

    } else if (event.state !== currentView) {
      switchView(event.state);
      currentView = event.state;
    }

  };

  function adjustForScrollbar() {

    var selector = '#wrapper';

    console.log('selector', selector);

    if ($(selector).hasVerticalScrollBar() ) {




      $('#header').addClass('scrollbar');
    } else {
      $('#header').removeClass('scrollbar');
    }
  }

  function switchView (path) {

    var targetView = path.split('?')[0]

    var pageTitle;

    console.log('currentView', currentView);
    console.log('targetView', targetView);

    titleText = targetView.charAt(0).toUpperCase() + targetView.slice(1);

    console.log('titleText', titleText);

    var pageTitle = $('#pageTitle');

    console.log('pageTitle', pageTitle);

    $('title').text(titleText + ' | Off-The-Record');

    // fade the page title text
    pageTitle.fadeOut(100, 'swing', function () {
      pageTitle.text(titleText);
      pageTitle.fadeIn(100, 'swing');
    });

    // if the current view isn't set, then just fade in the target view
    if (!currentView) {
      $('#' + targetView).fadeOut(100, function () {
        $('#' + targetView).fadeIn(100, 'swing');
      });
    }

    // fade out the current view, then fade in the target view
    console.log('output of fadeout', $('#' + currentView).fadeOut(100, 'swing', function () {
      $('#' + targetView).fadeIn(100, 'swing');
    }));

    currentView = targetView;
  };

  function clickMenu () { 
    buttons.menu.tap();
    console.log('body click');
  };

  function navBtnClicked () {

    var targetView = $(this).data('targetView');

    console.log('nav button clicked: %s', targetView);

    navigate(targetView);

    buttons.menu.tap();

  };

  function navigate (path) {

    console.log('attempting to navigate: ' + currentView + ' -> ' + path);

    targetView = path.split('/')[0];
    targetItemId = path.split('/')[1];

    console.log('targetView', targetView);
    console.log('targetItemId', targetItemId);

    if (! (targetView in views )) {

      var viewBeforeError = currentView;
      targetView = 'error';

      switchView(path);

    }



    if (targetView !== currentView) {

      // if the is set
      if (window.history.state) {
        // push a new state
        console.log('pushing a new state');
        window.history.pushState(targetView, targetView, '#' + path);
      } else {
        // replace the current state
        console.log('replacing the current lack of state');
        window.history.replaceState(targetView, targetView, '#' + path);
      }

      switchView(path);

      localStorage.setItem('otr:view', targetView);
    } else {
      console.log('no need to navigate to the same page!');
    }

    console.log('window.history.state', window.history.state);
    console.log('history.length', window.history.length);
    console.log('currentView', currentView);

  };

  function logout () { 

    window.location.href='/logout';

  };
    
});



