var Class = require('js-class'),
    _     = require('underscore'),
    fs    = require('fs'),
    path  = require('path'),
    async = require('async'),
    mkdir = require('mkdirp'),
    rmdir = require('rmdir'),
    Class = require('js-class'),

    ShellBuildEngine = require('./ShellBuildEngine');
    
var BuildEnv = Class(process.EventEmitter, {
    constructor: function (basedir, srcdir, pkg) {
        this.bldbase = path.resolve(path.join(basedir, 'bld'));
        this.blddir  = path.join(this.bldbase, pkg.fullName);
        this.relbase = path.resolve(path.join(basedir, 'rel'));
        this.reldir  = path.join(this.relbase, pkg.fullName);
        this.srcdir  = srcdir;
        this.pkg = pkg;
    },
    
    build: function (opts, done) {
        if (typeof(opts) == 'function') {
            done = opts;
            opts = {};
        }
        done && this.on('complete', done);
        
        async.waterfall([
            function (next) {
                if (opts.cleanBuild) {
                    next(null, null);
                } else {
                    fs.stat(path.join(this.blddir, 'succeeded'), function (err, st) {
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
                        files.push(path.join(this.srcdir, src.file));
                    }, this);
                    pkgs[this.pkg.fullName] = true;
                    for (var i = 0; i < chks.length; i ++) {
                        var pkg = chks[i];
                        i > 0 && files.push(path.join(this.bldbase, pkg.fullName, 'succeeded'));
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
                    this.cleanup(!err);
                    this.emit('complete', err);
                }.bind(this));                
            }
        }.bind(this));        
    },
    
    prepare: function (done) {
        this.emit('prepare', this.pkg);
        async.each([this.blddir, this.reldir], function (basedir, next) {
            async.series([
                function (next) {
                    fs.exists(basedir, function (exists) {
                        exists ? rmdir(basedir, next) : next();
                    });
                },
                function (next) {
                    mkdir(basedir, next);
                },
            ], next);
        }, done);
    },
    
    cleanup: function (succeeded) {
        this.emit('finishing', this.pkg);
        if (succeeded) {
            try {
                fs.closeSync(fs.openSync(path.join(this.blddir, 'succeeded'), 'w'));
            } catch (e) {
                // ignored
            }
        }
    },
    
    buildStep: function (step, done) {
        this._stepIndex ++;
        this._currStep = step;
        this.emit('step', this.pkg, step, this._stepIndex);
        var opts = {
            env: _.clone(process.env),
            workdir: this.blddir
        }
        step.raw.workdir && (opts.workdir = path.join(this.blddir, step.raw.workdir));
        typeof(step.raw.env) == 'object' && _.extend(opts.env, step.raw.env);
        
        var envVars = {
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
            envVars['_DEP_' + dep.pkg.name.toUpperCase().replace('-', '_')] = dep.pkg.fullName;
        });
        var varPrefix = step.raw.envPrefix || '';
        for (var name in envVars) {
            opts.env[varPrefix + name] = envVars[name];
        }
        
        async.series([
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

exports.build = function (pkg, srcdir, basedir) {
    return new BuildEnv(basedir, srcdir, pkg);
};

exports.create = function (step) {
    var engine = step.engine || 'shell';
    var factory = exports.engines[engine];
    if (!factory) {
        throw new Error('Unsupported build engine: ' + engine);
    }
    
    return factory(step);
};