var _     = require('underscore'),
    os    = require('os'),
    path  = require('path'),
    async = require('async'),
    Class = require('js-class'),
    
    Packages    = require('./Packages'),
    FileCache   = require('./FileCache'),
    BuildEngine = require('./BuildEngine'),
    Workload    = require('./Workload');

var States = {
    package: function (event, info, filename) {
        return {
            src: 'package',
            event: event,
            info: info,
            filename: filename
        };
    },
    
    source: function (event, workerId, src, extra) {
        var msg = {
            src: 'source',
            event: event,
            worker: workerId,
            file: src
        };
        extra && _.extend(msg, extra);
        return msg;
    },
    
    build: function (event, workerId, pkg, extra) {
        var msg = {
            src: 'build',
            event: event,
            worker: workerId,
            pkg: pkg
        };
        extra && _.extend(msg, extra);
        return msg;
    }
};

var Builder = Class(process.EventEmitter, {
    constructor: function (cfg) {
        if (!cfg.buildDir) {
            throw new Error('Invalid argument: buildDir');
        }
        this.cfg = {
            pkgPaths: cfg.pkgPaths,
            buildDir: path.resolve(cfg.buildDir),
            cacheDir: cfg.cacheDir,
            parallel: parseInt(cfg.parallel),
            parallelMax: parseInt(cfg.parallelMax)
        };
        
        Array.isArray(this.cfg.pkgPaths) || (this.cfg.pkgPaths = [this.cfg.pkgPaths]);
        this.cfg.pkgPaths = this.cfg.pkgPaths.map(function (dir) { return path.resolve(dir); });
        
        if (!this.cfg.cacheDir) {
            this.cfg.cacheDir = path.join(this.cfg.buildDir, 'cache');
        } else {
            this.cfg.cacheDir = path.resolve(this.cfg.cacheDir);
        }

        isNaN(this.cfg.parallel) && (this.cfg.parallel = os.cpus().length);
        !isNaN(this.cfg.parallelMax) && this.cfg.parallel > this.cfg.parallelMax && (this.cfg.parallel = this.cfg.parallelMax);
        
        this.packages = new Packages(this.cfg.pkgPaths);
        this.cache = new FileCache(this.cfg.cacheDir);
        
        var self = this;
        this.packages
            .on('examine', function (info) { self._notify('package', 'examine', info); })
            .on('loading', function (info, filename) { self._notify('package', 'loading', info, filename); })
            .on('loaded', function (info) { self._notify('package', 'loaded', info); });
    },
    
    run: function (pkgNames, callback) {
        callback && this.on('complete', callback);
        process.nextTick(function () {
            try {
                this.packages.load(pkgNames);
            } catch (err) {
                this.emit('complete', err);
                return;
            }

            this.emit('packages', this.packages);

            async.series([
                this.download.bind(this),
                this.build.bind(this)
            ], function (err) {
                this.emit('complete', err);
            }.bind(this));        
        }.bind(this));
        return this;
    },
    
    download: function (callback) {
        var self = this, pkgs = [];
        this.packages.order().each(function (pkg, next) {
            pkgs.push(pkg);
            next();
        });
        var workload = this._workload('source', 'src');
        async.each(pkgs, function (pkg, next) {
            async.each(pkg.sources, function (src, next) {
                workload.push(function (workerId, done) {
                    self.cache.download(src)
                        .on('validating', function (file) { self._notify('source', 'validating', workerId, file); })
                        .on('validated', function (file, valid) { self._notify('source', 'validated', workerId, file, { valid: valid }); })
                        .on('failure', function (err, file, url) { self._notify('source', 'failure', workerId, file, { error: err, url: url }); })
                        .on('download', function (file, url) { self._notify('source', 'download', workerId, file, { url: url }); })
                        .on('progress', function (file, downloaded, totalSize) { self._notify('source', 'progress', workerId, file, { downloaded: downloaded, size: totalSize }); })
                        .start(done);
                }, { src: src, next: next });
            }, next);
        }, callback);
        return this;
    },
    
    build: function (callback) {
        var self = this;
        var workload = this._workload('build', 'pkg');
        this.packages.order().each(function (pkg, next) {
            workload.push(function (workerId, done) {
                BuildEngine.build(pkg, self.cache.basedir(pkg), self.cfg.buildDir)
                    .on('prepare', function (pkg) { self._notify('build', 'prepare', workerId, pkg); })
                    .on('step', function (pkg, step, stepIndex) { self._notify('build', 'step', workerId, pkg, { step: step, stepIndex: stepIndex }); })
                    .on('step-event', function (pkg, step, stepIndex, event, params) { self._notify('build', 'step-event', workerId, pkg, { step: step, stepIndex: stepIndex, stepEvent: event, params: params }); })
                    .on('finishing', function (pkg) { self._notify('build', 'finishing', workerId, pkg); })
                    .build(function (err) {
                        self._notify('build', err ? 'failed' : 'succeeded', workerId, pkg, { error: err });
                        done(err);
                    });
            }, { pkg: pkg, next: next });
        }, callback);
        return this;
    },
    
    _workload: function (source, dataField) {
        return new Workload(this.cfg.parallel)
            .on('start', function (data, workerId) { this._notify(source, 'start', workerId, data[dataField]); }.bind(this))
            .on('done', function (err, data, workerId) {
                this._notify(source, 'done', workerId, data[dataField], { error: err });
                data.next(err);
            }.bind(this));
    },
    
    _notify: function (source) {
        this.emit('notify', States[source].apply(States, [].slice.call(arguments, 1)));
    }
});

module.exports = Builder;