var _     = require('underscore'),
    fs    = require('fs'),
    path  = require('path'),
    spawn = require('child_process').spawn,
    async = require('async'),
    mkdir = require('mkdirp'),
    rmdir = require('rmdir'),
    Class = require('js-class');

var ShellBuildEngine = Class({
    constructor: function (step) {
        this.name = step.name;
        if (!Array.isArray(step.commands)) {
            throw new Error('Expect list of commands');
        }
        this._commands = step.commands;
    },
    
    build: function (host, opts, callback) {
        var shell = process.env.SHELL || '/bin/sh';
        var options = { stdio: [process.stdin, process.stdout, process.stderr] };
        opts.workdir && (options.cwd = opts.workdir);
        opts.env && (options.env = opts.env);
        opts.stdout && (options.stdio[1] = opts.stdout);
        opts.stderr && (options.stdio[2] = opts.stderr);
        
        async.eachSeries(this._commands, function (cmd, next) {
            var ignoreCode = cmd[0] == '-';
            ignoreCode && (cmd = cmd.substr(1));
            host.stepEvent('command', { command: cmd });
            spawn(shell, ['-c', cmd], options)
                .on('error', next)
                .on('exit', function (code, signal) {
                    next(code != 0 && !ignoreCode ? new Error('Exit ' + code + ': ' + cmd) : undefined);
                });
        }, callback);
    }
});

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
                async.each(['stdout', 'stderr'], function (name, next) {
                    var stream = this.opts[name] = fs.createWriteStream(path.join(this.blddir, name + '.log'))
                        .on('open', function () {
                                stream.removeAllListeners();
                                next();
                            })
                        .on('error', next);
                }.bind(this), next);
            }.bind(this)
        ], done);
    },
    
    cleanup: function (succeeded) {
        this.emit('finishing', this.pkg);
        this.opts && this.opts.stdout && this.opts.stdout.end();
        this.opts && this.opts.stderr && this.opts.stderr.end();
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
        _.extend(opts.env, {
            BUILD_BLDBASE: this.bldbase,
            BUILD_BLDDIR:  this.blddir,
            BUILD_RELBASE: this.relbase,
            BUILD_RELDIR:  this.reldir,
            BUILD_SRCDIR:  this.srcdir,
            BUILD_PKGDIR:  path.dirname(this.pkg.filename),
            BUILD_PKGFILE: this.pkg.filename,
            BUILD_PKGDEPS: this.pkg.dependencies.map(function (dep) { return dep.pkg.fullName; }).join('\n')
        });
        step.engine.build(this, opts, done);
    },
    
    stepEvent: function (event, params) {
        this.emit('step-event', this.pkg, this._currStep, this._stepIndex, event, params);
    }
});

exports.build = function (pkg, srcdir, basedir) {
    return new BuildEnv(basedir, srcdir, pkg);
};

exports.create = function (step) {
    var engine = step.engine || 'shell';
    // TODO only one engine supported
    if (engine != 'shell') {
        throw new Error('Unsupported build engine: ' + engine);
    }
    
    return new ShellBuildEngine(step);
};