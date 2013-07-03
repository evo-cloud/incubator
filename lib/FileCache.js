var os    = require('os'),
    fs    = require('fs'),
    path  = require('path'),
    util  = require('util'),
    async = require('async'),
    mkdir = require('mkdirp'),
    bytes = require('bytes'),
    Class = require('js-class'),
    multi = require('multimeter')(process);

var Worker = Class({
    constructor: function (index, file, cache) {
        this.index = index;
        this.file = file;
        this.cache = cache;
        this.start();
    },
    
    start: function () {
        this.cache.validate(this.file, function (err, valid) {
            if (valid) {
                this.cache.complete(this);
            } else {
                var dir = path.join(this.cache.base, this.file.pkg.fullName);
                var filename = path.join(dir, this.file.file);
                var stream;
                async.series([
                    function (next) {
                        mkdir(dir, next);
                    },
                    function (next) {
                        try {
                            stream = fs.createWriteStream(filename);
                        } catch (e) {
                            next(e);
                            return;
                        }
                        next();
                    },
                    function (next) {
                        this.download(stream, next);
                    }.bind(this),
                    function (next) {
                        this.cache.validate(this.file, function (err, valid) {
                            !err && !valid && (err = new Error('File corrupted: ' + this.file.file));
                            next(err);
                        });
                    }.bind(this)
                ], function (err) {
                    this.cache.complete(this, err);
                }.bind(this));
            }
        }.bind(this));
    },
    
    download: function (stream, callback) {
        var name = this.file.pkg.fullName;
        if (name.length > 24) {
            name = name.substr(0, 21) + '...';
        } else {
            var left = 24 - name.length;
            for (var i = 0; i < left; i ++) {
                name += ' ';
            }
        }
        var bar = multi.rel(0, - this.index, {
            width: 20,
            before: name + ' [',
            after: '] ',
            solid: { text: '=' }
        });

        var done, originAt = 0, lastErr;
        var handleError = function (err, next) {
            if (err) {
                originAt ++;
                lastErr = err;
                next();
                return true;
            }
            return false;
        };
        
        async.whilst(
            function () {
                return !done && originAt < this.file.origins.length;
            }.bind(this),
            function (next) {
                this.file.origins[originAt].start(function (err, response) {
                    if (handleError(err, next)) {
                        return;
                    }
                    
                    var downloaded = 0;
                    response.stream
                        .on('data', function (data) {
                                downloaded += data.length;
                                if (response.size) {
                                    var percentage = downloaded * 100 / response.size;
                                    bar.percent(percentage,
                                                Math.floor(percentage) + ' %   '
                                                + bytes(downloaded).toUpperCase()
                                                + ' of ' + bytes(response.size).toUpperCase()
                                                + '                ');
                                }
                            })
                        .on('end', function () {
                                done = true;
                                next();
                            })
                        .resume();
                    util.pump(response.stream, stream, function (err) { handleError(err, next); });
                });
            }.bind(this),
            function () {
                callback(lastErr);
            }
        );
    }
});

var FileCache = Class(process.EventEmitter, {
    constructor: function (base, concurrency) {
        this.base = base;
        this.concurrency = concurrency;
        this._pending = [];
        this._working = [];
    },
    
    basedir: function (pkg) {
        typeof(pkg) == 'string' || (pkg = pkg.fullName);
        return path.join(this.base, pkg);
    },
    
    message: function (msg) {
        multi.write(msg);
        for (var i = 0; i <= this.concurrency; i ++) {
            multi.write('\r\n');
        }
    },
    
    enqueue: function (files) {
        Array.isArray(files) || (files = [files]);
        this._pending = this._pending.concat(files);
        this._shift();
        return this;
    },
    
    validate: function (file, callback) {
        var filename = path.join(this.base, file.pkg.fullName, file.file);
        fs.stat(filename, function (err, st) {
            if (err || !st.isFile()) {
                callback(err, false);
            } else if (file.digest) {
                file.digest.verify(filename, callback);
            } else {
                callback(null, true);
            }
        });
        return this;
    },
    
    complete: function (worker, error) {
        delete this._working[worker.index];
        this._shift();
        process.nextTick(function () {
            this.emit('complete', worker.file, error);
        }.bind(this));
    },
    
    _shift: function () {
        for (var i = 0; i < this.concurrency; i ++) {
            if (!this._working[i]) {
                var file = this._pending.shift();
                if (file) {
                    this._working[i] = new Worker(i, file, this);
                } else {
                    break;
                }
            }
        }
    }
});
    
module.exports = FileCache;