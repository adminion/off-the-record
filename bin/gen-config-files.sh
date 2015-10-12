
CONFIG_DIR=$(./wheresmyconfig.sh)
CONFIG_DEV="${CONFIG_DIR}development.json"
CONFIG_PROD="${CONFIG_DIR}production.json"

if [ ! -f $CONFIG_DEV ] 
  then 
  # create empty config files
  bash -c "cat > ${CONFIG_DEV}"<<EOF
{ 

}
EOF

  chmod 644 $CONFIG_DEV
  cp config/development.json config/production.json

fi
