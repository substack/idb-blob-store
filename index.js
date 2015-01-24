module.exports = IDB;

var EventEmitter = require('events').EventEmitter;
var inherits = require('inherits');
var Block = require('block-stream');
var Readable = require('readable-stream').Readable;
var through = require('through2');
var writeonly = require('write-only-stream');

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

IDB.prototype.createWriteStream = function (opts, cb) {
    var self = this;
    if (!opts) opts = {};
    
    var op = self.db.transaction(['blobs'], 'readwrite');
    var store = op.objectStore('blobs');
    var pending = 1;
    
    var key = opts.key;
    var size = opts.size || 1024 * 16;
    var pos = 0;
    
    var block = new Block(size);
    block.pipe(through(write, end));
    var w = writeonly(block);
    if (cb) w.once('error', cb);
    w.once('error', function () { op.abort() });
    return w;
    
    function write (buf, enc, next) {
        var r = store.put(buf, key + '!' + pos);
        pending ++;
        r.addEventListener('success', function () {
            if (-- pending === 0) done();
        });
        r.addEventListener('error', function (err) {
            w.emit('error', err);
        });
        pos += buf.length;
        next();
    }
    
    function end () {
        var r = store.put({ size: size, length: pos }, key + '!');
        r.addEventListener('success', function () {
            if (-- pending === 0) done();
        });
        r.addEventListener('error', function (err) {
            w.emit('error', err);
        });
    }
};

IDB.prototype.createReadStream = function (opts) {
    if (typeof opts === 'string') opts = { key: opts };
    var op = self.db.transaction(['blobs'],'read');
    var store = op.objectStore('blobs');
    
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
    var range = IDBKeyRange.bound(gt, lt, false, true); // >, <=
    
    var cur = store.openCursor(range);
    cur.addEventListener('success', function (ev) {
        var cursor = ev.target.result;
        if (cursor) {
            r.push(cursor.value);
            if (r._reading) cursor.continue();
            else r._waiting = function () { cursor.continue() };
        }
        else r.push(null);
        
    });
    cur.addEventListener('error', function (err) {
        r.emit('error', err);
    });
    return r;
};

IDB.prototype.exists = function (opts, cb) {
};

IDB.prototype.remove = function (opts, cb) {
};
