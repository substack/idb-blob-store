# idb-blob-store

abstract-blob-store compatible IndexedDB wrapper

[![blob-store-compatible](https://raw.githubusercontent.com/maxogden/abstract-blob-store/master/badge.png)](https://github.com/maxogden/abstract-blob-store)

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

## var blob = store(opts)

Create a new blob store.

`opts.name` defaults to `idb-blob-store`.
`opts.indexedDB` and `opts.IDBKeyRange` both default to respective browser implementations.

## blob.createWriteStream(opts, cb)

Create a new blob at `opts.key` of chunks of size `opts.size`.

`opts.size` defaults to `16384`.

## blob.createReadStream(opts)

Create a read stream for the chunks at `opts.key`.

## blob.exists(opts, cb)

Check if `opts.key` exists with `cb(err, exists)`.

## blob.remove(opts, cb)

Remove the key at `opts.key`.

# internal methods

These internal methods are intended to be used by wrapper modules and will track
in semver. User code should probably not use these.

## blob.\_store(mode, cb)

Create a transaction in `mode` (`'readonly'` or `'readwrite'`), returning the
objectStore in `cb(err, store)`.

## blob.\_put(key, value, cb)

Put a `key` with a `value`.

## blob.\_get(key, cb)

Get the value of some `key` in `cb(err, value)`.

## blob.\_del(key, cb)

Remove the value at `key`.

# license

MIT
