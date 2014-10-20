
var blobURLs = [];
var files = [];
var socket;
var transfers = {};
var chunkSize = 512;
var picker = document.getElementById('send-files-picker');
var readers = [];

window.onbeforeunload = function () {
    confirm('If you navigate away from this page, you will love any files/messages you have not saved.  Leave Page?');
    return null;
};

window.onunload = function () {
    blobURLs.forEach(function(url) {
        window.URL.revokeObjectURL(url);
        console.log('blob URL revoked!');
    });
};

function b64toBlob(b64Data, contentType) {

    contentType = contentType || '';
    
    var blob;
    var byteCharacters = atob(b64Data);
    var byteArrays = [];
    var progress = 0;
    var totalChars = byteCharacters.length;

    for (var offset = 0; offset < byteCharacters.length; offset += chunkSize) {

        // REFINE

        var percentage = Math.floor(offset / totalChars * 100)

        if (percentage > progress) {
            progress = percentage;

            if (progress % 10 === 0) {
                console.log('creating blob: ' + progress + '% complete...');
            }
        }



        var chunk = byteCharacters.slice(offset, offset + chunkSize);

        var byteNumbers = new Array(chunk.length);
        for (var i = 0; i < chunk.length; i++) {
            byteNumbers[i] = chunk.charCodeAt(i);
        }

        var byteArray = new Uint8Array(byteNumbers);

        byteArrays.push(byteArray);
    }

    console.log('creating blob: 100% complete...');


    try {
       blob = new Blob( byteArrays, {type : contentType});
    }
    catch(e){
        // TypeError old chrome and FF
        window.BlobBuilder = window.BlobBuilder || 
                             window.WebKitBlobBuilder || 
                             window.MozBlobBuilder || 
                             window.MSBlobBuilder;

        if (e.name == 'TypeError' && window.BlobBuilder){
            var bb = new BlobBuilder();
            bb.append(byteArrays);
            blob = bb.getBlob(contentType);
        }

        else if (e.name == "InvalidStateError") {
            // InvalidStateError (tested on FF13 WinXP)
            blob = new Blob(byteArrays, {type : contentType});
        }

        else {
            alert("We're screwed, blob constructor unsupported entirely");

        }
    }

    return blob;
};

function readFiles (clickEvent) {
    var count = 0,
        file,
        reader,
        chunkSize = 512,
        sendRequest = [],
        total = picker.files.length;

    files = [];

    // CLEAR EXISTING OBJECT URLS!!!!

    var foo = [];

    for (var i = 0; i< picker.files.length; i++) {
        foo[i] = picker.files[i];
    }

    console.log('foo', foo);

    foo.forEach(function (file, i) {

        readers[i] = new FileReader();
        reader = readers[i];

        // TODO: setup events for each FileReader
        // specificly: 
        //  * onprogress
        // https://developer.mozilla.org/en-US/docs/Web/API/FileReader#Event_handlers

        reader.onprogress = function (progressEvent) {

            var percentage = Math.floor(progressEvent.loaded / progressEvent.total * 100);

            console.log('reading %s %s\%...', file.name, percentage);
        };

        reader.onload = function (progressEvent) {

            var data = progressEvent.target.result;

            console.log('data.length', data.length);

            files.push({
                // content-type and encoding are before but binary data itself is found after the comma
                data: data,
                lastModifiedDate: new Date(file.lastModifiedDate),
                name: file.name,
                size: file.size,
                type: file.type
            });

            sendRequest.push({
                encodedLength: data.length,
                lastModifiedDate: new Date(file.lastModifiedDate),
                name: file.name,
                size: file.size,
                type: file.type
            });

            console.log('file encoded!');

            if (++count === total) {
                console.log('all files encoded!');

                socket.emit('transfer-files', sendRequest, function transferReady (transfer) {

                    transfers[transfer.id] = transfer;

                    console.log('server ready for transfer', transfer.id);

                    console.log('files', files);

                    // bombard the server with chunks of each file
                    files.forEach(function (file, fileId) {
                        var chunk,
                            chunkId,
                            offset;

                        console.log('sending file chunks to server!');

                        // send files in chunks to provide progress feedback
                        // chunks won't neccessarily be received in order, so use "chunkId" to preserve order
                        for (chunkId = 0, offset = 0; offset < file.data.length; chunkId++, offset += chunkSize) {

                            chunk = file.data.slice(offset, offset + chunkSize);

                            console.log('chunk', chunkId);

                            socket.emit('transfer-data', transfer.id, fileId, chunkId, chunk);
                        }

                    });

                    console.log('Files uploaded!');

                });
            };
        };

        reader.readAsDataURL(file);
    });
};

$(document).ready(function documentReady () {
    socket = io.connect();

    socket.on('transfer-data', function (transferId, fileId, chunkId, chunk) {

        // console.log('%s, %s, %s', transferId, fileId, chunkId);

        var transfer = transfers[transferId];

        // console.log('transfer', transfer);

        var file = transfer.files[fileId];

        file.chunks[chunkId] = chunk;

        file.transferred += chunk.length;
        transfer.transferred += chunk.length; 

        var filePercentage = Math.floor(file.transferred / file.encodedLength * 100 );
        var overallPercentange = Math.floor(transfer.transferred / transfer.encodedLength * 100)

        if (filePercentage > file.progress) {
            file.progress = filePercentage;
        }

        if (overallPercentange > transfer.progress) {
            transfer.progress = overallPercentange;
        }

        if (file.transferred === file.encodedLength) {
            file.data = function () {
                return file.chunks.join('');
            }
        }

        if (transfer.transferred === transfer.encodedLength) {
            transfer.files.forEach(function(file) {

                var data = file.data().split(',')[1];

                var blob = b64toBlob(data, file.type);

                var url = URL.createObjectURL(blob);

                $('#files-received').append('<li><a target="_blank" download="' + file.name + '" href="' + url + '">' + file.name + '</a></li>');

                blobURLs.push(url);
            });

        }

    });

    socket.on('transfer-progress', function (transferId, txProgress, fileId, fileProgress) {

        $('#transfer-status').replaceWith('<div id="transfer-status"><p>' + transferId + ': ' + txProgress + '%, '
            + transfers[transferId].files[fileId].name + ': ' + fileProgress + '%</p></div>');

    });

    socket.on('transfer-files', function (transfer) {

        console.log('incoming file transfer', transfer);

        transfers[transfer.id] = transfer;

    });

    socket.on('transfer-complete', function (transferId) {
        console.log('transfer %s complete', transferId);

        // h$('#transfer-status').replaceWith('<div id="transfer-status"></div>');

    });


});

