

$(function () {
  $('#menuBtn').on('click', function () {

    var body = $('.animated-wrapper');
    
    // State checker
    if( body.attr('data-state') === 'neutral' ) {
      body.attr('data-state', 'slide-right')
    } else {
      body.attr('data-state', 'neutral')
    }
  });  
})

