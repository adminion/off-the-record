$(document).ready(function documentReady () {

    OffTheRecord.connect(clientReady);

    function clientReady() {
        var cancelProfile = $('#cancel-profile'),
            cancelPrivacy = $('#cancel-privacy'),
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
        cancelPrivacy.click(cancelPrivacy_onclick)
        editPrivacy.click(editPrivacy_onclick);
        editProfile.click(editProfile_onclick);
        savePrivacy.click(savePrivacy_onclick);
        saveProfile.click(saveProfile_onclick);



        function cancelPrivacy_onclick (clickEvent) {
            togglePrivacy();

            // remove the input elements
            $('#privacy-table td.editable').each(function(id, td) {

                var property = privacyProperties[id].innerHTML;

                console.log('property', property)

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

                console.log('property', property)

                // get the original value
                var value = originalValues.profile[property];

                // now set the cell to just the value rather than an input with that value
                td.innerHTML = value;
            });

        }

        // when the user clicks the editPrivacy button...
        function editPrivacy_onclick (clickEvent) {

            // 1) update the 'edit' button to say "cancel"
            // 2) change current values to input elements
            // 3) .show() / .toggle() save button

            togglePrivacy();

            $('#privacy-table .editable').each(function(tdid, td) {

                var levelName = td.innerHTML;

                var property = privacyProperties[tdid].innerHTML;

                originalValues.privacy[property] = levelName;

                var newInnerHTML = '<select id="edit-privacy-' + property + '">';

                OffTheRecord.privacy.levels.forEach(function(value) {
                    newInnerHTML += '<option';
                    
                    if (value === levelName) {
                        newInnerHTML += ' selected';
                    }

                    newInnerHTML += '>' + value + '</option>';
                });

                newInnerHTML += '</select>';

                td.innerHTML = newInnerHTML;

            });

            console.log('originalValues', originalValues)

        }

        // when the user clicks the editProfile button...
        function editProfile_onclick (clickEvent) {

            // 1) update the 'edit' button to say "cancel"
            // 2) change current values to input elements
            // 3) .show() / .toggle() save button

            toggleProfile();

            $('#profile-table .editable').each(function(id, td) {

                var value = td.innerHTML;

                var property = profileProperties[id].innerHTML;

                originalValues.profile[property] = value;

                td.innerHTML = '<input id="edit-profile-' + id + '" value="' + value + '" />';

            });

            console.log('originalValues', originalValues)

        }

        function savePrivacy_onclick (clickEvent) {

            togglePrivacy();

            // setup an object that represents the updates made
            var updates = {};

            // remove the select elements
            $('#privacy-table td.editable').each(function(id, td) {

                var levelName;
                var select = td.children[0];

                for (var i =0; i< select.length; i++ ) {

                    console.log('level ' +i, select[i]);

                    if (select[i].selected) {
                        // get the value of the input element

                        levelName = select[i].innerHTML;
                        console.log('level ' + levelName + ' is selected.');
                        break;
                    }
                }

                var property = privacyProperties[id].innerHTML;

                // save the value to updates by the property name of the labeling cell
                updates[property] = OffTheRecord.privacy[levelName];

                // now set the cell to just the value rather than an input with that value
                td.innerHTML = levelName;
            });

            console.log('updates', updates)

            OffTheRecord.updatePrivacy(updates, function(err, user) {

                if (err) {
                    console.error(err);
                } else {
                    alert('privacy updated!');

                    console.log('updatedUser', user);
                    
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

            console.log('updates', updates)

            OffTheRecord.updateProfile(updates, function(err, user) {

                if (err) {
                    console.error(err);
                } else {
                    alert('profile updated!');

                    console.log('updatedUser', user);
                    
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

        
    };

});
