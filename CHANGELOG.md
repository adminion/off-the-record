CHANGELOG
=========

# v0.1

# v0.1.0
* restructuring to resemble merge of adminion and freebox-finder
* now using `config` module for configuration
* `setup.sh` creates config/development.json and config/production.json
* `setup.sh` creates and starts the `off-the-record` upstart job
* created `uninstall.sh` to remvoe upstart service and startup script symlink
* http routes now simply render views, no parameter handling
