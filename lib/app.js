"use strict";

/* eslint-env browser, jquery */

// this allows for cool es2015 stuff that needs to be polyfilled
require("babel-polyfill");

// node.js core modules
let EventEmitter  = require('events').EventEmitter;
let util          = require('util');
let debug         = require('debug');

let moment = require('moment');

// off-the-record client constructorte
let Client = require('./client');
let Notifier = require('./notifier');

class OffTheRecord_Browser_App extends EventEmitter {

  // browser app constructor
  constructor() {
    // call EventEmitter's constructor
    super();

    const DEFAULT_VIEW = 'dashboard';

    let self = this;

    self.log = debug('off-the-record');
    self.notifier = new Notifier();

    let currentView;
    let currentConvo;

    let elems = { 
      convos: {},
      menu: $('#menuBtn') 
    };
    
    // create an object mapping view names to their initializer and optional focus functions
    let views = new Map([
      ['dashboard', {                                           }],
      ['online',    {init: initOnline                           }],                  
      ['profile',   {init: initProfile                          }],
      ['search',    {init: initSearch                           }],
      ['friends',   {init: initFriends                          }],
      ['user',      {init: initUser,      focus: focusUser      }],
      ['convos',    {init: initConvos                           }],
      ['convo',     {init: initConvo,     focus: focusConvo     }]
    ]);

    // initialize client
    // setup client event handlers 
    this.client = new Client();

    this.client.on('error', function (err) {
      console.error("OffTheRecord:client err:", err);
    });

    this.client.on('requests:sent', function requestSent (username) {
      self.notifier.alert({ 
        type: Notifier.Alert.styles.SUCCESS,
        message: 'You sent a friend request to ' + username
      });

      elems.searchUsers.trigger('vclick')
      friends_update();
    });

    this.client.on('requests:received', function requestReceived (username) {
      self.notifier.alert({ 
        type: Notifier.Alert.styles.INFO,
        message: 'You\'ve received friend request from ' + username
      });

      elems.searchUsers.trigger('vclick')
      friends_update();
    });

    this.client.on('requests:received:accepted', function requestReceivedAccepted (username) {
      self.notifier.alert({ 
        type: Notifier.Alert.styles.SUCCESS,
        message: 'You accepted ' + username + '\'s friend request'
      });

      elems.searchUsers.trigger('vclick')
      friends_update();
    });

    this.client.on('requests:sent:accepted', function requestSentAccepted (username) {
      self.notifier.alert({ 
        type: Notifier.Alert.styles.INFO,
        message: username + ' accepted your friend request'
      });

      elems.searchUsers.trigger('vclick')
      friends_update();
    });

    this.client.on('requests:received:denied', function requestReceivedDenied (username) {
      self.notifier.alert({ 
        type: Notifier.Alert.styles.SUCCESS,
        message: 'You denied ' + username + '\'s friend request'
      });

      elems.searchUsers.trigger('vclick')
      friends_update();
    });

    this.client.on('requests:sent:denied', function requestSentDenied () {
      elems.searchUsers.trigger('vclick')
      friends_update();
    });

    this.client.on('requests:received:canceled', function requestReceivedCanceled () {
      elems.searchUsers.trigger('vclick')
      friends_update();
    });

    this.client.on('requests:sent:canceled', function requestSentCanceled (username) {
      self.notifier.alert({ 
        type: Notifier.Alert.styles.SUCCESS,
        message: 'You canceled ' + username + '\'s friend request'
      });

      elems.searchUsers.trigger('vclick')
      friends_update();
    });

    this.client.on('convos:text', function convosMessage (message) {

      if (!(currentView === 'convo' && location.hash.split('/')[1] === message.convoId)) {
        self.notifier.alert({ 
          type: Notifier.Alert.styles.INFO,
          message: 'You\'ve received a <a href="#convo/'+ message.convoId + '">message</a> from ' + message.sender 
        });
      }

      message = new self.client.TextMessage(message);

      self.log('message', message);

      let logEntry = util.format('<li>%s %s: %s</li>', moment(message.dateReceived).calendar(), message.sender, message.text);

      let chatLog = elems.convos[message.convoId].children.chatLog;

      chatLog.append(logEntry).scrollTop(chatLog[0].scrollHeight);

      self.state.addMessage(message);

      let messages = self.state.getMessages(message.convoId);

      self.log('messages', messages);

    });

    this.client.on('friends:unfriended', function unfriended (unfriendedEvent) {

      if (this.user.username === unfriendedEvent.unfriender) {
        self.notifier.alert({ 
          type: Notifier.Alert.styles.SUCCESS,
          message: 'You unfriended ' + unfriendedEvent.unfriended
        });

      }
      
      elems.searchUsers.trigger('vclick')
      friends_update();
    });

    this.client.on('friends:login', function friendLogon (username) {

      self.log(username + " logged in");

      self.notifier.alert({ 
        type: Notifier.Alert.styles.INFO,
        message:  username + ' logged in'
      });

      self.log('this.user.onlineFriends', this.user.onlineFriends);

      let onlineFriendsList = $('#onlineFriends');

      if (this.user.onlineFriends.size === 1) {
        $('.noOneOnline').hide();
      }
      
      let onlineFriendsListItem = $('<li data-username="' + username + '"></li>');
      
      onlineFriendsListItem.append('<img class="chat-bubble" src="/images/glyphicons/glyphicons-246-chat-flipped.png" alt="chat-bubble" />');
      onlineFriendsListItem.append(username);

      onlineFriendsList.append(onlineFriendsListItem);

    });

    this.client.on('friends:logout', function friendLogout (username) {
      self.log(username + " logged out");

      self.notifier.alert({ 
        type: Notifier.Alert.styles.INFO,
        message: username + ' logged out'
      });

      if (this.user.onlineFriends.size === 0) {
        $('.noOneOnline').show();
      }


      $('li[data-username="'+username+'"]').remove();

      self.log('this.user.onlineFriends', this.user.onlineFriends);
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

        const USER_PREFIX = 'otr:users:' + self.client.user.username;

        self.log('AppState:USER_PREFIX', USER_PREFIX);

        this.store = getStorage();

        this.addMessage = function (message) {
          let convo = this.getConvo(message.convoId);

          self.log('retrieved ')

          if (!convo) {
            convo = self.client.user.convos[message.convoId];
          }

          convo.messages.push(message);

          this.setConvo(convo);

          self.log('saved convo', this.getConvo(convo.id));
        };

        this.getMessages = function (convoId) {

          let convo = JSON.parse(this.store.getItem(USER_PREFIX + ':convos:' + convoId));

          self.log('convo', convo);

          let messages = [];

          if (convo) {
            convo.messages.forEach(function (message) {
              messages[messages.length] = new self.client.TextMessage(message);
            });
          }

          return messages;
        }

        this.setConvo = function (convo) {
          self.log('setting convo ' + convo.id + ' in state');
          self.log('convo', convo);

          let strConvo = JSON.stringify(convo);
          
          this.store.setItem(USER_PREFIX + ':convos:' + convo.id, strConvo);

          self.log('getConvo(' + convo.id + ')', this.getConvo(convo.id));
        };

        this.removeConvo = function (convoId) {
          self.log('removing convo ' + convoId + ' from state');
          this.store.setItem(USER_PREFIX + ':convos:' + convoId, null);
        }

        this.getConvo = function (convoId) {
          return JSON.parse(this.store.getItem(USER_PREFIX + ':convos:' + convoId));
        }
      }

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
      
    } // initState

    function initUI () {
      let wrapper = $('#wrapper');
      let content = $('#content');

      for (let [view, handlers] of views) {
        self.log('initializing view', view);
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
        self.log('popstate', event.state);

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

        elems.menu.on('vclick', function () {
        self.log('content', content);
        
        // State checker
        if( wrapper.attr('data-state') === 'neutral' ) {
          self.log('slide-right');
          wrapper.attr('data-state', 'slide-right');

          setTimeout(function () {
            content.on('vclick.closeMenu', clickMenu);
          });
          
        } else {
          self.log('slide-left');
          wrapper.attr('data-state', 'neutral');
            content.off('vclick.closeMenu');
        }
      });

      // elems.menu.trigger('vclick')

      $('.navBtn').on('vclick', navBtnClicked);


      $('#loggedOnUser').on('vclick', navBtnClicked);
      $('#navLogout').on('vclick', logout);

      // $(window).on('resize', adjustForScrollbar);
      // adjustForScrollbar();

    } // initUI

    function clickMenu () { 
      elems.menu.trigger('vclick')
      self.log('body click');
    } // clickMenu

    function logout () { 

      window.location.href='/logout';

    } // logout
    
    function navBtnClicked () {
      // event.preventDefault();


      let targetView = $(this).data('targetView');

      self.log('nav button clicked: %s', targetView);

      navigate(targetView);

      elems.menu.trigger('vclick');

    } // navBtnClicked

    function navigate (path) {

      self.log('attempting to navigate: ' + currentView + ' -> ' + path);

      let targetView = path.split('/')[0];
      let targetItemId = path.split('/')[1];

      self.log('targetView', targetView);
      self.log('targetItemId', targetItemId);

      self.log('are we prepared to switch to view "' + targetView +'"?', views.has(targetView));

      // check to see if there is NOT a view by this name
      if (!views.has(targetView)) {

        self.log('this view target does not exist!', targetView);

        targetView = 'error';

        switchView(targetView);

      } else if (targetView !== currentView) {
        
        let updatedLocation = '#' + path;

        self.log('updatedLocation', updatedLocation);

        // if the state is truthy
        if (window.history.state) {
          // push a new state
          self.log('pushing a new state');
          window.history.pushState(targetView, targetView, updatedLocation);
        } else {
          // replace the current state
          self.log('replacing the current lack of state');
          window.history.replaceState(targetView, targetView, updatedLocation);
        }

        switchView(path);

        localStorage.setItem('otr:view', path);
      } else {
        self.log('no need to navigate to the same page!');
      }

      self.log('window.history.state', window.history.state);
      self.log('history.length', window.history.length);
      self.log('currentView', currentView);

    } // navigate

    function switchView (path) {

      self.log('path', path);

      let targetView = path.split('/')[0];
      
      self.log('currentView', currentView);
      self.log('targetView', targetView);

      let titleText = targetView.charAt(0).toUpperCase() + targetView.slice(1);

      self.log('titleText', titleText);

      let pageTitle = $('#pageTitle');

      self.log('pageTitle', pageTitle);

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
          $('#' + targetView).fadeIn(100, 'swing', function () {
            runFocus();
          });
        });
      } else {
        // fade out the current view, then fade in the target view
        self.log('output of fadeout', $('#' + currentView).fadeOut(100, 'swing', function () {
          $('#' + targetView).fadeIn(100, 'swing', function () {
            runFocus();
          });
        }));
      }

