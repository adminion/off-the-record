
var debug = Debug('off-the-record:client:profile');

$(document).ready(function documentReady () {

  var client = new OffTheRecord_Client();

  debug('client', client);  

  client.once('ready', function clientReady() {

    $('#username').html(client.user.username);

    $('#firstName').html(client.user.profile.firstName);
    $('#lastName').html(client.user.profile.lastName);
    $('#privacy-profile').html(client.privacy[client.user.privacy.profile]);
    $('#privacy-search').html(client.privacy[client.user.privacy.search]);
    $('#privacy-friendRequest').html(client.privacy[client.user.privacy.friendRequest]);
    $('#privacy-startConversation').html(client.privacy[client.user.privacy.startConversation]);

    var deleteAccount = $('#delete-account')

    var buttons = {
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

    buttons.profile.cancel.click(cancelProfile_onclick);
    buttons.profile.edit.click(editProfile_onclick);
    buttons.profile.save.click(saveProfile_onclick);

    buttons.privacy.cancel.click(cancelPrivacy_onclick);
    buttons.privacy.edit.click(editPrivacy_onclick);
    buttons.privacy.save.click(savePrivacy_onclick);

    buttons.profile.edit.attr('disabled', false);
    buttons.privacy.edit.attr('disabled', false);

    deleteAccount.click(deleteAccount_onclick);

    function cancelPrivacy_onclick (clickEvent) {

      $('button.privacy').toggle();

      // remove the input elements
      $('#privacy-table select').each(function () {

        debug('this', this);

        var property = this.id.split('-')[1];
        // get the original value
        var value = originalValues.privacy[ property];

        debug('property', property);
        debug('value', property);

        $('#privacy-'+property).replaceWith('<td id="privacy-' +property + '" class="editable">' +value + '</td>');
      });

    }

    function cancelProfile_onclick (clickEvent) {

      $('button.profile').toggle();

      // remove the input elements
      $('#profile-table input').each(function () {

        var property = this.id;
        var value = originalValues.profile[property];

        debug('property', property)
        debug('value', value);

        // now set the cell to just the value rather than an input with that value
        $('#' + property).replaceWith('<td id="' + property + '" class="editable">' + value + '</td>');

      });

    }

    // when the user clicks the deleteAccount button...
    function deleteAccount_onclick (clickEvent) {

      if (confirm('Are you sure you want to delete your account?\n\nTHIS CANNOT BE UNDONE!')) {
        if (confirm('Do you REALLY want to delete your account?\n\nIf you DO NOT want to delete your account, click "cancel"\nIf you DO want to delete your account, click "ok".\n\nTHIS CANNOT BE UNDONE!')) {
          client.deleteAccount(function (err) {
            if (err) return console.error(err);

            alert('We successfully deleted your account!');
            window.location.href='/';
          });
        }
      }

    }

    // when the user clicks the editPrivacy button...
    function editPrivacy_onclick (clickEvent) {

      // 1) update the 'edit' button to say "cancel"
      // 2) change current values to input elements
      // 3) .show() / .toggle() save button

      $('button.privacy').toggle();

      // for each editable table cell
      $('#privacy-table .editable').each(function () {

        // this is the privacy property name
        var property = this.id.split('-')[1];
        var value = this.innerHTML;

        debug('property', property);
        debug('value', value)

        originalValues.privacy[property] = value;

        // create the select element
        var replacementHTML = '<select id="privacy-' + property + '">';

        // loop through each privacy property
        for (var level in client.privacy.values) {
          debug('level', level);

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

      debug('originalValues.privacy', originalValues.privacy)

    }

    // when the user clicks the editProfile button...
    function editProfile_onclick (clickEvent) {

      $('button.profile').toggle();

      $('#profile-table .editable').each(function () {

        debug('this', this);

        var property = this.id;
        var value = this.innerHTML;

        debug('property', property);
        debug('value', value);

        originalValues.profile[property] = value;

        $('#' + property).replaceWith('<input id="' + property + '" value="' + value + '" />');

      });

      debug('originalValues.profile', originalValues.profile);

    }

    function savePrivacy_onclick (clickEvent) {

      $('button.privacy').toggle();

      // setup an object that represents the updates made
      var updates = {};

      // remove the select elements
      $('#privacy-table select').each(function () {

        var property = this.id.split('-')[1];
        var level = $(this).find(':selected')[0].value;

        debug('property', property);
        debug('level', level);

        // save the value to updates by the property name of the labeling cell
        updates[property] = client.privacy[level];

        debug('updates[' + property + "]", updates[property]);

        // now set the cell to just the value rather than an input with that value
        $('#privacy-'+property).replaceWith('<td id="privacy-' +property + '" class="editable">' +level+ '</td>');
      });

      debug('updates', updates)

      client.updatePrivacy(updates, function (err, user) {

        if (err) {
          console.error(err);
        } else {
          alert('privacy updated!');

          debug('updatedUser', user);
          
        }
      });

    };

    function saveProfile_onclick (clickEvent) {

      $('button.profile').toggle();

      // setup an object that represents the updates made
      var updates = {};

      // remove the input elements
      $('#profile-table input').each(function () {

        var property = this.id;

        // get the value of the input element
        var value = this.value;

        debug('property', property); 
        debug('value', value);

        // save the value to updates by the property name of the labeling cell
        updates[property] = value

        // now set the cell to just the value rather than an input with that value
        $('#' + property).replaceWith('<td id="' + property + '" class="editable">' + value + '</td>');
      });

      debug('updates', updates)

      client.updateProfile(updates, function(err, user) {

        if (err) {
          console.error(err);
        } else {
          alert('profile updated!');

          debug('updatedUser', user);
          
        }
      });

    }

    
  });

});
