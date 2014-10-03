
if [ ! -z "$1" ]
then
    export DEBUG=$1
    export NODE_ENV='development'
fi

nodejs server.js
