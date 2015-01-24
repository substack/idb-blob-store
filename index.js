module.exports = IDB;

var EventEmitter = require('events').EventEmitter;
var inherits = require('inherits');
var through = require('through2');
var writeonly = require('write-only-stream');
var pack = require('lexicographic-integer').pack;
var Block = require('block-stream2');
var Readable = require('readable-stream').Readable;

var idb = window.indexedDB || window.mozIndexedDB
    || window.webkitIndexedDB || window.msIndexedDB
;

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
    
    var request = indexedDB.open(opts.name);
    request.addEventListener('upgradeneeded', function () {
        var db = request.result;
        var store = db.createObjectStore('blobs');
        self.db = db;
        self.emit('ready');
    });
    request.addEventListener('success', function () {
        self.db = request.result;
        self.emit('ready');
    });
}

IDB.prototype._put = function (key, value, cb) {
    var self = this;
    if (!self.db) {
        return self.once('ready', function () {
            self._put(key, value, cb);
        });
    }
    var trans = self.db.transaction(['blobs'], 'readwrite');
    var store = trans.objectStore('blobs');
    trans.addEventListener('complete', function () { cb(null) });
    trans.addEventListener('error', function (err) { cb(err) });
    store.put(value, key);
};

IDB.prototype.createWriteStream = function (opts, cb) {
    var self = this;
    if (!opts) opts = {};
    
    var pending = 1;
    var key = opts.key;
    var size = opts.size || 1024 * 16;
    var pos = 0;
    
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
    
    function done () { if (cb) cb(null) }
};

IDB.prototype.createReadStream = function (opts) {
    var self = this;
    if (typeof opts === 'string') opts = { key: opts };
    var trans = self.db.transaction(['blobs'], 'readonly')
    var store = trans.objectStore('blobs');
    
    var r = new Readable;
    r._reading = false;
    r._read = function () {
        if (r._waiting) {
            r._reading = false;
            var f = r._waiting;
            r._waiting = null;
            f();
        }
        else r._reading = true;
    };
    
    var key = opts.key;
    var gt = key + '!';
    var lt = key + '!~';
    var range = IDBKeyRange.bound(gt, lt, false, true);
    
    var cur = store.openCursor(range);
    var first = true;
    var meta = null;
    
    backify(cur, function (err, ev) {
        if (err) return r.emit('error', err);
        
        var cursor = ev.target.result;
        if (first && cursor) {
            first = false;
            meta = cursor.value;
            cursor.continue();
        }
        else if (cursor) {
            r.push(Buffer(cursor.value));
            if (r._reading) cursor.continue();
            else r._waiting = function () { cursor.continue() };
        }
        else r.push(null);
    });
    return r;
};

IDB.prototype.exists = function (opts, cb) {
    var self = this;
    if (typeof opts === 'string') opts = { key: opts };
    var trans = self.db.transaction(['blobs'], 'readonly');
    
    var range = IDBKeyRange.only(opts.key + '!');
    var store = trans.objectStore('blobs');
    
    backify(store.openCursor(range), function (err, ev) {
        if (err) cb(err)
        else if (ev.target.result) cb(null, true)
        else cb(null, false)
    });
};

IDB.prototype.remove = function (opts, cb) {
    var self = this;
    if (typeof opts === 'string') opts = { key: opts };
    var trans = self.db.transaction(['blobs'], 'readonly')
    var store = trans.objectStore('blobs');
    var pending = 1;
    var key = opts.key;
    
    backify(store.get(key + '!'), function (err, ev) {
        if (err) return cb(err);
        
        var value = ev.target.result;
        var trans = self.db.transaction(['blobs'],'readwrite');
        var store = trans.objectStore('blobs');
        backify(store.delete(key + '!'), callback);
        
        var max = Math.ceil(value.length / value.size) * value.size;
        for (var i = 0; i < max; i += value.size) {
            var ikey = key + '!' + pack(i, 'hex');
            pending ++;
            backify(store.delete(ikey), callback);
        }
        function callback (err) {
            if (err) { cb(err); cb = function () {} }
            else if (-- pending === 0) cb(null);
        }
    });
};

function backify (r, cb) {
    r.addEventListener('success', function (ev) { cb(null, ev) });
    r.addEventListener('error', function (err) { cb(err) });
}
