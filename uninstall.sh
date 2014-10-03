
# if upstart job is running, fail - must be stopped
sudo stop off-the-record

sudo rm -rf /etc/init/off-the-record.conf /usr/bin/otrd 
