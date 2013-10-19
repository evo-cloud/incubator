#!/usr/bin/env node

var Class  = require('js-class'),
    fs     = require('fs'),
    async  = require('async'),
    nomnom = require('nomnom'),

    Builder      = require('./index').Builder,
    TermLogger   = require('./index').TermLogger,
    StreamLogger = require('./index').StreamLogger;

var cfg = { buildDir: process.env.INCUBATE_BUILD_DIR || '_build', logs: [] };
var opts = nomnom.script('incubate')
    .options({
        'package-path': {
            abbr: 'p',
            help: 'List of path to search packages',
            metavar: 'PATH',
            type: 'string',
            list: true,
            required: false,
            callback: function (val) {
                cfg.pkgPaths || (cfg.pkgPaths = []);
                cfg.pkgPaths.push(val);
            }
        },
        'build-dir': {
            help: 'Working directory for building packages',
            metavar: 'DIR',
            type: 'string',
            default: cfg.buildDir,
            callback: function (val) {
                cfg.buildDir = val;
            }
        },
        'package-cache': {
            help: 'Directory for caching downloaded files',
            metavar: 'DIR',
            type: 'string',
            required: false,
            callback: function (val) {
                cfg.cacheDir = val;
            }
        },
        'release-dir': {
            help: 'Directory for build output (releases)',
            metavar: 'DIR',
            type: 'string',
            required: false,
            callback: function (val) {
                cfg.relDir = val;
            }
        },
        'parallel': {
            abbr: 'n',
            help: 'Number of workers to work in parallel',
            metavar: 'N',
            type: 'number',
            required: false,
            callback: function (val) {
                val = parseInt(val);
                isNaN(val) || (cfg.parallel = val);
            }
        },
        'parallel-max': {
            help: 'Max number of workers to work in parallel',
            metavar: 'N',
            type: 'number',
            required: false,
            callback: function (val) {
                val = parseInt(val);
                isNaN(val) || (cfg.parallelMax = val);
            }
        },
        'clean': {
            abbr: 'c',
            help: 'Perform a clean build',
            flag: true,
            default: false,
            callback: function (val) {
                cfg.cleanBuild = val;
            }
        },
        'save-space': {
            help: 'Use as less disk space as possible (all intermediate files will be deleted)',
            flag: true,
            default: false,
            callback: function (val) {
                cfg.saveSpace = val;
            }
        },
        'script': {
            abbr: 's',
            help: 'Output plain logs',
            flag: true,
            default: false
        },
        'log': {
            abbr: 'l',
            help: 'Also logs to file (overwrite)',
            metavar: 'FILE',
            type: 'string',
            required: false,
            callback: function (val) {
                var fd = fs.openSync(val, 'w');
                cfg.logs.push(fs.createWriteStream(null, { fd: fd }));
            }
        },
        'log-append': {
            help: 'Also logs to file (append)',
            metavar: 'FILE',
            type: 'string',
            required: false,
            callback: function (val) {
                var fd = fs.openSync(val, 'a');
                cfg.logs.push(fs.createWriteStream(null, { fd: fd }));
            }
        },
        'version': {
            abbr: 'v',
            help: 'Display version and exit',
            flag: true,
            callback: function (val) {
                if (val) {
                    process.stdout.write(require('./package.json').version + "\n");
                    process.exit(0);
                }
            }
        }
    })
    .parse();

if (!cfg.pkgPaths) {
    if (process.env.INCUBATE_PACKAGE_PATH) {
        cfg.pkgPaths = process.env.INCUBATE_PACKAGE_PATH.split(':');
    } else {
        console.error('No package path found, specify via --package-path or set INCUBATE_PACKAGE_PATH.');
        process.exit(1);
    }
}

!cfg.cacheDir && process.env.INCUBATE_CACHE_DIR && (cfg.cacheDir = process.env.INCUBATE_CACHE_DIR);
!cfg.relDir && process.env.INCUBATE_RELEASE_DIR && (cfg.relDir = process.env.INCUBATE_RELEASE_DIR);
if (!cfg.parallel && process.env.INCUBATE_PARALLEL) {
    var n = parseInt(process.env.INCUBATE_PARALLEL);
    !isNaN(n) && n > 0 && (cfg.parallel = n);
}
if (!cfg.parallelMax && process.env.INCUBATE_PARALLEL_MAX) {
    var n = parseInt(process.env.INCUBATE_PARALLEL_MAX);
    !isNaN(n) && n > 0 && (cfg.parallelMax = n);
}

var SplitLogger = Class({
    constructor: function () {
        this._loggers = [];
        ['start', 'packages', 'notify', 'complete'].forEach(function (method) {
            this[method] = function () {
                var args = arguments;
                this._loggers.forEach(function (logger) {
                    logger[method].apply(logger, args);
                });
            };
        }, this);
    },

    add: function (logger) {
        this._loggers.push(logger);
    }
});

var builder = new Builder(cfg);
var logger = new SplitLogger();
logger.add((!opts.script && process.stdout.isTTY) ? new TermLogger(builder)
                                                  : new StreamLogger(builder, process.stdout));
cfg.logs.forEach(function (stream) {
    logger.add(new StreamLogger(builder, stream));
});

builder
    .on('packages', function (packages) { logger.packages(packages); })
    .on('notify', function (msg) { logger.notify(msg); });

logger.start(new Date());

builder.run(opts._, function (err) {
    var endTime = new Date();
    logger.complete(err, endTime);
    async.each(cfg.logs, function (stream, next) {
        stream.end(function () { next(); });
    }, function () {
        process.exit(err ? 1 : 0);
    });
});
