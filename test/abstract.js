var test = require('tape');
var blob = require('../');
var fakeIndexedDB = require('fake-indexeddb');
var fakeIDBKeyRange = require("fake-indexeddb/lib/FDBKeyRange");

var isNode = typeof window === 'undefined';
var opts = {
    indexedDB: isNode && fakeIndexedDB,
    IDBKeyRange: isNode && fakeIDBKeyRange
};

require('abstract-blob-store/tests')(test, {
    setup: function (t, cb) {
        cb(null, blob(opts));
    },
    teardown: function (t, store, blob, cb) {
        if (blob) store.remove(blob);
        cb();
    }
});
