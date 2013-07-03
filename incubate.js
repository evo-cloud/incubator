var os       = require('os'),
    path     = require('path'),
    async    = require('async'),
    Class    = require('js-class'),
    elements = require('evo-elements'),
    conf     = elements.Config.conf(),
    
    Packages    = require('./lib/Packages'),
    FileCache   = require('./lib/FileCache'),
    BuildEngine = require('./lib/BuildEngine');
    
var App = Class({
    constructor: function () {
        this.cfg = {
            pkgPaths: conf.query('package.path', ['./packages']),
            cacheDir: path.resolve(conf.query('package.cache', path.join('_build', 'cache'))),
            buildDir: path.resolve(conf.query('build.dir', '_build')),
            parallel: parseInt(conf.query('parallel')),
            parallelMax: parseInt(conf.query('parallelMax'))
        };
        Array.isArray(this.cfg.pkgPaths) || (this.cfg.pkgPaths = [this.cfg.pkgPaths]);
        this.cfg.pkgPaths = this.cfg.pkgPaths.map(function (dir) { return path.resolve(dir); });
        isNaN(this.cfg.parallel) && (this.cfg.parallel = os.cpus().length);
        isNaN(this.cfg.parallelMax) && (this.cfg.parallelMax = 4);
        this.cfg.parallel > this.cfg.parallelMax && (this.cfg.parallel = this.cfg.parallelMax);
        
        this.packages = new Packages(this.cfg.pkgPaths);
        this.cache = new FileCache(this.cfg.cacheDir, this.cfg.parallel);
    },
    
    run: function () {
        try {
            this.packages.load(conf.args);
        } catch (err) {
            console.error(err.message);
            process.exit(1);
        }

        async.series([
            this.download.bind(this),
            this.build.bind(this)
        ], function (err) {
            err && console.error(err.message);
            err && process.exit(1);
            process.exit(0);
        });
    },
    
    download: function (callback) {
        var completed = 0, total = 0;
        var complete = function (err) {
            this.cache.removeAllListeners();
            console.log('');
            callback(err);
        }.bind(this);
        
        this.cache.on('complete', function (file, err) {
            err && complete(err);
            err || (++ completed && completed >= total && complete());
        }).message('Downloading packages ...');
        
        var order = this.packages.order();
        async.whilst(
            function () { return !order.empty; },
            function (next) {
                var pkgs = order.fetch('all');
                total += pkgs.length;
                pkgs.forEach(function (pkg) {
                    pkg.sources.forEach(function (src) {
                        this.cache.enqueue(src);
                    }.bind(this));
                }.bind(this));
                order.complete(pkgs);
                next();
            }.bind(this),
            function () { completed >= total && complete(); }
        );
    },
    
    build: function (callback) {
        var order = this.packages.order();
        async.whilst(
            function () { return !order.empty; },
            function (next) {
                var pkgs = order.fetch(this.cfg.parallel);
                async.each(pkgs, this._buildPkg.bind(this), function (err) {
                    pkgs.forEach(function (pkg) { order.complete(pkg); });
                    next(err);
                });
            }.bind(this),
            callback
        );
    },
    
    _buildPkg: function (pkg, done) {
        console.log('BUILD ' + pkg.fullName);        
        BuildEngine.build(pkg, this.cache.basedir(pkg), this.cfg.buildDir, done);
    }
});

new App().run();