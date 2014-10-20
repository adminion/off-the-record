#!/bin/bash

if [ $1 -eq "development" ]
then 
    dev=true
fi

# install ubuntu package dependencies
sudo apt-get update
sudo apt-get install -y openssl nodejs mongodb
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

if [ dev -eq false ]
then
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
fi

echo "off-the-record server installed!"
