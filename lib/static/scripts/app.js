
var debug = Debug('off-the-record:app');

var client = new OffTheRecord_Client();

var defaultView = 'dashboard';

var currentView = localStorage.getItem('otr_pageView') || defaultView;
var menuBtn;
var views;

debug('currentView %s', currentView);

client.once('ready', function () {

  $(document).ready(function () {
      menuBtn = $('#menuBtn');
      views = $('.pageView');

      $('#loggedOnUser').html(client.user.username);
      $('#loggedOnUser').on('click', navBtnClicked);
      $('#navLogoff').on('click', logout);

      menuBtn.on('click', function () {

        var body = $('.animated-wrapper');
        
        // State checker
        if( body.attr('data-state') === 'neutral' ) {
          body.attr('data-state', 'slide-right')
        } else {
          body.attr('data-state', 'neutral')
        }
      });

      $('.navBtn').on('click', navBtnClicked);

      window.onhashchange = function () {
        switchView(window.location.hash.split('#')[1]);
      }

      switchView(currentView);

    });

});

function switchView (targetView) {

  debug('targetView: %s', targetView);

  $('#' + currentView).hide();
  $('#' + targetView).show();

  $('#pageTitle').text(targetView);

  window.history.pushState(null, null, '#' + targetView);

  currentView = targetView;
  localStorage.setItem('otr_pageView', currentView)
};

function navBtnClicked () {
  var targetView = $(this).data('targetView');

  debug('targetView: %s', targetView);

  switchView(targetView);
  menuBtn.click();

};

function logout () { 

  debug('this: %s', this);
  window.location.href='/logoff';

}
