"use strict";

// node.js core modules
let EventEmitter  = require('events').EventEmitter;
let util          = require('util');

// off-the-record client constructor
let Client = require('./client');

class OffTheRecord_Browser_App extends EventEmitter {
  constructor() {
    super();

    let self = this;

    const DEFAULT_VIEW = 'dashboard';

    let currentView;
    let permissions;

    let buttons       = { menu: $('#menuBtn') };
    let viewElements  = $('.pageView');

    // create an object mapping view names to their initializer functions
    let viewInitializers = new Map([
      ['profile', initProfile],
      ['search', initSearch],
      ['friends', initFriends]
    ]);

    // initialize client
    // setup client event handlers 
    this.client = new Client();

    this.client.on('error', function (err) {
      console.error("OffTheRecord:client err:", err);
    });

    this.client.on('requests:sent', function requestSent (username) {
      alert('sent friend request to ' + username);
      buttons.searchUsers.click();
      friends_update();
    });

    this.client.on('requests:received', function requestReceived (username) {
      alert('received friend request from ' + username);
      buttons.searchUsers.click();
      friends_update();
    });

    this.client.on('requests:received:accepted', function requestReceivedAccepted (username) {
      alert('You accepted ' + username + '\'s friend request');
      buttons.searchUsers.click();
      friends_update();
    });

    this.client.on('requests:sent:accepted', function requestSentAccepted (username) {
      alert(username + ' accepted your friend request');
      buttons.searchUsers.click();
      friends_update();
    });

    this.client.on('requests:received:denied', function requestReceivedDenied (username) {
      alert('You denied ' + username + '\'s friend request');
      buttons.searchUsers.click();
      friends_update();
    });

    this.client.on('requests:sent:denied', function requestSentDenied (username) {
      buttons.searchUsers.click();
      friends_update();
    });

    this.client.on('requests:received:canceled', function requestReceivedCanceled (username) {
      buttons.searchUsers.click();
      friends_update();
    });

    this.client.on('requests:sent:canceled', function requestSentCanceled (username) {
      alert('You canceled ' + username + '\'s friend request');
      buttons.searchUsers.click();
      friends_update();
    });

    this.client.on('friends:unfriended', function unfriended (unfriendedEvent) {

      if (this.user.username === unfriendedEvent.unfriender) {
        alert('You unfriended ' + unfriendedEvent.unfriended);
      }
      
      buttons.searchUsers.click();
      friends_update();
    });

    this.client.on('friends:logon', function friendLogon (friendId) {
      alert(this.user.friends[friendId].username + " logged on");
    });

    this.client.on('friends:logout', function friendLogout (friendId) {
      alert(this.user.friends[friendId].username + " logged off");
    });

    this.client.once('ready', function clientReady () {
      // initialize app state based on user session and localStorage
      initState();
      
      // initialize UI
      initUI();
      
    }); // clientReady

    function initState () {
      
    }; // initState

    function initUI () {
      let wrapper = $('#wrapper');
      let content = $('#content');

      for (let view of viewInitializers) {
        console.log('initializing view', view[0]);
        view[1]();
      }

      let lastView = localStorage.getItem('otr:view');
      let initialView = viewInitializers.has(lastView) ? lastView : DEFAULT_VIEW;

      // if there is no state, then use our initialView above
      if (!window.history.state) {
        navigate(initialView);

      // if the browser was refreshed, the state will be valid, but only update the 
      // view if the current view isn't already displayed.
      } else if (window.history.state !== currentView) {
        switchView(window.history.state);
        currentView = window.history.state;
      }

      $('#loggedOnUser').html(self.client.user.username);

      buttons.menu.on('vclick', function (tapEvent) {
        
        // State checker
        if( wrapper.attr('data-state') === 'neutral' ) {
          console.log('slide-right');
          wrapper.attr('data-state', 'slide-right');

          setTimeout(function () {
            content.on('vclick', clickMenu);
          });
          
        } else {
          console.log('slide-left');
          wrapper.attr('data-state', 'neutral');
          content.off('vclick');
        }
      });

      // buttons.menu.click();

      $('.navBtn').on('vclick', navBtnClicked);


      $('#loggedOnUser').on('vclick', navBtnClicked);
      $('#navLogout').on('vclick', logout);

      // $(window).on('resize', adjustForScrollbar);
      // adjustForScrollbar();

    }; // initUI

    function adjustForScrollbar() {

      var selector = '#wrapper';

      console.log('selector', selector);

      if ($(selector).hasVerticalScrollBar() ) {




        $('#header').addClass('scrollbar');
      } else {
        $('#header').removeClass('scrollbar');
      }
    };

    function clickMenu () { 
      buttons.menu.click();
      console.log('body click');
    }; // clickMenu

    function logout () { 

      window.location.href='/logout';

    }; // logout
    
    function navBtnClicked (event) {
      // event.preventDefault();


      let targetView = $(this).data('targetView');

      console.log('nav button clicked: %s', targetView);

      navigate(targetView);

      buttons.menu.click();

    }; // navBtnClicked

    function navigate (path) {

      console.log('attempting to navigate: ' + currentView + ' -> ' + path);

      let targetView = path.split('/')[0];
      let targetItemId = path.split('/')[1];

      console.log('targetView', targetView);
      console.log('targetItemId', targetItemId);

      if (!viewInitializers.has(targetView)) {

        let viewBeforeError = currentView;
        targetView = 'error';

        switchView(path);

      } else if (targetView !== currentView) {

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

    }; // navigate

    function switchView (path) {

      var targetView = path.split('/')[0];
      var targetItemId = path.split('/')[1];

      var pageTitle;

      console.log('currentView', currentView);
      console.log('targetView', targetView);

      let titleText = targetView.charAt(0).toUpperCase() + targetView.slice(1);

      console.log('titleText', titleText);

      var pageTitle = $('#pageTitle');

      console.log('pageTitle', pageTitle);

      $('title').text(titleText + ' | Off-The-Record');

      // fade the page title text
      pageTitle.fadeOut(100, 'swing', function () {
        pageTitle.text(titleText);
        pageTitle.fadeIn(100, 'swing', function () {

        });
      });

      // if the current view isn't set, then just fade in the target view
      if (!currentView) {
        $('#' + targetView).fadeOut(100, function () {
          $('#' + targetView).fadeIn(100, 'swing');
        });
      } else {
        // fade out the current view, then fade in the target view
        console.log('output of fadeout', $('#' + currentView).fadeOut(100, 'swing', function () {
          $('#' + targetView).fadeIn(100, 'swing');
        }));
      }

      currentView = targetView;

    }; // switchView

    // 
    // 
    // define the viewInitializer functions...
    //
    //  

    function initFriends () {

      friends_update();
    }; // initFriends

    function friends_update () {
        
      console.log('self.client.user.friends', self.client.user.friends);
      console.log('self.client.user.requests', self.client.user.requests);
      console.log('self.client.user.permissions', self.client.user.permissions);

      let users = {
        friends:  self.client.user.friends,
        sent:     self.client.user.requests.sent,
        received: self.client.user.requests.received
      };

      let userLists = {
        friends: $('#friends_list'),
        sent: $('#requests_sent'),
        received: $('#requests_received')
      };

      for (let list in users) {

        console.log('list', list);

        // userLists[list].empty();

        users[list].forEach(function (user) {

          console.log('user', user);
          
          let userListItem = $('<li></li>');

          console.log('userListItem', userListItem);

          console.log('permissions[' + user + ']', self.client.user.permissions[user]);

          let username = (~self.client.user.permissions[user].indexOf('profile')) 
            ? '<a href="/app#user/' + user + '">' + user + '</a>'
            : user;

          userListItem.append(username);

          self.client.user.permissions[user].forEach(function (permission) {

            if (permission !== 'search' && permission !== 'profile') {    
              let interactionButton = $('<button class="btn btn-default">' + permission +'</button>').on('vclick', function (clickEvent) {
                self.client[permission](user, function (err, result) {
                  if (err) {
                    console.error(err);
                  } 

                  self.client.friends(friends_update);
                });
              });

              userListItem.append(interactionButton);
            }
          });

          userLists[list].append(userListItem);        
        });
      }
    };

    function initProfile () {

      console.log('initProfile');

      let originalValues = {
        profile: {},
        privacy: {}
      };

      buttons.deleteAccount = $('#delete-account');

      buttons.profile = {
        cancel: $('#cancelProfile'),
        edit: $('#editProfile'),
        save: $('#saveProfile')
      };

      buttons.privacy = {
        cancel: $('#cancelPrivacy'),
        edit: $('#editPrivacy'),
        save: $('#savePrivacy')
      }

      buttons.profile.cancel.on('vclick', cancelProfile_onclick);
      buttons.profile.edit.on('vclick', editProfile_onclick);
      buttons.profile.save.on('vclick', saveProfile_onclick);

      buttons.privacy.cancel.on('vclick', cancelPrivacy_onclick);
      buttons.privacy.edit.on('vclick', editPrivacy_onclick);
      buttons.privacy.save.on('vclick', savePrivacy_onclick);

      buttons.profile.edit.attr('disabled', false);
      buttons.privacy.edit.attr('disabled', false);

      buttons.deleteAccount.on('vclick', deleteAccount_onclick);

      function cancelPrivacy_onclick (clickEvent) {
        clickEvent.preventDefault();

        $('#cancelPrivacy, #savePrivacy').fadeOut(100).promise().done(function () {
          $('#editPrivacy').fadeIn(100);
        });

        // remove the input elements
        $('#privacy-info select').each(function () {

          console.log('this', this);

          let property = this.id.split('privacy-')[1];
          // get the original value
          let value = originalValues.privacy[ property];

          console.log('property', property);
          console.log('value', property);

          $('#privacy-'+property).replaceWith('<span id="privacy-' +property + '" class="editable">' +value + '</span>');
        });

      }; // cancelPrivacy_onclick

      function cancelProfile_onclick (clickEvent) {
        clickEvent.preventDefault();

        $('#cancelProfile, #saveProfile').fadeOut(100).promise().done(function () {
          $('#editProfile').fadeIn(100);
        });

        // remove the input elements
        $('#profile-info input').each(function () {

          let property = this.id.split('profile-')[1];
          let value = originalValues.profile[property];

          console.log('property', property);
          console.log('value', value);

          // now set the cell to just the value rather than an input with that value
          $('#profile-' + property).replaceWith('<span id="profile-' + property + '" class="editable">' + value + '</span>');

        });

      }; // cancelProfile_onclick

      // when the user clicks the deleteAccount button...
      function deleteAccount_onclick (clickEvent) {

        clickEvent.preventDefault();

        let confirmation = 'Are you sure you want to delete your account?\n\nTHIS CANNOT BE UNDONE!\n\n Please type "delete account" below to confirm.';

        if (prompt(confirmation) === 'delete account') {
          client.deleteAccount(function (err) {
            if (err) return console.error(err);

            alert('We successfully deleted your account!');
            window.location.href='/';
          });
        }
      }; // deleteAccount_onclick

      // when the user clicks the editPrivacy button...
      function editPrivacy_onclick (clickEvent) {

        clickEvent.preventDefault();

        // 1) update the 'edit' button to say "cancel"
        // 2) change current values to input elements
        // 3) .show() / .toggle() save button

        $('#editPrivacy').fadeOut(100, function () {
          $('#cancelPrivacy, #savePrivacy').fadeIn(100);
        });

        // for each editable table cell
        $('#privacy-info .editable').each(function () {

          // this is the privacy property name
          let property = this.id.split('-')[1];
          let value = this.innerHTML;

          console.log('property', property);
          console.log('value', value)

          originalValues.privacy[property] = value;

          // create the select element
          let replacementHTML = '<select id="privacy-' + property + '">';

          // loop through each privacy property
          for (let level in client.privacy.values) {
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

      }; // // editPrivacy_onclick

      // when the user clicks the editProfile button...
      function editProfile_onclick (clickEvent) {
        clickEvent.preventDefault();

        $('#editProfile').fadeOut(100, function () {
          $('#cancelProfile, #saveProfile').fadeIn(100);
        });

        $('#profile-info .editable').each(function () {

          console.log('this', this);

          let property = this.id.split('-')[1];
          let value = this.innerHTML;

          console.log('property', property);
          console.log('value', value);

          originalValues.profile[property] = value;

          $('#profile-' + property).replaceWith('<input id="profile-' + property + '" placeholder="' + value + '" value="' + value + '" />');

        });

        console.log('originalValues.profile', originalValues.profile);

      }; // editProfile_onclick

      function savePrivacy_onclick (clickEvent) {

        clickEvent.preventDefault();

        $('#cancelPrivacy, #savePrivacy').fadeOut(100).promise().done(function () {
          $('#editPrivacy').fadeIn(100);
        });

        // setup an object that represents the updates made
        let updates = {};

        // remove the select elements
        $('#privacy-info select').each(function () {

          let property = this.id.split('privacy-')[1];
          let level = $(this).find(':selected')[0].value;

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

      }; // savePrivacy_onclick

      function saveProfile_onclick (clickEvent) {

        clickEvent.preventDefault();

        $('#cancelProfile, #saveProfile').fadeOut(100).promise().done(function () {
          $('#editProfile').fadeIn(100);
        });

        // setup an object that represents the updates made
        let updates = {};

        // remove the input elements
        $('#profile-info input').each(function () {

          let property = this.id.split('profile-')[1];

          // get the value of the input element
          let value = this.value;

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
      }; // saveProfile_onclick


    }; // initProfile

    function initSearch () {

      console.log('initSearch');

      let resultLists = {
        friends: $('#results_friends'),
        friendsOfFriends: $('#results_friends-of-friends'),
        nonFriends: $('#results_non-friends')
      };

      buttons.searchUsers = $('#search-users')
      let searchInput = $('#search-input');

      searchInput.on('search', function onSearch (searchEvent) {
        let term = this.value;
        let findParams = {};

        if (term) findParams.conditions = { username: term };

        self.client.search(findParams, searchResults);
      });

      buttons.searchUsers.on('vclick', function searchUsers_onclick (clickEvent) {
        let term = searchInput[0].value;
        let findParams = {
          conditions: { 
            username: term 
          }
        };

        self.client.search(findParams, searchResults);
      });
      
      searchInput.attr('disabled', false);
      buttons.searchUsers.attr('disabled', false);
      buttons.searchUsers.click();

      function searchResults (err, results) {
        if (err) {
          console.error(err);
        }

        console.log('results', results);

        // loop through the result categories
        for (let category in results) {

          // console.log('category', category);

          // empty the unordered list of this result category
          resultLists[category].empty();
          
          // loop through the users in this catetory
          results[category].users.forEach(function (username) {

            // console.log('results[' + category + '].users[' + key + ']', user);

            // make a simple reference to the permissions of this user
            let grantedPermissions = results[category].permissions[username];

            let result = $('<li></li>');

            // if the searcher is not consented to view this user's profile, just display their username
            
            let usernameLink = (~grantedPermissions.indexOf('profile')) 
              ? '<a href="/app#user/' + username + '">' + username + '</a>'
              : username;

            // append their username to the result list item
            result.append(usernameLink);


            // loop through the permissions
            grantedPermissions.forEach(function (permission) {

              // console.log('permission', permission);

              // they wouldn't show up if we weren't consented to search, and we already handled 
              // providing a link to their profile above
              if (permission !== 'search' && permission !== 'profile') {

                // create the base interactionButton element and store it in a local variable
                // so we don't need to give it an id to assign it a click handler
                let interactionButton = $('<button class="btn btn-default">' + permission + '</button>');

                // since we stored the element in a let, we can attach a click handler to it
                // without needing to query for an id.
                interactionButton.on('vclick', function (clickEvent) {

                  console.log('attempting to call client["' + permission + '"](...)...');
                  
                  // call the corresponding client method to handle the interaction
                  self.client[permission](username, function (err, request) {
                    if (err) {
                      console.log('error when interacting with ' + username +': ' + permission);
                      console.log('err', err);
                    } else {
                      console.log('successfully interacted with ' + username + ': ' + permission);
                    }
                  })
                });

                
                result.append(interactionButton);
              }

            });
            
            // console.log('result', result);

            resultLists[category].append(result);

          });
        };
        
      }; // searchResults

    }; // initSearch

  } // constructor 

};

global.OffTheRecord = new OffTheRecord_Browser_App();

(function($) {
  $.fn.hasVerticalScrollBar = function() {

    let element = this.get(0)

    console.log('element', $(element));

    console.log('scrollHeight', element.scrollHeight);
    console.log('offsetHeight', element.offsetHeight);
    console.log('clientHeight', element.clientHeight);

    // if scrollHeight is greater than offsetHeight, there will be overflow-y
    // and therefore the scrollbar will appear.  
    return element ? element.scrollHeight > element.offsetHeight : false;
  }
})(jQuery);
