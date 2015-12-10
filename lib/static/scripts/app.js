
console.log('history.state', window.history.state);
console.log('history.length', window.history.length);

(function($) {
    $.fn.hasVerticalScrollBar = function() {

      console.log(this);

      console.log('scrollHeight', this.get(0).scrollHeight);
      console.log('offsetHeight', this.get(0).offsetHeight);
      console.log('clientHeight', this.get(0).clientHeight);

      // return false; 
      return this.get(0) ? this.get(0).scrollHeight > this.get(0).offsetHeight : false;
    }
})(jQuery);

$(document).ready(function () {

  $('#wrapper').scrollTop(0);

  adjustForScrollbar('#body');

  $(window).on('resize', adjustForScrollbar);

  var DEFAULT_VIEW = 'dashboard';
  var currentView;

  var viewElements = $('.pageView');
  var views = {};

  viewElements.each(function (index, viewElement) {
    views[viewElement.id] = viewElement
  });

  console.log('views', views);
  
  var lastView = localStorage.getItem('otr:view');
  var initialView = (lastView in views) ? lastView : DEFAULT_VIEW;

  var client = new OffTheRecord_Client();

  // if there is no state, then use our initialView above
  if (!window.history.state) {
    navigate(initialView);

  // if the browser was refreshed, the state will be valid, but only update the 
  // view if the current view isn't already displayed.
  } else if (window.history.state !== currentView) {
    switchView(window.history.state);
    currentView = window.history.state;
  }

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

  var originalValues = {
    profile: {},
    privacy: {}
  };


  buttons.menu.on('tap', function () {

    var sliders = $('.animated-wrapper, .hardware-accelarate');
    
    // State checker
    if( sliders.attr('data-state') === 'neutral' ) {
      console.log('slide-right');
      sliders.attr('data-state', 'slide-right');

      setTimeout(function () {
        sliders.on('tap', clickMenu);
      }, 1);

    } else {
      console.log('slide-left');
      sliders.attr('data-state', 'neutral');
      sliders.off('tap');
    }
  });

  // buttons.menu.tap();

  $('.navBtn').on('tap', navBtnClicked);


  client.once('ready', function clientReady () {

    $('#loggedOnUser').html(client.user.username);
    $('#loggedOnUser').on('tap', navBtnClicked);
    $('#navLogoff').on('tap', logoff);

    // add the user's friends if they're online
    for (var friend in client.user.friends) {
      $('#navOnline').append('<li>' + friend.username + '</li>'); 
    }


    $('#profile-username').html(client.user.username);

    $('#profile-firstName').html(client.user.profile.firstName);
    $('#profile-lastName').html(client.user.profile.lastName);
    $('#privacy-profile').html(client.privacy[client.user.privacy.profile]);
    $('#privacy-search').html(client.privacy[client.user.privacy.search]);
    $('#privacy-friendRequest').html(client.privacy[client.user.privacy.friendRequest]);
    $('#privacy-startConversation').html(client.privacy[client.user.privacy.startConversation]);
    

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

  window.onpopstate = function (event) {
    console.log('popstate', event.state);

    var hash;

    // if no state is set, then this is a new entry from manually changing the hash
    if (!event.state) {

      // make sure that the hash is actually set
      if (location.hash) {
        // navigate to the new hash
        navigate(location.hash.split('#')[1]);
      } else {
        navigate(initialView);
      }

    } else if (event.state !== currentView) {
      switchView(event.state);
      currentView = event.state;
    }

  };

  function adjustForScrollbar(selector) {

    selector = selector || '#wrapper';

    if ($(selector).hasVerticalScrollBar() ) {
      $('#header').addClass('scrollbar');
    } else {
      $('#header').removeClass('scrollbar');
    }
  }

  function switchView (targetView) {

    var pageTitle;

    console.log('currentView', currentView);
    console.log('targetView', targetView);

    titleText = targetView.charAt(0).toUpperCase() + targetView.slice(1);

    console.log('titleText', titleText);

    var pageTitle = $('#pageTitle');

    console.log('pageTitle', pageTitle);

    $('title').text('Off-The-Record | ' + titleText);

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

  function navigate (targetView) {

    console.log('attempting to navigate: ' + currentView + ' -> ' + targetView);

    if (! (targetView in views )) {

      var viewBeforeError = currentView;
      targetView = 'error';

      switchView(targetView);

    } else if (targetView !== currentView) {

      // if the is set
      if (window.history.state) {
        // push a new state
        console.log('pushing a new state');
        window.history.pushState(targetView, targetView, '#' + targetView);
      } else {
        // replace the current state
        console.log('replacing the current lack of state');
        window.history.replaceState(targetView, targetView, '#' + targetView);
      }

      switchView(targetView);

      localStorage.setItem('otr:view', targetView);
    } else {
      console.log('no need to navigate to the same page!');
    }

    console.log('window.history.state', window.history.state);
    console.log('history.length', window.history.length);
    console.log('currentView', currentView);

  };

  function logoff () { 

    window.location.href='/logoff';

  };
    
});



