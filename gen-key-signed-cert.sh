#!/bin/bash

# require root
# if [ $USER != "root" ]
# then 
#     echo "$0: error: must be root" && exit 2
# fi

var SSL_DIR="~/.ssl"

# if the length of $1 is not zero
if [ $1 ]
then
  # set serverName to $1
  serverName=$1
else
  # set serverName to default: "otr"
  serverName="otrd"
fi

# ouput the server name to be used
#echo "server name: $serverName"

if [ ! -d ~/.ssl ] 
  then 
    mkdir ~/.ssl
fi

key="$SSL_DIR/$serverName-key.pem"
csr="$SSL_DIR/$serverName-csr.pem"
cert="$SSL_DIR/$serverName-cert.pem"

echo "generating key $key...";
openssl genrsa -out $key

echo "generating request $csr..."
openssl req -new -key $key -out $csr

echo "self-signing certificate $cert..."
openssl x509 -req -days 9999 -in $csr -signkey $key -out $cert

echo "deleting request $csr..."
rm $csr

echo "successfully generated key $key, and self-signed cert $cert from request $csr."
