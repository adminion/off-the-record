
var debug = Debug('off-the-record:client:profile');

$(document).ready(function documentReady () {

    var client = new OffTheRecord_Client();

    debug('client', client);

    client.once('ready', function clientReady() {
        var cancelProfile = $('#cancel-profile'),
            cancelPrivacy = $('#cancel-privacy'),
            deleteAccount = $('#delete-account'),
            editPrivacy = $('#edit-privacy'),
            editProfile = $('#edit-profile'),
            savePrivacy = $('#save-privacy'),
            saveProfile = $('#save-profile'),
            profileProperties = $('#profile-table .propName'),
            privacyProperties = $('#privacy-table .propName'),
            privacyKeys = $('#privacy-table .propName');

        var originalValues = {
            profile: {},
            privacy: {}
        }

        cancelProfile.click(cancelProfile_onclick);
        cancelPrivacy.click(cancelPrivacy_onclick);
        deleteAccount.click(deleteAccount_onclick);
        editPrivacy.click(editPrivacy_onclick);
        editProfile.click(editProfile_onclick);
        savePrivacy.click(savePrivacy_onclick);
        saveProfile.click(saveProfile_onclick);



        function cancelPrivacy_onclick (clickEvent) {
            togglePrivacy();

            // remove the input elements
            $('#privacy-table td.editable').each(function(id, td) {

                var property = privacyProperties[id].innerHTML;

                debug('property', property)

                // get the original value
                var value = originalValues.privacy[property];

                // now set the cell to just the value rather than an input with that value
                td.innerHTML = value;
            });

        }

        function cancelProfile_onclick (clickEvent) {
            toggleProfile();

            // remove the input elements
            $('#profile-table td.editable').each(function(id, td) {

                var property = profileProperties[id].innerHTML;

                debug('property', property)

                // get the original value
                var value = originalValues.profile[property];

                // now set the cell to just the value rather than an input with that value
                td.innerHTML = value;
            });

        }

        // when the user clicks the deleteAccount button...
        function deleteAccount_onclick (clickEvent) {

            if (confirm('Are you really sure you want to delete your account?  This can\'t be undone!')) {
                client.deleteAccount(function (err) {
                    if (err) return console.error(err);

                    alert('We successfully deleted your account!');
                    window.location.href='/';
                });
            }

        }

        // when the user clicks the editPrivacy button...
        function editPrivacy_onclick (clickEvent) {

            // 1) update the 'edit' button to say "cancel"
            // 2) change current values to input elements
            // 3) .show() / .toggle() save button

            togglePrivacy();

            // for each editable table cell
            $('#privacy-table .editable').each(function(id, td) {

                // this is the privacy property name
                var property = privacyProperties[id].innerHTML;

                debug('property', property);

                // save original privacy level of the property
                var originalLevel = td.innerHTML;

                debug('originalLevel', originalLevel)

                originalValues.privacy[property] = originalLevel;

                // create the select element
                var newInnerHTML = '<select id="edit-privacy-' + property + '">';

                // loop through each privacy property
                for (var key in client.privacy) {

                    debug('key', key);

                    // we only want the keys that are strings 
                    if (isNaN(Number(key))) {

                        if (! (property === 'friendRequest' && key === 'FRIENDS')) {
                            newInnerHTML += '<option';
                            
                            if (key === originalLevel) {
                                newInnerHTML += ' selected';
                            }

                            newInnerHTML += '>' + key + '</option>';
                        }
                    }
                }

                newInnerHTML += '</select>';

                td.innerHTML = newInnerHTML;

            });

            debug('originalValues.privacy', originalValues.privacy)

        }

        // when the user clicks the editProfile button...
        function editProfile_onclick (clickEvent) {

            // 1) update the 'edit' button to say "cancel"
            // 2) change current values to input elements
            // 3) .show() / .toggle() save button

            toggleProfile();

            $('#profile-table .editable').each(function(id, td) {

                var propName = profileProperties[id].innerHTML;

                debug('propName', propName)

                var propValue = td.innerHTML;

                debug('propValue', propValue);

                originalValues.profile[propName] = propValue;

                td.innerHTML = '<input id="edit-profile-' + id + '" value="' + propValue + '" />';

            });

            debug('originalValues.profile', originalValues.profile);

        }

        function savePrivacy_onclick (clickEvent) {

            togglePrivacy();

            // setup an object that represents the updates made
            var updates = {};

            // remove the select elements
            $('#privacy-table td.editable').each(function(id, td) {

                var level;
                var select = td.children[0];

                for (var i=0; i<select.length; i++ ) {

                    var option = select[i];

                    debug('option', option);

                    if (option.selected) {
                        // get the value of the input element

                        level = option.innerHTML;
                        break;
                    }
                }

                debug('level', level);

                var property = privacyProperties[id].innerHTML;

                // save the value to updates by the property name of the labeling cell
                updates[property] = client.privacy[level];

                debug('updates[' + property + "]", updates[property]);

                // now set the cell to just the value rather than an input with that value
                td.innerHTML = level;
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

            toggleProfile();

            // setup an object that represents the updates made
            var updates = {};

            // remove the input elements
            $('#profile-table td.editable').each(function(id, td) {

                // get the value of the input element
                var value = td.children[0].value;

                var property = profileProperties[id].innerHTML;

                // save the value to updates by the property name of the labeling cell
                updates[property] = value

                // now set the cell to just the value rather than an input with that value
                td.innerHTML = value;
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

        function toggleProfile () {
            cancelProfile.toggle();
            editProfile.toggle();
            saveProfile.toggle();
        }

        function togglePrivacy () {
            cancelPrivacy.toggle();
            editPrivacy.toggle();
            savePrivacy.toggle();
        }

        
    });

});
