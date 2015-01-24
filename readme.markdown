# idb-blob-store

abstract-blob-store compatible IndexedDB wrapper

# example

``` js
var store = require('idb-blob-store');
var blob = store();

blob.createWriteStream({ key: 'cool' }).end('beans', readback);

function readback () {
    blob.createReadStream({ key: 'cool' }).on('data', ondata);
    function ondata (buf) {
        console.log(buf.toString());
    }
}
```

