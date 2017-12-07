module.exports = IDB;

var EventEmitter = require('events').EventEmitter;
var inherits = require('inherits');
var through = require('through2');
var writeonly = require('write-only-stream');
var readonly = require('read-only-stream');
var defined = require('defined');
var pack = require('lexicographic-integer').pack;
var Block = require('block-stream2');
var Readable = require('readable-stream').Readable;

module.exports = IDB;
inherits(IDB, EventEmitter);

function IDB (opts) {
    if (!(this instanceof IDB)) return new IDB(opts);
    EventEmitter.call(this);
    
    var self = this;
    if (typeof opts === 'string') opts = { name: opts };
    if (!opts) opts = {};
    self._ready = false;
    if (!opts.name) opts.name = 'idb-blob-store';
    self.indexedDB = opts.indexedDB || window.indexedDB || window.mozIndexedDB
        || window.webkitIndexedDB || window.msIndexedDB
    ;
    self.IDBKeyRange = opts.IDBKeyRange || window.IDBKeyRange;

    var request = self.indexedDB.open(opts.name);
    request.addEventListener('upgradeneeded', function () {
        var db = request.result;
        db.createObjectStore('blobs'); 
    });
    request.addEventListener('success', function () {
        self.db = request.result;
        self.emit('ready');
    });
}

IDB.prototype._store = function (mode, cb) {
    var self = this;
    if (!self.db) return self.once('ready', ready);
    else process.nextTick(ready)
    
    function ready () {
        var trans = self.db.transaction(['blobs'], mode);
        var store = trans.objectStore('blobs');
        trans.addEventListener('error', function (err) { cb(err) });
        cb(null, store)
    }
};

IDB.prototype._put = function (key, value, cb) {
    this._store('readwrite', function (err, store) {
        if (err) return cb(err);
        backify(store.put(value, key), wait(store, cb));
    });
};

function wait (store, cb) {
    var pending = 2;
    store.transaction.addEventListener('complete', done);
    return function (err) {
        if (err) cb(err)
        else done()
    };
    function done () { if (-- pending === 0) cb(null) }
}


IDB.prototype._get = function (key, cb) {
    this._store('readonly', function (err, store) {
        if (err) cb(err)
        else backify(store.get(key), function (err, ev) {
            if (err) cb(err)
            else cb(null, ev.target.result)
        });
    });
};

IDB.prototype._del = function (key, cb) {
    this._store('readwrite', function (err, store) {
        if (err) cb(err)
        else backify(store.delete(key), wait(store, cb));
    });
};

IDB.prototype.createWriteStream = function (opts, cb) {
    var self = this;
    if (!opts) opts = {};
    if (typeof opts === 'string') opts = { key: opts };
    
    var key = defined(opts.key, 'undefined');
    var size = opts.size || 1024 * 16;
    var pos = 0;
    var pending = 1;
    
    var block = new Block(size, { nopad: true });
    
    self.exists(key, function (err, ex) {
        if (err) return cb(err);
        else if (ex) self.remove(key, function (err) {
            if (err) cb(err)
            else ready()
        })
        else ready()
    });
    
    function ready () {
        block.pipe(through(write, end));
    }
    
    var w = writeonly(block);
    w.key = key;
    if (cb) w.once('error', cb);
    return w;
    
    function write (buf, enc, next) {
        pending ++;
        self._put(key + '!' + pack(pos, 'hex'), buf, function (err) {
            if (err) w.emit('error', err)
            else if (-- pending === 0) done()
        });
        pos += buf.length;
        next();
    }
    
    function end () {
        self._put(key + '!', { size: size, length: pos }, function (err) {
            if (err) w.emit('error', err)
            else if (-- pending === 0) done()
        });
    }
    
    function done () {
        if (cb) cb(null, { key: key, size: pos })
    }
};

IDB.prototype.createReadStream = function (opts) {
    var self = this;
    var r = new Readable;
    var cursor;
    r._read = function () { if (cursor) cursor.continue() };
    
    if (typeof opts === 'string') opts = { key: opts };
    if (!opts) opts = {};
    
    var key = defined(opts.key, 'undefined');
    var range = self.IDBKeyRange.bound(key + '!0', key + '!~', true, true);
    
    self._store('readonly', function (err, store) {
        if (err) return r.emit('error', err);
        var cur = store.openCursor(range);
        var times = 0;
        
        backify(cur, function (err, ev) {
            if (err) return r.emit('error', err)
            cursor = ev.target.result;
            if (times === 0 && !cursor) {
                r.emit('error', new Error('key not found: ' + key));
            }
            else if (cursor) {
                r.push(Buffer(cursor.value));
            }
            else r.push(null)
            times ++;
        });
    });
    return r;
};

IDB.prototype.exists = function (opts, cb) {
    var self = this;
    if (!cb) cb = function () {};
    if (typeof opts === 'string') opts = { key: opts };
    if (!opts) opts = {};
    var range = self.IDBKeyRange.only(opts.key + '!');
    
    self._store('readonly', function (err, store) {
        if (err) return cb(err);
        backify(store.openCursor(range), function (err, ev) {
            if (err) cb(err)
            else if (ev.target.result) cb(null, true)
            else cb(null, false)
        });
    });
};

IDB.prototype.remove = function (opts, cb) {
    var self = this;
    if (typeof opts === 'string') opts = { key: opts };
    if (!opts) opts = {};
    var pending = 1;
    var key = opts.key;
    
    self._get(key + '!', function (err, value) {
        if (err) return cb(err);
        if (!value) return cb(null, new Error('not found'));
        self._del(key + '!', callback);
        
        var max = Math.ceil(value.length / value.size) * value.size;
        for (var i = 0; i < max; i += value.size) {
            var ikey = key + '!' + pack(i, 'hex');
            pending ++;
            self._del(ikey, callback);
        }
        function callback (err) {
            if (err) { cb(err); cb = function () {} }
            else if (-- pending === 0 && cb) cb(null);
        }
    });
};

function backify (r, cb) {
    r.addEventListener('success', function (ev) { cb(null, ev) });
    r.addEventListener('error', function (err) { cb(err) });
}