      function runFocus () {
        if (views.has(targetView)) {
          let viewFocus = views.get(targetView).focus;

          if ('function' === typeof viewFocus ) {
            viewFocus();
          }
        }
      }

      currentView = targetView;

    } // switchView

    // 
    // 
    // define the viewInitializer  and focus functions...
    //
    //  
    

    function initConvo () {

      self.log('self.client.user.convos', self.client.user.convos);

      self.client.user.convos.forEach((convo, convoId) => {

        // self.log('convoId', convoId);
        self.log('convo', convo);

        convo.messages = self.state.getMessages(convoId);
        self.state.setConvo(convo);

        elems.convos[convoId] = {
          elem: $(`
            <div id="${convoId}" class="convo">
              <h1>${getConvoTitle(convo)}</h1>
              <h2>Members:</h2>
              <span class="members"></span>
              <ul class="chatLog"></ul>
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
          )
        };

        let convoElement = elems.convos[convoId].elem

        // self.log('convoElement', convoElement);

        $('#convoElements').append(convoElement);

        elems.convos[convoId].children = {
          members: $('#' + convoId + ' .members'),
          chatSend: $('#' + convoId + ' .chatSend'),
          chatInput: $('#' + convoId + ' .chatInput'),
          chatLog: $('#' + convoId + ' .chatLog')
        }

        let { members, chatSend, chatInput, chatLog } = elems.convos[convoId].children;

        let str_members = convo.members.join(', ');

        self.log('str_members', str_members);

        members.append(str_members);

        let messages = convo.messages;

        // self.log('messages', messages);

        messages.forEach((message, index) => {

          let logEntry = util.format('<li>%s %s: %s</li>', moment(message.dateReceived).fromNow(), message.sender, message.text);

          if (index && index < messages.length -1) {
            logEntry += '\n';
          }

          // scroll to the bottom
          chatLog.append(logEntry);

        });

        chatInput.on('keyup', function keyup (event) {
          // if the return / enter key is pressed, then click the send button.
          if (event.which === 13) {
            chatSend.trigger('vclick')
          }
        });


        chatSend.on('vclick', function chatSendClicked () {

          self.log('clicked chatSend!', this);

          let msg = chatInput.val();

          self.log('sending message to ' + convoId, msg);

          self.client.sendMessage(convoId, msg, function messageSent (err) {
            if (err) return console.error(err);

            self.log('message sent!');

            chatInput.focus().select();
            
          });
        });

      });
        

    }


    function focusConvo () {

      let convoId = location.hash.split('/')[1];

      self.log('focusConvo', convoId);
 
      // if there is a convoId specified in the hash
      if (convoId && self.client.user.convos.has(convoId)) {

        if (convoId !== currentConvo) {

          let convoElement = $('#' + convoId);

          self.log('convoElement', convoElement);

          if (convoElement.length === 0) {

            switchView('error');
          }



          $('#convoElements .convo[display="block"]').fadeTo('#' + convoId, 200, 'swing', function () {
            let chatLog = convoElement.find('.chatLog');

            self.log('chatLog', chatLog);

            chatLog.scrollTop(chatLog.get(0).scrollHeight - chatLog.get(0).clientHeight);
          });
        }            
      } else {
        switchView('error');
      }  
        

    }

    function initFriends () {

      friends_update();
    } // initFriends

    function friends_update () {
        
      self.log('self.client.user.friends', self.client.user.friends);
      self.log('self.client.user.requests', self.client.user.requests);
      self.log('self.client.user.permissions', self.client.user.permissions);

      let users = {
        friends:  self.client.user.friends,
        sent:     self.client.user.requests.sent,
        received: self.client.user.requests.received
      };

      self.log('users', users);

      let userLists = {
        friends: $('#friends_list'),
        sent: $('#requests_sent'),
        received: $('#requests_received')
      };

      for (let list in users) {

        self.log('list', list);

        userLists[list].empty(); 

        users[list].forEach(function (user) {

          self.log('user', user);
          
          let userListItem = $('<li></li>');

          self.log('userListItem', userListItem);

          let userPermissions = self.client.user.permissions.get(user)

          self.log('permissions[' + user + ']', userPermissions);

          let username = (userPermissions.has('profile')) 
            ? '<a href="/app#user/' + user + '">' + user + '</a>'
            : user;

          userListItem.append(username);

          userPermissions.forEach(function (permission) {

            if (permission !== 'search' && permission !== 'profile') {    
              let interactionButton = $('<button class="btn btn-default">' + permission +'</button>').on('vclick', function () {
                self.client[permission](user, function (err) {
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
    }

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

      // the usernames of the users to invite
      let invitees = [];
      let permissions = [];
      let users = [];

      updateConvosList();

      createConvoInputs.createConvoBtn.on('vclick', function () {
        convoInputs.toggle();

        let term = createConvoInputs.searchInput.val();

        searchForUsers(term);

      });

      createConvoInputs.searchInput.attr('disabled', false);

      createConvoInputs.searchInput.on('search', function onSearch () {

        let term = this.value;

        searchForUsers(term);
      });

      createConvoInputs.cancelConvoBtn.on('vclick', function cancelConvoBtn_onclick () {
        convoInputs.toggle();
      });

      createConvoInputs.startConvoBtn.on('vclick', function startConvoBtn_onclick () {

        self.log('starting conversation with ' + invitees);

        self.client.startConversation(invitees, function convoStarted (err, convo) {
          if (err) return console.error(err);

          self.log('conversation started! ', convo);

          self.client.user.convos[convo.id] = convo;


          updateConvosList();
        });
      });

      function searchForUsers (term) {

        self.log('term', term);

        let findParams = {};

        if (term) findParams.conditions = { username: term };

        self.log('findParams', findParams);

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

        self.log('results', results);

        users = [];
        permissions = [];

        for (let cat in results) {
          results[cat].users.forEach(function (username) {
            if (~results[cat].permissions[username].indexOf('startConversation')) {
              users.push(username);
              permissions.push(results[cat].permissions[username]);
            }
          });
        }

        self.log('users', users);
        self.log('permissions', permissions);

        createConvoInputs.searchResults.empty();

        users.forEach(function (user, index) {

          self.log('user', user);

          let resultListItem = $('<li id="result-' + user + '"></li>');

          self.log('resultListItem', resultListItem);

          // resultListItem.id = user;

          // self.log('resultListItem', resultListItem);

          // if the searcher is not consented to view this user's profile, just display their username
          let username = (~permissions[index].indexOf('profile')) 
            ? '<a href="/app#user/' + user + '">' + user + '</a>'
            : user;

          username += '&nbsp';

          // add the username text node to the result list item
          resultListItem.append(username);

          // initialize our invite button
          let inviteButton = $('<button class="btn btn-default">invite</button>');

          self.log('inviteButton', inviteButton);

          // setup the click handler for the invite button
          inviteButton.click(function inviteButtonClicked () {
            self.log('You clicked the button to invite '+ user);

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

              removeButton.click(function removeButtonClicked () {

                self.log('you clicked the button to remove ' + user);

                inviteesListItem.hide();

                let index = invitees.indexOf(user);
                invitees.splice(index, 1);

                let possibleResultListItem = $('#result-' + user);

                self.log('possibleResultListItem', possibleResultListItem);

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

            self.log('this search result user is invited, hiding the result list item');

            resultListItem.hide();
          }

          createConvoInputs.searchResults.append(resultListItem);

        });


      }


    } // initConvos

    function getConvoTitle (convo) {

      let otherUsers = [];

      convo.members.forEach(member => {

        self.log('member', member);

        if (member !== self.client.user.username) {
          otherUsers.push(member)
        }
      });

      self.log('otherUsers', otherUsers);

      let updatedConvoTitle = otherUsers.join(', ');

      if (updatedConvoTitle.length > 30) {
        updatedConvoTitle = updatedConvoTitle.slice(0, 30) + '...';
      }

      return updatedConvoTitle;
    } // getConvoTitle


    function updateConvosList () {

      let convos = self.client.user.convos;
      
      self.log('convos', convos);

      let convosList = $('#convosList');

      convosList.empty();

      for (let [convoId, convo] of convos) {

        self.log('convoId', convoId);
        self.log('convo', convo);

        let convoTitle;
        
        convoTitle = getConvoTitle(convo);

        if (convoTitle.length > 30) {
          convoTitle = convoTitle.slice(0, 30) + '...';
        }

        convosList.append('<li><a href="/app#convo/' + convo.id + '">' + convoTitle + '<a><li>');
      }
    } // updateConvosList


    function initOnline () {

      let onlineFriendsList = $('#onlineFriends');

      if (self.client.user.onlineFriends.size === 0) {

        $('.noOneOnline').show();

      } else {

        self.client.user.onlineFriends.forEach(friend => {

          self.log('friend', friend);

          let onlineFriendsListItem = $('<li data-username="' + friend + '"></li>');

          onlineFriendsListItem.append('<img class="chat-bubble" src="/images/glyphicons/glyphicons-246-chat-flipped.png" alt="chat-bubble" />' + friend);

          onlineFriendsList.append(onlineFriendsListItem);
        });

      }


    } // initOnline


    function initProfile () {

      // self.log('initProfile');

      let originalValues = {
        profile: {},
        privacy: {}
      };

      // self.log('self', self);

      $('#profile-username').text(self.client.user.username);
      $('#profile-firstName').text(self.client.user.profile.firstName);
      $('#profile-lastName').text(self.client.user.profile.lastName);

      $('#privacy-info .editable').each(function () {

        // self.log('this', this);

        let property = this.id.split('-')[1];
        let value = self.client.user.privacy[property];
        let readableValue = self.client.privacy[value];

        // self.log('property', property);
        // self.log('value', value);
        // self.log('readableValue', readableValue);

        $(this).text(readableValue);

      }); 

      elems.deleteAccount = $('#delete-account');

      elems.profile = {
        cancel: $('#cancelProfile'),
        edit: $('#editProfile'),
        save: $('#saveProfile')
      };

      elems.privacy = {
        cancel: $('#cancelPrivacy'),
        edit: $('#editPrivacy'),
        save: $('#savePrivacy')
      }

      elems.profile.cancel.on('vclick', cancelProfile_onclick);
      elems.profile.edit.on('vclick', editProfile_onclick);
      elems.profile.save.on('vclick', saveProfile_onclick);

      elems.privacy.cancel.on('vclick', cancelPrivacy_onclick);
      elems.privacy.edit.on('vclick', editPrivacy_onclick);
      elems.privacy.save.on('vclick', savePrivacy_onclick);

      elems.profile.edit.attr('disabled', false);
      elems.privacy.edit.attr('disabled', false);

      elems.deleteAccount.on('vclick', deleteAccount_onclick);

      function cancelPrivacy_onclick (clickEvent) {
        clickEvent.preventDefault();

        $('#cancelPrivacy, #savePrivacy').fadeOut(100).promise().done(function () {
          $('#editPrivacy').fadeIn(100);
        });

        // remove the input elements
        $('#privacy-info select').each(function () {

          // self.log('this', this);

          let property = this.id.split('privacy-')[1];
          // get the original value
          let value = originalValues.privacy[ property];

          // self.log('property', property);
          // self.log('value', property);

          $('#privacy-'+property).replaceWith('<span id="privacy-' +property + '" class="editable">' +value + '</span>');
        });

      } // cancelPrivacy_onclick

      function cancelProfile_onclick (clickEvent) {
        clickEvent.preventDefault();

        $('#cancelProfile, #saveProfile').fadeOut(100).promise().done(function () {
          $('#editProfile').fadeIn(100);
        });

        // remove the input elements
        $('#profile-info input').each(function () {

          let property = this.id.split('profile-')[1];
          let value = originalValues.profile[property];

          // self.log('property', property);
          // self.log('value', value);

          // now set the cell to just the value rather than an input with that value
          $('#profile-' + property).replaceWith('<span id="profile-' + property + '" class="editable">' + value + '</span>');

        });

      } // cancelProfile_onclick

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
      } // deleteAccount_onclick

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

          // self.log('property', property);
          // self.log('value', value)

          originalValues.privacy[property] = value;

          // create the select element
          let replacementHTML = '<select id="privacy-' + property + '">';

          // loop through each privacy property
          for (let level in self.client.privacy.values) {
            // self.log('level', level);

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

        // self.log('originalValues.privacy', originalValues.privacy)

      } // // editPrivacy_onclick

      // when the user clicks the editProfile button...
      function editProfile_onclick (clickEvent) {
        clickEvent.preventDefault();

        $('#editProfile').fadeOut(100, function () {
          $('#cancelProfile, #saveProfile').fadeIn(100);
        });

        $('#profile-info .editable').each(function () {

          // self.log('this', this);

          let property = this.id.split('-')[1];
          let value = this.innerHTML;

          // self.log('property', property);
          // self.log('value', value);

          originalValues.profile[property] = value;

          $('#profile-' + property).replaceWith('<input id="profile-' + property + '" placeholder="' + value + '" value="' + value + '" />');

        });

        // self.log('originalValues.profile', originalValues.profile);

      } // editProfile_onclick

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

          // self.log('property', property);
          // self.log('level', level);

          // save the value to updates by the property name of the labeling cell
          updates[property] = self.client.privacy[level];

          // self.log('updates[' + property + "]", updates[property]);

          // now set the cell to just the value rather than an input with that value
          $('#privacy-'+property).replaceWith('<span id="privacy-' +property + '" class="editable">' +level+ '</span>');
        });

        self.log('updates', updates)

        self.client.updatePrivacy(updates, function (err, user) {

          if (err) {
            console.error(err);
          } else {
            alert('privacy updated!');

            // self.log('updatedUser', user);
            
          }
        });

      } // savePrivacy_onclick

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

          // self.log('property', property); 
          // self.log('value', value);

          // save the value to updates by the property name of the labeling cell
          updates[property] = value

          // now set the cell to just the value rather than an input with that value
          $('#profile-' + property).replaceWith('<span id="profile-' + property + '" class="editable">' + value + '</span>');
        });

        // self.log('updates', updates)

        self.client.updateProfile(updates, function(err, user) {

          if (err) {
            console.error(err);
          } else {
            alert('profile updated!');

            user;
            // self.log('updatedUser', user);
            
          }
        });
      } // saveProfile_onclick


    } // initProfile

    function initSearch () {

      self.log('initSearch');

      let resultLists = {
        friends: $('#results_friends'),
        friendsOfFriends: $('#results_friends-of-friends'),
        nonFriends: $('#results_non-friends')
      };

      elems.searchUsers = $('#search-users')
      let searchInput = $('#search-input');

      searchInput.on('search', function onSearch () {
        let term = this.value;
        let findParams = {};

        if (term) findParams.conditions = { username: term };

        self.client.search(findParams, searchResults);
      });

      elems.searchUsers.on('vclick', function searchUsers_onclick () {
        let term = searchInput[0].value;
        let findParams = {
          conditions: { 
            username: term 
          }
        };

        self.client.search(findParams, searchResults);
      });
      
      searchInput.attr('disabled', false);
      elems.searchUsers.attr('disabled', false);
      elems.searchUsers.trigger('vclick')

      function searchResults (err, results) {
        if (err) {
          console.error(err);
        }

        self.log('results', results);

        // loop through the result categories
        for (let category in results) {

          // self.log('category', category);

          // empty the unordered list of this result category
          resultLists[category].empty();
          
          // loop through the users in this catetory
          results[category].users.forEach(function (username) {

            // self.log('results[' + category + '].users[' + key + ']', user);

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

              // self.log('permission', permission);

              // they wouldn't show up if we weren't consented to search, and we already handled 
              // providing a link to their profile above
              if (permission !== 'search' && permission !== 'profile') {

                // create the base interactionButton element and store it in a local variable
                // so we don't need to give it an id to assign it a click handler
                let interactionButton = $('<button class="btn btn-default">' + permission + '</button>');

                // since we stored the element in a let, we can attach a click handler to it
                // without needing to query for an id.
                interactionButton.on('vclick', function () {

                  self.log('attempting to call client["' + permission + '"](...)...');
                  
                  // call the corresponding client method to handle the interaction
                  self.client[permission](username, function (err) {
                    if (err) {
                      self.log('error when interacting with ' + username +': ' + permission);
                      self.log('err', err);
                    } else {
                      self.log('successfully interacted with ' + username + ': ' + permission);
                    }
                  })
                });

                
                result.append(interactionButton);
              }

            });
            
            // self.log('result', result);

            resultLists[category].append(result);

          });
        }
        
      } // searchResults

    } // initSearch

    function initUser () {

      

    } // initUser

    function focusUser () {

      let username = location.hash.split('/')[1];

      self.client.viewProfile(username, profileReceived);
    }

    function profileReceived (err, userInfo) {
      
      if (err) return console.error(err); 

      self.log('userInfo', userInfo);

      $('#username-heading').empty().append(userInfo.user.username);

      let userInfoList = $('#user-info').empty();

      let userInfoItem;

      Object.keys(userInfo.user.profile).forEach(function (propName) {

        if (userInfo.user.profile[propName]) {
          userInfoItem = $('<li>' + propName + ': ' + userInfo.user.profile[propName] + '</li>');

          userInfoList.append(userInfoItem);
        }
      });

      let interactionButtonsList = $('#interaction-buttons-list').empty();

      // loop through the permissions
      userInfo.permissions.forEach(function (permission) {

        self.log('permission', permission);

        // search is irrelevant and we already made sure we can view their profile
        if (permission !== 'search' && permission !== 'profile') {
          
          let interactionButtonListItem = $('<li></li>');

          self.log('interactionButtonListItem', interactionButtonListItem);

          // create the base interactionButton element and store it in a local variable
          // so we don't need to give it an id to assign it a click handler
          let interactionButton = $('<button class="btn btn-default">' + permission + '</button>');

          self.log('interactionButton', interactionButton);

          // since we stored the element in a var, we can attach a click handler to it
          // without needing to query for an id.
          interactionButton.click(function () {

            self.log('attempting to call self.client["' + permission + '"](...)...');

            if (permission === 'startConversation') {
              self.client.startConversation([userInfo.user.username], function (err, conversation) {
                if (err) self.log(err);

                window.location.href = '/app#convo/' + conversation._id
              });
            } else {
              // call the corresponding client method to handle the interaction
              self.client[permission](userInfo.user.username, function (err) {
                if (err) {
                  self.log('error when interacting with ' + userInfo.user.username +': ' + permission);
                } else {
                  self.log('successfully interacted with ' + userInfo.user.username + ': ' + permission);
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
    } // profileReceived

  } // constructor 

}

global.OffTheRecord = new OffTheRecord_Browser_App();

(function($) {
  $.fn.hasVerticalScrollBar = function () {

    let element = this.get(0)

    // console.log('element', $(element));

    // console.log('scrollHeight', element.scrollHeight);
    // console.log('offsetHeight', element.offsetHeight);
    // console.log('clientHeight', element.clientHeight);

    // if scrollHeight is greater than offsetHeight, there will be overflow-y
    // and therefore the scrollbar will appear.  
    return element ? element.scrollHeight > element.offsetHeight : false;
  }

  $.fn.fadeTo = function (targetSelector, speed = 200, easing = 'swing', done) {

    if (!targetSelector) {
      return console.error('fadeTo: parameter "targetSelector" is requried.');
    }

    // console.log('this', this);

    let srcSelector = this;

    if (srcSelector) {
      // console.log('fading from ' + srcSelector + ' to ' + targetSelector);
      // fade the page title text
      $(srcSelector).fadeOut(speed/2, easing).promise().done(function () {
        $(targetSelector).fadeIn(speed, easing).promise().done(function () {
          'function' === typeof done && done();
        });
      });
    } else {
      // console.log('fading to ' + targetSelector);
      $(targetSelector).fadeIn(speed/2, easing).promise().done(function () {
        'function' === typeof done && done();
      });
    }
  }
})(jQuery);
