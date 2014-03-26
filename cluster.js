
console.log('Starting Off-The-Record server...');

var util = require('util')

var ClusterFuck = require('cluster-fuck');

var otr_cluster = new ClusterFuck();

otr_cluster.on('ready', function onClusterReady () {
    console.log('Off-the-Record Cluster is now ready!');
});

otr_cluster.on('starting', function onClusterStarting () {
    console.log('starting cluster...');
});

otr_cluster.on('restarting', function onClusterRestarting () {
    console.log('restarting cluster...');
});

otr_cluster.on('restarted', function onClusterRestarted () {
    console.log('cluster restarted!');
});

otr_cluster.on('stopping', function onClusterStopping () {
    console.log('stopping cluster...');
});

otr_cluster.on('stopped', function onClusterStopped () {
    console.log('cluster stopped!');
});

otr_cluster.on('killing', function onClusterKilling () {
    console.log('killing cluster...');
});

otr_cluster.on('killed', function onClusterKilled () {
    console.log('cluster killed!');
});

otr_cluster.start();