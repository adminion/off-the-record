
if [ ! -f 'config/development.json' ] 
  then 
    # create empty config files
    bash -c "cat > config/development.json"<<EOF
{ 

}
EOF

  chmod 755 config/development.json

fi

if [ ! -f 'config/production.json' ]
  then 
    cp config/development.json config/production.json
fi
