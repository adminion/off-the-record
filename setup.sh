#!/bin/bash

gen='./gen-key-signed-cert.sh'

# if argument 1...
case $1 in 
    -g)
        $gen $2
        ;;
    --generate)
        $gen $2
        ;;
    -s)
        $gen $2
        ;;
    --ssl)
        $gen $2  
        ;;
    --uninstall)
        ./uninstall.sh
        exit
        ;;
    "")
        ;;
    *)
        echo "$0: error: unrecognized argument '$1'"
        ;;
esac

# install ubuntu package dependencies
# sudo apt-get update
# sudo apt-get install -y openssl nodejs npm mongodb
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

# create symlink to startup script

if [ -L '/usr/bin/otrd' ]
then
    sudo rm /usr/bin/otrd
fi

sudo ln -s $here/off-the-record.sh /usr/bin/otrd

# create upstart job
sudo bash -c "cat > /etc/init/off-the-record.conf" <<EOF
start on started mongodb

script
    export NODE_ENV='development'
    cd $here 
    ./off-the-record.sh \* | logger -t otrd
end script
EOF

sudo start off-the-record

echo "off-the-record server installed!"
