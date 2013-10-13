var fs    = require('fs'),
    path  = require('path'),
    util  = require('util'),
    async = require('async'),
    mkdir = require('mkdirp'),
    Class = require('js-class');

var DownloadBase = Class(process.EventEmitter, {
    constructor: function (file, cache) {
        this.file = file;
        this.cache = cache;
    },

    start: function (done) {
        done && this.once('complete', done);
        this.emit('validating', this.file);
        this.validate(false, function (err, valid) {
            this.emit('validated', this.file, valid);
            valid ? this.complete() : this.download();
        }.bind(this));
    },

    complete: function (err) {
        this.emit('complete', err);
    }
});

var Downloader = Class(DownloadBase, {
    constructor: function () {
        DownloadBase.prototype.constructor.apply(this, arguments);
    },

    download: function () {
        var filename = path.join(this.cache.base, this.file.file);
        var dir = path.dirname(filename);   // in case file contains sub-directories
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
                self.validate(true, function (err, valid) {
                    !err && !valid && (err = new Error('File corrupted: ' + self.file.file));
                    next(err);
                });
            }
        ], this.complete.bind(this));
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
                self.file.origins[originAt].start({}, function (err, response) {
                    if (handleError(err, next)) {
                        return;
                    }

                    var downloaded = 0, errReported;
                    response.stream
                        .on('data', function (data) {
                                downloaded += data.length;
                                self.emit('progress', self.file, downloaded, response.size);
                            })
                        .on('end', function () {
                                done = true;
                                next();
                            })
                        .on('error', function (err) {
                            if (err && !errReported) {
                                errReported = true;
                                handleError(err, next);
                            }
                        })
                        .pipe(stream);
                    response.stream.resume();
                });
            },
            function () {
                callback(lastErr);
            }
        );
    },

    validate: function (verification, callback) {
        if (this.file.packaged) {
            // for packaged files, they are always validated
            callback(null, true);
        } else {
            var filename = path.join(this.cache.base, this.file.file);
            fs.stat(filename, function (err, st) {
                if (err || (!st.isFile() && !this.file.isDir) || (!st.isDirectory() && this.file.isDir)) {
                    callback(err, false);
                } else if (!this.file.isDir && this.file.digest) {
                    this.file.digest.verify(filename, callback);
                } else {
                    // use default verification if no digest specified
                    callback(null, verification);
                }
            }.bind(this));
        }
    }
});

var SourceSync = Class(DownloadBase, {
    constructor: function (file, cache) {
        DownloadBase.prototype.constructor.apply(this, arguments);
    },

    validate: function (verification, callback) {
        this.file.scm.validate(this.cache.base, verification, callback);
    },

    download: function () {
        this.file.scm.sync(this.cache.base)
            .on('error', this.complete.bind(this))
            .on('progress', function (completed, total) {
                this.emit('progress', this.file, completed, total);
            }.bind(this))
            .on('done', function () { this.complete(); }.bind(this))
        this.emit('download', this.file, this.file.repo);
    }
});

var FileCache = Class(process.EventEmitter, {
    constructor: function (base) {
        this.base = base;
    },

    basedir: function (pkg) {
        return this.base;
    },

    download: function (file) {
        return file.scm ? new SourceSync(file, this) : new Downloader(file, this);
    }
});

module.exports = FileCache;