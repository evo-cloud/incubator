/** @fileoverview
 * Get source files from version control system
 */
var Class = require('js-class'),
    path  = require('path'),
    fs    = require('fs'),
    async = require('async'),
    mkdir = require('mkdirp'),
    rmdir = require('remove');

var Syncer = Class(process.EventEmitter, {
    constructor: function (scm, srcdir, revfile) {
        this.scm = scm;
        this.srcdir  = srcdir;
        this.revfile = revfile;
    },

    start: function () {
        var revision;
        async.waterfall([
            function (next) {
                fs.readFile(this.revfile, function (err, data) {
                    !err && data && (revision = data.toString());
                    next();
                });
            }.bind(this),
            function (next) {
                mkdir(this.srcdir, function () { next(); });
            }.bind(this),
            this._sync.bind(this),
            function (rev, next) {
                if (revision != rev) {
                    fs.writeFile(this.revfile, rev, next);
                } else {
                    next();
                }
            }.bind(this)
        ], function (err) {
            err ? this.emit('error', err)
                : this.emit('done');
        }.bind(this));
        return this;
    },

    _sync: function (callback) {
        var retries = 0, finish = false, revision;
        async.whilst(function () {
            return !finish;
        }, function (done) {
            var complete = function (err, rev) {
                revision = rev;
                finish = true;
                done(err);
            };
            this.scm.sync(this.srcdir, function (err, hint) {
                if (err) {
                    if (hint && retries < 1) {
                        retries ++;
                        rmdir(this.srcdir, function () { done(); });
                    } else {
                        complete(err);
                    }
                } else {
                    complete(null, hint);
                }
            }.bind(this));
        }.bind(this), function (err) {
            callback(err, revision);
        });
    }
});

var VersionControl = Class({
    constructor: function (scm, file) {
        this.scm = scm;
        this.file = file;

        file.repo = scm.repoUrl;
        file.dir  = scm.dirName;
        file.file = file.dir + '.revision';
    },

    validate: function (base, verification, callback) {
        if (verification) {
            // nothing to do in verification phase
            callback(null, true);
        } else {
            var file = this.file, revision;
            async.parallel([
                function (done) {
                    async.waterfall([
                        function (next) {
                            fs.stat(path.join(base, file.dir), next);
                        },
                        function (st, next) {
                            next(null, st.isDirectory());
                        }
                    ], function (err, result) {
                        !err && !result && (err = new Error('invalid'));
                        done(err);
                    });
                },
                function (done) {
                    fs.readFile(path.join(base, file.file), function (err, data) {
                        !err && data && (revision = data.toString());
                        done(err);
                    });
                }
            ], function (err) {
                err ? callback(err, false)
                    : this.scm.validate(path.join(base, file.dir), revision, callback);
            }.bind(this));
        }
    },

    sync: function (base) {
        return new Syncer(this.scm,
                            path.join(base, this.file.dir),
                            path.join(base, this.file.file)).start();
    }
});

exports.scms = {
    git: require('./Git')
};

exports.create = function (src, file) {
    var factory = exports.scms[src.scm];
    if (factory) {
        return new VersionControl(factory.create(src), file);
    }
    throw new Error('Invalid SCM provider ' + src.scm);
};
