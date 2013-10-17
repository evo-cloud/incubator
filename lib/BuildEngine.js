var Class = require('js-class'),
    _     = require('underscore'),
    fs    = require('fs'),
    path  = require('path'),
    async = require('async'),
    mkdir = require('mkdirp'),
    rmdir = require('remove'),
    Class = require('js-class'),

    ShellBuildEngine = require('./ShellBuildEngine');

var BuildEnv = Class(process.EventEmitter, {
    constructor: function (pkg, info) {
        this.pkg  = pkg;
        this.info = info;
        this.bldbase = path.resolve(path.join(info.basedir, 'bld'));
        this.blddir  = path.join(this.bldbase, pkg.fullName);
        this.relbase = path.resolve(info.outdir || path.join(info.basedir, 'rel'));
        this.reldir  = path.join(this.relbase, pkg.fullName);
        this.srcdir  = info.srcdir;
        this._successFlag = path.join(this.bldbase, this.pkg.fullName + '.success');
    },

    build: function (opts, done) {
        if (typeof(opts) == 'function') {
            done = opts;
            opts = {};
        }
        done && this.once('complete', done);

        async.waterfall([
            function (next) {
                if (opts.cleanBuild) {
                    next(null, null);
                } else {
                    fs.stat(this._successFlag, function (err, st) {
                        next(null, !err && st.isFile() && st.mtime);
                    });
                }
            }.bind(this),
            function (mtime, next) {
                if (mtime) {
                    // check all related files to see if the build is up-to-date
                    var files = [], pkgs = {}, chks = [this.pkg];
                    files.push(this.pkg.filename);
                    this.pkg.sources.forEach(function (src) {
                        if (src.packaged) {
                            var basepath = path.dirname(this.pkg.filename);
                            src.subdir && (basepath = path.join(basepath, src.subdir));
                            files.push(path.join(basepath, src.file));
                        } else {
                            files.push(path.join(this.srcdir, src.file));
                        }
                    }, this);
                    pkgs[this.pkg.fullName] = true;
                    for (var i = 0; i < chks.length; i ++) {
                        var pkg = chks[i];
                        i > 0 && files.push(path.join(this.bldbase, pkg.fullName + '.success'));
                        pkg.dependencies.forEach(function (dep) {
                            if (!pkgs[dep.pkg.fullName]) {
                                pkgs[dep.pkg.fullName] = true;
                                chks.push(dep.pkg);
                            }
                        });
                    }

                    async.each(files, function (file, next) {
                        fs.stat(file, function (err, st) {
                            if (err) {
                                next(err);
                            } else if (st.mtime >= mtime) {
                                next(new Error('out-of-date'));
                            } else {
                                next();
                            }
                        });
                    }, function (err) {
                        next(null, !err);
                    });
                } else {
                    next(null, false);
                }
            }.bind(this)
        ], function (err, uptodate) {
            if (uptodate) {
                this.emit('complete');
            } else {
                async.series([
                    this.prepare.bind(this),
                    function (next) {
                        this._stepIndex = 0;
                        async.eachSeries(this.pkg.buildSteps, this.buildStep.bind(this), next);
                    }.bind(this)
                ], function (err) {
                    this.cleanup(!err, opts, function () {
                        this.emit('complete', err);
                    }.bind(this));
                }.bind(this));
            }
        }.bind(this));
    },

    prepare: function (done) {
        this.emit('prepare', this.pkg);
        async.each([this.blddir, this.reldir], function (basedir, next) {
            async.series([
                function (next) {
                    fs.exists(this._successFlag, function (exists) {
                        exists ? rmdir(this._successFlag, function () { next(); }) : next();
                    }.bind(this));
                }.bind(this),
                function (next) {
                    fs.exists(basedir, function (exists) {
                        exists ? rmdir(basedir, next) : next();
                    });
                },
                function (next) {
                    mkdir(basedir, next);
                },
            ], next);
        }.bind(this), done);
    },

    cleanup: function (succeeded, opts, callback) {
        this.emit('finishing', this.pkg);
        if (succeeded) {
            try {
                fs.closeSync(fs.openSync(this._successFlag, 'w'));
            } catch (e) {
                // ignored
            }
            if (opts.saveSpace) {
                rmdir(this.blddir, callback);
                return;
            }
        }
        callback();
    },

    buildStep: function (step, done) {
        this._stepIndex ++;
        this._currStep = step;
        this.emit('step', this.pkg, step, this._stepIndex);
        var opts = {
            worker: this.info.worker,
            index:  this._stepIndex,
            env:    _.clone(process.env),
            workdir: this.blddir
        }
        step.raw.workdir && (opts.workdir = path.join(this.blddir, step.raw.workdir));
        typeof(step.raw.env) == 'object' && _.extend(opts.env, step.raw.env);

        var paths = [];
        Array.isArray(step.raw.paths) && step.raw.paths.forEach(function (pathInfo) {
            var pkg;
            if (this.pkg.dependencies.some(function (dep) {
                    pkg = dep.pkg;
                    return dep.name == pathInfo.dep;
                })) {
                var dir = path.join(this.relbase, pkg.fullName);
                if (Array.isArray(pathInfo.dirs)) {
                    pathInfo.dirs.forEach(function (subdir) {
                        paths.push(path.join(dir, subdir));
                    });
                } else if (pathInfo.dir) {
                    paths.push(path.join(dir, pathInfo.dir));
                } else {
                    paths.push(dir);
                }
            }
        }, this);
        if (paths.length > 0) {
            opts.env.PATH && paths.push(opts.env.PATH);
            opts.env.PATH = paths.join(':');
        }

        var envVars = {
            _BLDSLOT: this.info.worker,
            _BLDBASE: this.bldbase,
            _BLDDIR:  this.blddir,
            _RELBASE: this.relbase,
            _RELDIR:  this.reldir,
            _SRCDIR:  this.srcdir,
            _PKGDIR:  path.dirname(this.pkg.filename),
            _PKGFILE: this.pkg.filename,
            _PKGDEPS: this.pkg.dependencies.map(function (dep) { return dep.pkg.fullName; }).join('\n')
        };
        this.pkg.dependencies.forEach(function (dep) {
            envVars['_DEP_' + dep.pkg.name.toUpperCase().replace(/-/g, '_')] = dep.pkg.fullName;
        });
        var varPrefix = step.raw.envPrefix || '';
        for (var name in envVars) {
            opts.env[varPrefix + name] = envVars[name];
        }

        async.series([
            function (next) {
                if (typeof(step.raw.scripts) == 'object') {
                    async.each(Object.keys(step.raw.scripts), function (name, next) {
                        var content = step.raw.scripts[name] || '';
                        fs.writeFile(path.join(this.blddir, name), content, next);
                    }.bind(this), next);
                } else {
                    next();
                }
            }.bind(this),
            function (next) {
                var basename = path.join(this.blddir, 'build-' + this._stepIndex + '-');
                async.each(['out', 'err'], function (suffix, next) {
                    fs.open(basename + suffix + '.log', 'w', function (err, fd) {
                        !err && (opts['std' + suffix] = fd);
                        next(err);
                    });
                }, next);
            }.bind(this),
            function (next) {
                step.engine.build(this, opts, next);
            }.bind(this)
        ], function (err) {
            opts.stdout && fs.close(opts.stdout, function () { });
            opts.stderr && fs.close(opts.stderr, function () { });
            done(err);
        });
    },

    stepEvent: function (event, params) {
        this.emit('step-event', this.pkg, this._currStep, this._stepIndex, event, params);
    }
});

exports.engines = {
    shell: function (step) { return new ShellBuildEngine(step); }
};

exports.build = function (pkg, info) {
    return new BuildEnv(pkg, info);
};

exports.create = function (step) {
    var engine = step.engine || 'shell';
    var factory = exports.engines[engine];
    if (!factory) {
        throw new Error('Unsupported build engine: ' + engine);
    }

    return factory(step);
};