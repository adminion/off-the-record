$(document).ready(function documentReady () {

    OffTheRecord.connect(clientReady);

    function clientReady() {
        var editPrivacy = $('#edit-privacy'),
            editProfile = $('#edit-profile');

        editPrivacy.click(editPrivacy_onclick);
        editProfile.click(editProfile_onclick);

        function editPrivacy_onclick (clickEvent) {



        }

        function editProfile_onclick (clickEvent) {

            $('#edit-profile').text('save')

            var tds = $('#profile-table .editable').each(function(id, td) {

                console.log('id', id);
                console.log('td', td);

                var value = td.innerHTML;

                td.innerHTML = '<input id="edit-profile-' + id + '" value="' + value + '" />';

            });



        }


        
    };

});
