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
    
    build: function (done) {
        done && this.on('complete', done);
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
    },
    
    prepare: function (done) {
        this.emit('prepare', this.pkg);
        this.opts = { };
        async.series([
            function (next) {
                async.each([this.blddir, this.reldir], function (basedir, next) {
                    async.series([
                        function (next) {
                            fs.exists(basedir, function (exists) {
                                exists && rmdir(basedir, next);
                                exists || next();
                            });
                        },
                        function (next) {
                            mkdir(basedir, next);
                        },
                    ], next);
                }, next);
            }.bind(this),
            function (next) {
                var stream = fs.createWriteStream(path.join(this.blddir, 'build.log'))
                    .on('open', function () {
                            stream.removeAllListeners();
                            next();
                        })
                    .on('error', next);
                this.opts.stdout = this.opts.stderr = stream;
            }.bind(this)
        ], done);
    },
    
    cleanup: function (succeeded) {
        this.emit('finishing', this.pkg);
        this.opts && this.opts.stdout && this.opts.stdout.end();
        if (succeeded) {
            try {
                fs.closeSync(fs.openSync(path.join(this.blddir, 'succeeded'), 'w'));
            } catch (e) {
                // ignored
            }
        }
        delete this.opts;
    },
    
    buildStep: function (step, done) {
        this._stepIndex ++;
        this._currStep = step;
        this.emit('step', this.pkg, step, this._stepIndex);
        var opts = {
            stdout: this.opts.stdout,
            stderr: this.opts.stderr,
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
        step.engine.build(this, opts, done);
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