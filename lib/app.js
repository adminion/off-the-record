"use strict";

// this allows for cool es2015 stuff that needs to be polyfilled
require("babel-polyfill");

// node.js core modules
let EventEmitter  = require('events').EventEmitter;
let util          = require('util');

let moment = require('moment');

// off-the-record client constructor
let Client = require('./client');

class OffTheRecord_Browser_App extends EventEmitter {

  // browser app constructor
  constructor() {
    // call EventEmitter's constructor
    super();

    let self = this;

    const DEFAULT_VIEW = 'dashboard';

    let currentView;
    let currentViewItem;
    let permissions;

    let buttons       = { menu: $('#menuBtn') };
    let viewElements  = $('.pageView');

    // create an object mapping view names to their initializer and optional focus functions
    let views = new Map([
      ['dashboard', {                                           }],
      ['online',    {init: initOnline                           }],                  
      ['profile',   {init: initProfile                          }],
      ['search',    {init: initSearch                           }],
      ['friends',   {init: initFriends                          }],
      ['user',      {init: initUser,      focus: focusUser      }],
      ['convos',    {init: initConvos,                          }],
      ['convo',     {init: initConvo,     focus: focusConvo     }]
    ]);

    // initialize client
    // setup client event handlers 
    this.client = new Client();

    this.client.on('error', function (err) {
      console.error("OffTheRecord:client err:", err);
    });

    this.client.on('requests:sent', function requestSent (username) {
      alert('sent friend request to ' + username);
      buttons.searchUsers.trigger('vclick')
      friends_update();
    });

    this.client.on('requests:received', function requestReceived (username) {
      alert('received friend request from ' + username);
      buttons.searchUsers.trigger('vclick')
      friends_update();
    });

    this.client.on('requests:received:accepted', function requestReceivedAccepted (username) {
      alert('You accepted ' + username + '\'s friend request');
      buttons.searchUsers.trigger('vclick')
      friends_update();
    });

    this.client.on('requests:sent:accepted', function requestSentAccepted (username) {
      alert(username + ' accepted your friend request');
      buttons.searchUsers.trigger('vclick')
      friends_update();
    });

    this.client.on('requests:received:denied', function requestReceivedDenied (username) {
      alert('You denied ' + username + '\'s friend request');
      buttons.searchUsers.trigger('vclick')
      friends_update();
    });

    this.client.on('requests:sent:denied', function requestSentDenied (username) {
      buttons.searchUsers.trigger('vclick')
      friends_update();
    });

    this.client.on('requests:received:canceled', function requestReceivedCanceled (username) {
      buttons.searchUsers.trigger('vclick')
      friends_update();
    });

    this.client.on('requests:sent:canceled', function requestSentCanceled (username) {
      alert('You canceled ' + username + '\'s friend request');
      buttons.searchUsers.trigger('vclick')
      friends_update();
    });

    this.client.on('convos:text', function convosMessage (message) {

      message.dateReceived = new Date();

      console.log('message', message);

      let convoElement = $('#' + message.convoId);

      let logEntry = util.format('\n%s %s: %s', moment(message.dateReceived).calendar(), message.sender, message.text);

      let chatLog = convoElement.find('.chatLog')

      chatLog.append(logEntry).scrollTop(chatLog[0].scrollHeight);

      self.state.addMessage(message);

      let messages = self.state.getMessages(message.convoId);

      console.log('messages', messages);

    });

    this.client.on('friends:unfriended', function unfriended (unfriendedEvent) {

      if (this.user.username === unfriendedEvent.unfriender) {
        alert('You unfriended ' + unfriendedEvent.unfriended);
      }
      
      buttons.searchUsers.trigger('vclick')
      friends_update();
    });

    this.client.on('friends:login', function friendLogon (username) {
      console.log(username + " logged in");

      console.log('this.user.onlineFriends', this.user.onlineFriends);

      let onlineFriendsList = $('#onlineFriends');
      
      let onlineFriendsListItem = $('<li data-username="' + username + '"></li>');
      
      onlineFriendsListItem.append('<img class="chat-bubble" src="/images/glyphicons/glyphicons-246-chat-flipped.png" alt="chat-bubble" />');
      onlineFriendsListItem.append(username);

      onlineFriendsList.append(onlineFriendsListItem);

    });

    this.client.on('friends:logout', function friendLogout (username) {
      console.log(username + " logged out");

      $('li[data-username="'+username+'"]').remove();

      console.log('this.user.onlineFriends', this.user.onlineFriends);
    });

    this.client.once('ready', function clientReady () {
      // initialize app state based on user session and localStorage
      initState();
      
      // initialize UI
      initUI();
      
    }); // clientReady

    function initState () {

      // get our storageImplementation (localStorage, or an immitation if not available);
      self.state = new AppState();

      function AppState () {

        const USER_PREFIX = 'otr:' + self.client.user.username;

        this.store = getStorage();

        this.addMessage = function (message) {
          let convo = this.getConvo(message.convoId);

          console.log('retrieved ')

          if (!convo) {
            convo = self.client.user.convos[message.convoId];
          }

          convo.messages.push(message);

          this.setConvo(convo);

          console.log('saved convo', this.getConvo(convo.id));
        };

        this.getMessages = function (convoId) {

          let convo = JSON.parse(this.store.getItem(USER_PREFIX + ':convos:' + convoId));

          console.log('convo', convo);

          return (convo) ? convo.messages : [];
        }

        this.setConvo = function (convo) {
          console.log('setting convo ' + convo.id + ' in state');
          console.log('convo');
          
          this.store.setItem(USER_PREFIX + ':convos:' + convo.id, JSON.stringify(convo));

          console.log('getConvo(' + convo.id + ')', this.getConvo(convo.id));
        };

        this.removeConvo = function (convoId) {
          console.log('removing convo ' + convo.id + ' from state');
          this.store.setItem(USER_PREFIX + ':convos:' + convoId, null);
        }

        this.getConvo = function (convoId) {
          return JSON.parse(this.store.getItem(USER_PREFIX + ':convos:' + convoId));
        }
      };

      function getStorage() {
        let storageImpl;

        try { 
          localStorage.setItem("storage", ""); 
          localStorage.removeItem("storage");
          storageImpl = localStorage;
        }
        catch(err) { 

          alert('Your web browser does not support storing settings locally. In Safari, the most common cause of this is using "Private Browsing Mode". Your conversations will be lost if you refresh, navigate to another page, or close this window/tab.');
          storageImpl = new LocalStorageAlternative();
        }

        return storageImpl;

      }

      function LocalStorageAlternative() {

        let structureLocalStorage = {};
        let localStorageKeys = []

        this.setItem = function (key, value) {
          structureLocalStorage[key] = value;
        }

        this.getItem = function (key) {
          if(typeof structureLocalStorage[key] != 'undefined' ) {
              return structureLocalStorage[key];
          }
          else {
              return null;
          }
        }

        this.removeItem = function (key) {
          structureLocalStorage[key] = undefined;
        }
      }
      
    }; // initState

    function initUI () {
      let wrapper = $('#wrapper');
      let content = $('#content');

      for (let [view, handlers] of views) {
        console.log('initializing view', view);
        'function' === typeof handlers.init && handlers.init();
      }

      let lastView = localStorage.getItem('otr:view');

      let initialView = (lastView && views.has(lastView.split('/')[0])) ? lastView : DEFAULT_VIEW;

      // if there is no state, then use our initialView above
      if (!window.history.state) {
        navigate(initialView);

      // if the browser was refreshed, the state will be valid, but only update the 
      // view if the current view isn't already displayed.
      } else if (window.history.state !== currentView) {
        switchView(window.history.state);
        currentView = window.history.state;
      }

      window.onpopstate = function windowPopState (event) {
        console.log('popstate', event.state);

        let hash;

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

        } else /*if (event.state !== currentView) */{
          switchView(event.state);
          currentView = event.state;
        } 

      };

      $('#loggedOnUser').html(self.client.user.username);

        buttons.menu.on('vclick', function (tapEvent) {
        console.log('content', content);
        
        // State checker
        if( wrapper.attr('data-state') === 'neutral' ) {
          console.log('slide-right');
          wrapper.attr('data-state', 'slide-right');

          setTimeout(function () {
            content.on('vclick.closeMenu', clickMenu);
          });
          
        } else {
          console.log('slide-left');
          wrapper.attr('data-state', 'neutral');
            content.off('vclick.closeMenu');
        }
      });

      // buttons.menu.trigger('vclick')

      $('.navBtn').on('vclick', navBtnClicked);


      $('#loggedOnUser').on('vclick', navBtnClicked);
      $('#navLogout').on('vclick', logout);

      // $(window).on('resize', adjustForScrollbar);
      // adjustForScrollbar();

    }; // initUI

