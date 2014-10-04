#!/bin/bash

# install ubuntu package dependencies
sudo apt-get update
sudo apt-get install -y openssl nodejs npm mongodb
sudo npm install 

if [ ! -e 'config/development.json' ] 
then 
    # create empty config files
    bash -c "cat > config/development.json"<<EOF
{ 

}
EOF

    chmod 755 config/development.json

    cp config/development.json config/production.json
fi

here=`pwd`

# look for existing startup script symlink
if [ -L '/usr/bin/otrd' ]
then
    # remove it, if present
    sudo rm /usr/bin/otrd
fi

# create symlink to startup script
sudo ln -s $here/off-the-record.sh /usr/bin/otrd

# look for existing upstart script
if [ -e '/etc/init/off-the-record.conf' ]
then
    # remove it, if present
    sudo rm /etc/init/off-the-record.conf
fi

# create upstart job
sudo bash -c "cat > /etc/init/off-the-record.conf" <<EOF
start on started mongodb

script
    export NODE_ENV='production'
    cd $here 
    ./off-the-record.sh \* | logger -t otrd
end script
EOF

sudo start off-the-record

echo "off-the-record server installed!"
