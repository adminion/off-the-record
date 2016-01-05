#!/bin/bash

# set -x

getParent () 
{
	child=$1
	if [ -z "$child" ]
	then return 1
		# echo 'no args'
	else 
		echo $(dirname $child)
	fi
}

absScriptName=$(readlink -f $0)

parent=$(getParent $absScriptName)
parent=$(getParent $parent)

echo "$parent/config"