    function adjustForScrollbar() {

      let selector = '#wrapper';

      console.log('selector', selector);

      if ($(selector).hasVerticalScrollBar() ) {




        $('#header').addClass('scrollbar');
      } else {
        $('#header').removeClass('scrollbar');
      }
    };

    function clickMenu () { 
      buttons.menu.trigger('vclick')
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

      buttons.menu.trigger('vclick');

    }; // navBtnClicked

    function navigate (path) {

      console.log('attempting to navigate: ' + currentView + ' -> ' + path);

      let targetView = path.split('/')[0];
      let targetItemId = path.split('/')[1];

      console.log('targetView', targetView);
      console.log('targetItemId', targetItemId);

      // check to see if there is NOT a view by this name
      if (!views.has(targetView)) {

        let viewBeforeError = currentView;
        targetView = 'error';

        switchView(targetView);

      } else if (targetView !== currentView) {
        
        let updatedLocation = '#' + path;

        console.log('updatedLocation', updatedLocation);

        // if the state is truthy
        if (window.history.state) {
          // push a new state
          console.log('pushing a new state');
          window.history.pushState(targetView, targetView, updatedLocation);
        } else {
          // replace the current state
          console.log('replacing the current lack of state');
          window.history.replaceState(targetView, targetView, updatedLocation);
        }

        switchView(path);

        localStorage.setItem('otr:view', path);
      } else {
        console.log('no need to navigate to the same page!');
      }

      console.log('window.history.state', window.history.state);
      console.log('history.length', window.history.length);
      console.log('currentView', currentView);

    }; // navigate

