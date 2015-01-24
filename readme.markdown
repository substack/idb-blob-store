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

# methods

``` js
var store = require('idb-blob-store')
```

## var blob = store()

Create a new blob store.

## blob.createWriteStream(opts, cb)

Create a new blob at `opts.key` of chunks of size `opts.size`.

`opts.size` defaults to `16384`.

## blob.createReadStream(opts)

Create a read stream for the chunks at `opts.key`.

## blob.exists(opts, cb)

Check if `opts.key` exists with `cb(err, exists)`.

## blob.remove(opts, cb)

Remove the key at `opts.key`.

# license

MIT
