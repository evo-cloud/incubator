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
        this.packages = new Packages(conf.query('package.path', ['./packages']).map(function (dir) { return path.resolve(dir); }));
        this.cache = new FileCache(path.resolve(conf.query('package.cache', path.join('./_build', 'cache'))),
                                   Math.min(conf.query('parallel', os.cpus().length), conf.query('parallelMax', 4)));
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
                var pkgs = order.fetch(conf.query('parallel', os.cpus().length));
                async.each(pkgs, this._buildPkg.bind(this), function (err) {
                    pkgs.forEach(function (pkg) { order.complete(pkg); });
                    next(err);
                });
            }.bind(this),
            callback
        );
    },
    
    _buildPkg: function (pkg, done) {
        BuildEngine.build(pkg, this.cache.basedir(pkg), path.resolve(conf.query('build.dir', './_build')), done);
    }
});

new App().run();