    function switchView (path) {

      let targetView = path.split('/')[0];
      
      console.log('currentView', currentView);
      console.log('targetView', targetView);

      if (views.has(targetView)) {
        let viewFocus = views.get(targetView).focus;

        if ('function' === typeof viewFocus ) {
          viewFocus();
        }
      }

      let titleText = targetView.charAt(0).toUpperCase() + targetView.slice(1);

      console.log('titleText', titleText);

      let pageTitle = $('#pageTitle');

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
    // define the viewInitializer  and focus functions...
    //
    //  
    

    function initConvo () {

      console.log('self.client.user.convos', self.client.user.convos);

      Object.keys(self.client.user.convos).forEach(convoId => {

        let convo = self.client.user.convos[convoId];

        let convoElement = $(`
          <div id="${convoId}" class="convo">
            <h1>${getConvoTitle(convo)}</h1>
            <h2>Members:</h2>
            <ul class="membersList"></ul>
            <textarea class="chatLog form-control" disabled='disabled'></textarea>
            <div class="row">
              <div class="col-md-6">
                <div class="input-group">
                  <input class="chatInput form-control" placeholder="Type here to chat!" />
                  <span class="input-group-btn">
                    <button class="chatSend btn btn-default">Send</button>
                  </span>
                </div>
              </div>
            </div>
          </div>`
        );

        let membersList = convoElement.find('.membersList');
        let chatSend = convoElement.find('.chatSend');
        let chatInput = convoElement.find('.chatInput');
        let chatLog = convoElement.find('.chatLog');

        convo.members.forEach(function (member) {
          membersList.append('<li>' + member + '</li>');
        });

        let messages = self.state.getMessages(convoId);

        console.log('messages', messages);

        messages.forEach(message => {
          let logEntry = util.format('%s %s: %s\n', moment(message.dateReceived).calendar(), message.sender, message.text);

          chatLog.append(logEntry);
        });

        console.log('convoElement', convoElement);

        chatInput.on('keyup', function keyup (event) {
          // if the return / enter key is pressed, then click the send button.
          if (event.which === 13) {
            chatSend.trigger('vclick')
          }
        });


        chatSend.on('vclick', function chatSendClicked (event) {

          console.log('clicked chatSend!', this);

          let msg = chatInput.val();

          console.log('sending message to ' + convoId, msg);

          self.client.sendMessage(convoId, msg, function messageSent (err) {
            if (err) return console.error(err);

            console.log('message sent!');

            chatInput.focus().select();
            
          });
        });

        console.log('convoElement', convoElement);

        $('#convoElements').append(convoElement);

      });
        

    }


    function focusConvo () {

      let convoId = location.hash.split('/')[1];

      console.log('convoId', convoId);

      // if there is a convoId specified in the hash
      if (convoId && convoId in self.client.user.convos) {

        let convo = self.client.user.convos[convoId];

        let convoElement = $('#' + convoId);

        console.log('convoElement', convoElement);

        if (convoElement.length === 0) {

          switchView('error');
        }

        $('.convo').fadeTo('#' + convoId);
            
      } else {
        switchView('error');
      }  
        

    };

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

      console.log('users', users);

      let userLists = {
        friends: $('#friends_list'),
        sent: $('#requests_sent'),
        received: $('#requests_received')
      };

      for (let list in users) {

        console.log('list', list);

        userLists[list].empty(); 

        users[list].forEach(function (user) {

          console.log('user', user);
          
          let userListItem = $('<li></li>');

          console.log('userListItem', userListItem);

          let userPermissions = self.client.user.permissions.get(user)

          console.log('permissions[' + user + ']', userPermissions);

          let username = (userPermissions.has('profile')) 
            ? '<a href="/app#user/' + user + '">' + user + '</a>'
            : user;

          userListItem.append(username);

          userPermissions.forEach(function (permission) {

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

    function initConvos () {

      let convoInputs = $('.convoInputs');
      let createConvoInputs = {
        createConvoBtn: $('#createConvoBtn'),
        searchInput: $('#convoSearchInput'),
        searchResults: $('#searchResults'),
        inviteesList: $('#invitees'),
        cancelConvoBtn: $('#cancelConvoBtn'),
        startConvoBtn: $('#startConvoBtn')
      };

      let convosList = $('#convosList');

      // the usernames of the users to invite
      let invitees = [];
      let resultListItems = [];
      let permissions = [];
      let users = [];

      updateConvosList();

      createConvoInputs.createConvoBtn.on('vclick', function (clickEvent) {
        convoInputs.toggle();

        let term = createConvoInputs.searchInput.val();

        searchForUsers(term);

      });

      createConvoInputs.searchInput.attr('disabled', false);

      createConvoInputs.searchInput.on('search', function onSearch (searchEvent) {

        let term = this.value;

        searchForUsers(term);
      });

      createConvoInputs.cancelConvoBtn.on('vclick', function cancelConvoBtn_onclick (clickEvent) {
        convoInputs.toggle();
      });

      createConvoInputs.startConvoBtn.on('vclick', function startConvoBtn_onclick (clickEvent) {

        console.log('starting conversation with ' + invitees);

        self.client.startConversation(invitees, function convoStarted (err, convo) {
          if (err) return console.error(err);

          console.log('conversation started! ', convo);

          self.client.user.convos[convo.id] = convo;


          updateConvosList();
        });
      });

      function searchForUsers (term) {

        console.log('term', term);

        let findParams = {};

        if (term) findParams.conditions = { username: term };

        console.log('findParams', findParams);

        self.client.search(findParams, updateSearchResults);
      }

      function updateSearchResults (err, results) {

        // when search results arrive...
        // save a list of users and their permissions
        // if the user is in invitees, set that result display to none
        // each user should have a button to hide their search result and add them to invitees
        // each user in invitees needs a button to remove them from the list of invitees.
        // when removed from invitees, if they exist in the search results, enable display of their search result

        if (err) return console.error(err);

        console.log('results', results);

        users = [];
        permissions = [];

        for (let cat in results) {
          results[cat].users.forEach(function (username, index) {
            if (~results[cat].permissions[username].indexOf('startConversation')) {
              users.push(username);
              permissions.push(results[cat].permissions[username]);
            }
          });
        }

        console.log('users', users);
        console.log('permissions', permissions);

        createConvoInputs.searchResults.empty();

        users.forEach(function (user, index) {

          console.log('user', user);

          let resultListItem = $('<li id="result-' + user + '"></li>');

          console.log('resultListItem', resultListItem);

          // resultListItem.id = user;

          // console.log('resultListItem', resultListItem);

          // if the searcher is not consented to view this user's profile, just display their username
          let username = (~permissions[index].indexOf('profile')) 
            ? '<a href="/app#user/' + user + '">' + user + '</a>'
            : user;

          username += '&nbsp';

          // add the username text node to the result list item
          resultListItem.append(username);

          // initialize our invite button
          let inviteButton = $('<button class="btn btn-default">invite</button>');

          console.log('inviteButton', inviteButton);

          // setup the click handler for the invite button
          inviteButton.click(function inviteButtonClicked (clickEvent) {
            console.log('You clicked the button to invite '+ user);

            // add the user to the invitees list
            invitees.push(user);

            // hide the result list item for the user
            resultListItem.hide();

            let inviteesListItem = $('#invitee-' + user);

            if (inviteesListItem.length === 0) {
              
              // create the list item for the invitee
              inviteesListItem = $('<li id="invitee-' + user + '" class="invitees"></li>');

              // add the username text node to the invitee list item
              inviteesListItem.append(username);

              // create the remove button for the user
              let removeButton = $('<button class="btn btn-default">remove</button>');

              removeButton.click(function removeButtonClicked (clickEvent) {

                console.log('you clicked the button to remove ' + user);

                inviteesListItem.hide();

                let index = invitees.indexOf(user);
                invitees.splice(index, 1);

                let possibleResultListItem = $('#result-' + user);

                console.log('possibleResultListItem', possibleResultListItem);

                if (possibleResultListItem.length > 0) {
                  possibleResultListItem.show();
                }
              });

              inviteesListItem.append(removeButton);

            } else {
              inviteesListItem.show();
            }

            createConvoInputs.inviteesList.append(inviteesListItem);
          });

          resultListItem.append(inviteButton);

          // if the user is in the invitees array
          if (~invitees.indexOf(user)) {

            console.log('this search result user is invited, hiding the result list item');

            resultListItem.hide();
          }

          createConvoInputs.searchResults.append(resultListItem);

        });


      };


    }; // initConvos

    function getConvoTitle (convo) {

      let otherUsers = convo.invitees.filter(invitee => {
        return (invitee !== self.client.user.username) ? true : false;
      });

      let updatedConvoTitle = otherUsers.join(', ');

      if (updatedConvoTitle.length > 30) {
        updatedConvoTitle = updatedConvoTitle.slice(0, 30) + '...';
      }

      return updatedConvoTitle;
    }; // getConvoTitle


    function updateConvosList () {

      let convos = self.client.user.convos;
      
      console.log('convos', convos);

      let convosList = $('#convosList');

      convosList.empty();

      for (let [convoId, convo] of convos) {

        console.log('convo', convo);
        console.log('convoId', convoId);

        let convoTitle;
        
        if (convo.starter.username === self.client.user.username) {

        } else {

          convoTitle = getConvoTitle(convo);

          if (convoTitle.length > 30) {
            convoTitle = convoTitle.slice(0, 30) + '...';
          }
        }

        convosList.append('<li><a href="/app#convo/' + convo.id + '">' + convoTitle + '<a><li>');
      };
    }; // updateConvosList


    function initOnline () {

      let onlineFriendsList = $('#onlineFriends');

      self.client.user.onlineFriends.forEach(friend => {

        console.log('friend', friend);

        let onlineFriendsListItem = $('<li data-username="' + friend + '"></li>');

        onlineFriendsListItem.append('<img class="chat-bubble" src="/images/glyphicons/glyphicons-246-chat-flipped.png" alt="chat-bubble" />' + friend);

        onlineFriendsList.append(onlineFriendsListItem);
      });

    }; // initOnline


    function initProfile () {

      // console.log('initProfile');

      let originalValues = {
        profile: {},
        privacy: {}
      };

      console.log('self', self);

      $('#profile-username').text(self.client.user.username);
      $('#profile-firstName').text(self.client.user.profile.firstName);
      $('#profile-lastName').text(self.client.user.profile.lastName);

      $('#privacy-info .editable').each(function () {

        console.log('this', this);

        let property = this.id.split('-')[1];
        let value = self.client.user.privacy[property];
        let readableValue = self.client.privacy[value];

        console.log('property', property);
        console.log('value', value);
        console.log('readableValue', readableValue);

        $(this).text(readableValue);

      }); 

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
          self.client.deleteAccount(function (err) {
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
          for (let level in self.client.privacy.values) {
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
          updates[property] = self.client.privacy[level];

          console.log('updates[' + property + "]", updates[property]);

          // now set the cell to just the value rather than an input with that value
          $('#privacy-'+property).replaceWith('<span id="privacy-' +property + '" class="editable">' +level+ '</span>');
        });

        console.log('updates', updates)

        self.client.updatePrivacy(updates, function (err, user) {

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

        self.client.updateProfile(updates, function(err, user) {

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
      buttons.searchUsers.trigger('vclick')

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

    function initUser () {

      

    } // initUser

    function focusUser () {

      let username = location.hash.split('/')[1];

      self.client.viewProfile(username, profileReceived);
    };

    function profileReceived (err, userInfo) {
      
      if (err) return console.error(err); 

      console.log('userInfo', userInfo);

      $('#username-heading').empty().append(userInfo.user.username);

      let userInfoList = $('#user-info').empty();

      let userInfoItem;

      Object.keys(userInfo.user.profile).forEach(function (propName) {

        if (userInfo.user.profile[propName]) {
          userInfoItem = $('<li>' + propName + ': ' + userInfo.user.profile[propName] + '</li>');

          profileTableBody.append(profileTableRow);
        }
      });

      userInfoList.append(userInfoItem);

      let interactionButtonsList = $('#interaction-buttons-list').empty();

      // loop through the permissions
      userInfo.permissions.forEach(function (permission) {

        console.log('permission', permission);

        // search is irrelevant and we already made sure we can view their profile
        if (permission !== 'search' && permission !== 'profile') {
          
          let interactionButtonListItem = $('<li></li>');

          console.log('interactionButtonListItem', interactionButtonListItem);

          // create the base interactionButton element and store it in a local variable
          // so we don't need to give it an id to assign it a click handler
          let interactionButton = $('<button class="btn btn-default">' + permission + '</button>');

          console.log('interactionButton', interactionButton);

          // since we stored the element in a var, we can attach a click handler to it
          // without needing to query for an id.
          interactionButton.click(function (clickEvent) {

            console.log('attempting to call self.client["' + permission + '"](...)...');

            if (permission === 'startConversation') {
              self.client.startConversation([userInfo.user.username], function (err, conversation) {
                if (err) console.log(err);

                window.location.href = '/app#convo/' + conversation._id
              });
            } else {
              // call the corresponding client method to handle the interaction
              self.client[permission](userInfo.user.username, function (err, request) {
                if (err) {
                  console.log('error when interacting with ' + userInfo.user.username +': ' + permission);
                } else {
                  console.log('successfully interacted with ' + userInfo.user.username + ': ' + permission);
                  interactionButton.hide();
                  self.client.viewProfile(userInfo.user.username, profileReceived);
                }
              });
            }
          });

          interactionButtonListItem.append(interactionButton);
          interactionButtonsList.append(interactionButtonListItem);
        }

      });
    }; // profileReceived

  } // constructor 

};

global.OffTheRecord = new OffTheRecord_Browser_App();

(function($) {
  $.fn.hasVerticalScrollBar = function () {

    let element = this.get(0)

    console.log('element', $(element));

    console.log('scrollHeight', element.scrollHeight);
    console.log('offsetHeight', element.offsetHeight);
    console.log('clientHeight', element.clientHeight);

    // if scrollHeight is greater than offsetHeight, there will be overflow-y
    // and therefore the scrollbar will appear.  
    return element ? element.scrollHeight > element.offsetHeight : false;
  }

  $.fn.fadeTo = function (targetSelector, speed = 200, easing = 'swing', done) {

    if (!targetSelector) {
      return console.error('fadeTo: parameter "targetSelector" is requried.');
    }

    console.log('this', this);

    let srcSelector = this;

    if (srcSelector) {
      console.log('fading from ' + srcSelector + ' to ' + targetSelector);
      // fade the page title text
      $(srcSelector).fadeOut(speed/2, easing).promise().done(function () {
        $(targetSelector).fadeIn(speed, easing, function () {
          'function' === typeof done && done();
        });
      });
    } else {
      console.log('fading to ' + targetSelector);
      $(targetSelector).fadeIn(speed/2, easing, function () {
        'function' === typeof done && done();
      });
    }
  }
})(jQuery);
