// Grunt task
var path  = require('path'),
    spawn = require('child_process').spawn;

module.exports = function (grunt) {
    grunt.registerTask('incubate', 'Incubate packages', function () {
        var cfg = grunt.config.get('incubator') || {};
        var args = [].slice.call(arguments, 0),
            done = this.async();
        if (Array.isArray(cfg.path)) {
            args = cfg.path.map(function (p) { return '--package-path=' + p; }).concat(args);
        } else if (cfg.path) {
            args.unshift('--package-path=' + cfg.path);
        }
        if (typeof(cfg.options) == 'object') {
            var opts = [];
            for (var key in cfg.options) {
                if (typeof(cfg.options[key]) == 'boolean') {
                    opts.push('--' + key);
                } else {
                    opts.push('--' + key + '=' + cfg.options[key]);
                }
            }
            if (opts.length > 0) {
                args = opts.concat(args);
            }
        }
        grunt.option('no-color') && args.unshift('--script');
        args.unshift(path.resolve(path.join(__dirname, '..', 'incubate.js')));
        args = process.execArgv.concat(args);
        spawn(process.execPath, args, { stdio: 'inherit' })
            .on('exit', function (code) {
                done(code == 0);
            });
    });
};