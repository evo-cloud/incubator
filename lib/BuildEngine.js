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
    
    build: function (opts, callback) {
        var shell = process.env.SHELL || '/bin/sh';
        var options = { stdio: [process.stdin, process.stdout, process.stderr] };
        opts.workdir && (options.cwd = opts.workdir);
        opts.env && (options.env = opts.env);
        opts.stdout && (opts.stdio[1] = opts.stdout);
        opts.stderr && (opts.stdio[2] = opts.stderr);
        
        async.eachSeries(this._commands, function (cmd, next) {
            var ignoreCode = cmd[0] == '-';
            ignoreCode && (cmd = cmd.substr(1));
            spawn(shell, ['-c', cmd], options)
                .on('error', next)
                .on('exit', function (code, signal) {
                    next(code != 0 && !ignoreCode ? new Error('Exit ' + code + ': ' + cmd) : undefined);
                });
        }, callback);
    }
});

var BuildEnv = Class({
    constructor: function (basedir, srcdir, pkg) {
        this.builddir = path.resolve(path.join(basedir, 'build', pkg.fullName));
        this.shipdir = path.resolve(path.join(basedir, 'ship', pkg.fullName));
        this.srcdir = srcdir;
        this.pkg = pkg;
    },
    
    build: function (done) {
        async.series([
            this.prepare.bind(this),
            function (next) {
                async.eachSeries(this.pkg.buildSteps, this.buildStep.bind(this), next);
            }
        ], function (err) {
            this.cleanup();
            done(err)
        }.bind(this));
    },
    
    prepare: function (done) {
        this.opts = { };
        
        async.series([
            function (next) {
                async.each([this.builddir, this.shipdir], function (basedir, next) {
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
                    var stream = this.opts[name] = fs.createWriteStream(path.join(this.builddir, name + '.log'))
                        .on('open', function () {
                                stream.removeAllListeners();
                                next();
                            })
                        .on('error', next);
                }.bind(this), next);
            }.bind(this)
        ], done);
    },
    
    cleanup: function () {
        this.opts && this.opts.stdout && this.opts.stdout.end();
        this.opts && this.opts.stderr && this.opts.stderr.end();
        delete this.opts;
    },
    
    buildStep: function (step, done) {
        var opts = {
            stdout: this.opts.stdout,
            stderr: this.opts.stderr,
            env: _.clone(process.env),
            workdir: this.builddir
        }
        step.raw.workdir && (opts.workdir = path.join(this.builddir, step.raw.workdir));
        typeof(step.raw.env) == 'object' && _.extend(opts.env, step.raw.env);
        opts.env.BUILD_BASEDIR = this.builddir;
        opts.env.BUILD_SHIPDIR = this.shipdir;
        opts.env.BUILD_SRCDIR  = this.srcdir;
        opts.env.BUILD_PKGDIR  = path.dirname(this.pkg.filename);
        opts.env.BUILD_PKGFILE = this.pkg.filename;
        step.engine.build(opts, done);
    }
});

exports.build = function (pkg, srcdir, basedir, callback) {
    new BuildEnv(pkg, srcdir, basedir).build(callback);
};

exports.create = function (step) {
    var engine = step.engine || 'shell';
    // TODO only one engine supported
    if (engine != 'shell') {
        throw new Error('Unsupported build engine: ' + engine);
    }
    
    return new ShellBuildEngine(step);
};