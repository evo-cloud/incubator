var fs    = require('fs'),
    path  = require('path'),
    util  = require('util'),
    async = require('async'),
    mkdir = require('mkdirp'),
    Class = require('js-class');

var Downloader = Class(process.EventEmitter, {
    constructor: function (file, cache) {
        this.file = file;
        this.cache = cache;
    },
    
    start: function (done) {
        done && this.on('complete', done);
        this.emit('validating', this.file);
        this.cache.validate(this.file, function (err, valid) {
            this.emit('validated', this.file, valid);
            valid ? this._complete() : this._download();
        }.bind(this));
    },
    
    _download: function () {
        var dir = path.join(this.cache.base, this.file.pkg.fullName);
        var filename = path.join(dir, this.file.file);
        var stream, self = this;
        async.series([
            function (next) {
                mkdir(dir, next);
            },
            function (next) {
                var err;
                try {
                    stream = fs.createWriteStream(filename);
                } catch (e) {
                    err = e;
                }
                next(err);
            },
            function (next) {
                this._downloadStream(stream, next);
            }.bind(this),
            function (next) {
                self.cache.validate(self.file, function (err, valid) {
                    !err && !valid && (err = new Error('File corrupted: ' + self.file.file));
                    next(err);
                });
            }
        ], this._complete.bind(this));        
    },
    
    _downloadStream: function (stream, callback) {
        var done, originAt = 0, lastErr, self = this;

        var handleError = function (err, next) {
            if (err) {
                originAt < self.file.origins.length && self.emit('failure', err, self.file, self.file.origins[originAt].url);
                originAt ++;
                lastErr = err;
                next();
                return true;
            }
            return false;
        };
        
        async.whilst(
            function () {
                return !done && originAt < self.file.origins.length;
            },
            function (next) {
                self.emit('download', self.file, self.file.origins[originAt].url);
                self.file.origins[originAt].start(function (err, response) {
                    if (handleError(err, next)) {
                        return;
                    }
                    
                    var downloaded = 0;
                    response.stream
                        .on('data', function (data) {
                                downloaded += data.length;
                                self.emit('progress', self.file, downloaded, response.size);
                            })
                        .on('end', function () {
                                done = true;
                                next();
                            })
                        .resume();
                    util.pump(response.stream, stream, function (err) { handleError(err, next); });
                });
            },
            function () {
                callback(lastErr);
            }
        );
    },
    
    _complete: function (err) {
        this.emit('complete', err);
    }
});

var FileCache = Class(process.EventEmitter, {
    constructor: function (base) {
        this.base = base;
    },
    
    basedir: function (pkg) {
        typeof(pkg) == 'string' || (pkg = pkg.fullName);
        return path.join(this.base, pkg);
    },

    download: function (file) {
        return new Downloader(file, this);
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
    }
});
    
module.exports = FileCache;