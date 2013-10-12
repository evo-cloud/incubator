#!/usr/bin/env node

var nomnom = require('nomnom'),

    Builder      = require('./index').Builder,
    TermLogger   = require('./index').TermLogger,
    StreamLogger = require('./index').StreamLogger;

var cfg = { buildDir: process.env.INCUBATE_BUILD_DIR || '_build' };
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
        'script': {
            abbr: 's',
            help: 'Output plain logs',
            flag: true,
            default: false
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
if (!cfg.parallel && process.env.INCUBATE_PARALLEL) {
    var n = parseInt(process.env.INCUBATE_PARALLEL);
    !isNaN(n) && n > 0 && (cfg.parallel = n);
}
if (!cfg.parallelMax && process.env.INCUBATE_PARALLEL_MAX) {
    var n = parseInt(process.env.INCUBATE_PARALLEL_MAX);
    !isNaN(n) && n > 0 && (cfg.parallelMax = n);
}

var builder = new Builder(cfg);
var logger = (!opts.script && process.stdout.isTTY) ? new TermLogger(builder) : new StreamLogger(builder, process.stdout);

builder
    .on('packages', function (packages) { logger.packages(packages); })
    .on('notify', function (msg) { logger.notify(msg); });

logger.start(new Date());

builder.run(opts._, function (err) {
    var endTime = new Date();
    logger.complete(err, endTime);
    process.exit(err ? 1 : 0);
});
