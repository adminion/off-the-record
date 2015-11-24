
var views = $('.pageView');
var currentView = '#dashboard';

function switchView (targetView) {
  $(currentView).hide();
  $(targetView).show();

  currentView = targetView;
};

window.onhashchange = function () {
    switchView(location.hash);
}

$(document).ready(function () {
    location.hash = currentView;
});
