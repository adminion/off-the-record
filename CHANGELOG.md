CHANGELOG
=========

# v0.x

## v0.1.0
* restructuring to resemble merge of adminion and freebox-finder
* now using `config` module for configuration
* `setup.sh` creates `config/development.json` and `config/production.json`
* `setup.sh` creates and starts the `off-the-record` upstart job
* created `uninstall.sh` to remvoe upstart service and startup script symlink
* http routes now simply render views, no parameter handling
* added banner property to env to output spash screen to stdout
* updated `transport:http` to always use https (leftover from adminion)
* modified ssl module to only output pathnames not actual data.
* added http routes and socket.io server api to README.md
* replaced [mongoose-friends](https://github.com/numbers1311407/mongoose-friends) with native solution [friends-of-friends](https://github.com/adminion/friends-of-friends)
  - separate collection for friendships
  - plugin for AccountSchema provides statics and instance methods
* users can view/edit their profile and privacy settings
* users can search for other accounts (returns friends, friendsOfFriends, and nonFriends)
* removed route `/friends/:friendId` in favor of `/profile/:email` so we don't have to update two pages that effectively do the same thing
* begun implementation of OffTheRecord_Client to ease my development, but to also move toward a possible stand-alone npm package that can be re-implemented, maybe..? (not possible with current authentication scheme)
* client library uses browserify to harness node.js-style paradigms in the browser.
