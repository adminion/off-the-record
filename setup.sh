#!/bin/bash

if [ $1 = "--development" ]
then 
  echo '============================== DEVLEOPMENT INSTALL =============================='
  dev=1
else
  dev=0
fi

# install ubuntu package dependencies
sudo apt-get update
sudo apt-get install -y openssl nodejs mongodb
sudo npm install --production

if [ ! -f 'config/development.json' ] 
then 
  # create empty config files
  bash -c "cat > config/development.json"<<EOF
{ 

}
EOF

  chmod 755 config/development.json

  cp config/development.json config/production.json
fi

if [ "$dev" -eq "0" ] 
then
  # look for existing upstart script
  if [ -f '/etc/init/off-the-record.conf' ]
  then
    # remove it, if present
    sudo rm /etc/init/off-the-record.conf
  fi

  here=`pwd`

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
