#!/usr/bin/env node

var conf      = require('evo-elements').Config.conf(),
    Dashboard = require('term-dashboard').Dashboard,
    bytes     = require('bytes'),
    clicolor  = require('cli-color'),
    Builder   = require('./index').Builder;

var cfg = {
    pkgPaths: conf.query('package.path'),
    buildDir: conf.query('build.dir', '_build'),
    cacheDir: conf.query('package.cache'),
    parallel: conf.query('parallel'),
    parallelMax: conf.query('parallelMax'),
    cleanBuild: conf.query('clean')
};

if (!cfg.pkgPaths) {
    if (process.env.PACKAGE_PATH) {
        cfg.pkgPaths = process.env.PACKAGE_PATH.split(':');
    } else {
        console.error('No package path found, specify via --package-path or set PACKAGE_PATH.');
        process.exit(1);
    }
}

function colWorkerId() {
    return { text: function (data) { return data.worker != undefined ? data.worker + ': ' : ''; }, width: 4, align: 'right' };
}

function colAction(text, fg) {
    return { text: text, width: 8, fg: (fg || 'gray') };
}

function colPackage(unlimited, fg) {
    var view = { key: 'pkgName', width: 20, fg: (fg || 'brightWhite'), clip: 'ellipsis' };
    if (unlimited) {
        delete view.width;
    }
    return view;
}

function colFilename(unlimited, fg) {
    var view = { key: 'filename', fg: 'gray', clip: 'ellipsis' };
    if (!unlimited) {
        view.width = 30;
        view.fg = 'brightWhite';
    }
    fg && (view.fg = fg);
    return view;
}

function colSteps() {
    return {
        text: function (data) {
            return data.stepIndex + '/' + data.totalSteps;
        },
        width: 6,
        align: 'right'
    };
}

var dashboard = new Dashboard({
    views: {
        'header': [
            { key: 'title', width: 12, fg: 'brightWhite', styles: ['underline'] },
            { key: 'action', fg: 'cyan', styles: ['bold'] }
        ],
        'footer': [
            { key: 'message', fg: 'brightWhite' }
        ],
        'idle-worker': [
            colWorkerId(),
            { text: 'Idle', fg: 'gray' }
        ],
        'package-examine': [
            colWorkerId(),
            colAction('EXAMINE'),
            colPackage(true)
        ],
        'package-loading': [
            colWorkerId(),            
            colAction('LOADING', 'green'),
            colPackage(),
            colFilename(true)
        ],
        'package-loaded': [
            colWorkerId(),            
            colAction('LOADED', 'brightGreen'),
            colPackage(),
            colFilename(true)
        ],
        'source-validating': [
            colWorkerId(),            
            colAction('CHECK'),
            colPackage(),
            colFilename(true)
        ],
        'source-validated': [
            colWorkerId(),            
            colAction('CHECK'),
            colPackage(),
            colFilename(true),
            { text: function (data) { return data.valid ? { text: 'OK', fg: 'green' } : { text: 'INVALID', fg: 'red' }; }, width: 8, align: 'right' },
            { text: ' ', width: 8 }
        ],
        'source-download': [
            colWorkerId(),            
            colAction('FETCH'),
            colPackage(),
            colFilename(),
            { key: 'url', fg: 'white', clip: 'ellipsis' }
        ],
        'source-failure': [
            colWorkerId(),            
            colAction('FAILURE', 'red'),
            colPackage(),
            colFilename(),
            { key: 'url', fg: 'white', clip: 'ellipsis' }
        ],
        'source-progress': [
            colWorkerId(),            
            colAction('FETCH', 'green'),
            colPackage(),
            colFilename(),
            { renderer: 'progressbar', key: ['downloaded', 'size'] },
            { text: function (data) { return Math.floor(data.downloaded * 100 / data.size) + '%'; }, width: 6 },
            {
                text: function (data) {
                        return data.size ? (bytes(data.downloaded) + ' / ' + bytes(data.size)).toUpperCase()
                                         : bytes(data.downloaded).toUpperCase();
                    },
                width: 20
            }
        ],
        'build-prepare': [
            colWorkerId(),            
            colAction('PREPARE'),
            colPackage(true)
        ],
        'build-step': [
            colWorkerId(),            
            colAction('BUILD', 'green'),
            colPackage(),
            colSteps()
        ],
        'build-step-event': [
            colWorkerId(),            
            colAction('BUILD', 'green'),
            colPackage(),
            colSteps(),
            { key: 'message', clip: 'ellipsis' }
        ],
        'build-finishing': [
            colWorkerId(),            
            colAction('FINISH', 'green'),
            colPackage(true)
        ],
        'build-failed': [
            colWorkerId(),
            colAction('FAILED', 'red'),
            colPackage(),
            { key: 'message', fg: 'red', clip: 'collapsis' }
        ]
    },
    
    layout: ['header', 'info', 'footer']
});

var translates = {
    package: function (msg) {
        msg.info && (msg.name = msg.info.name);
        msg.info && (msg.ver = msg.info.ver);
        msg.name && (msg.pkgName = msg.name + (msg.ver ? '-' + msg.ver : ''));
        return msg;        
    },
    
    source: function (msg) {
        msg.filename = msg.file.file;
        msg.pkgName = msg.file.pkg.fullName;
        return msg;
    },
    
    build: function (msg) {
        msg.pkgName = msg.pkg.fullName;
        msg.totalSteps = msg.pkg.buildSteps.length;
        switch (msg.stepEvent) {
            case 'command': msg.message = msg.params.command; break;
            case 'error': msg.message = msg.params.error.message; break;
        }
        msg.error && (msg.message = msg.error.message);
        return msg;
    }
};

var startTime = new Date();
dashboard
    .update('header', 0, 'header', { title: 'Incubator', action: 'LOADING' })
    .update('footer', 0, 'footer', { message: 'Incubation started at ' + startTime + ', Ctrl-C to break' });

var builder = new Builder(cfg)
    .on('packages', function () {
            dashboard
                .refresh([
                    'header',
                    'empty',
                    { name: 'worker', rows: builder.cfg.parallel },
                    'empty',
                    'footer'
                ])
                .update('header', 0, 'header', { title: 'Incubator', action: 'BUILDING' });
            for (var i = 0; i < builder.cfg.parallel; i ++) {
                dashboard.update('worker', i, 'idle-worker', { worker: i });
            }
        })
    .on('notify', function (msg) {
            var view = msg.src + '-' + msg.event;
            msg.src == 'package' ?
                dashboard.update('info', 0, view, translates[msg.src](msg)) :
                dashboard.update('worker', msg.worker, view, translates[msg.src](msg));
        });
    
builder.run(conf.args, function (err) {
    var endTime = new Date();
    dashboard
        .update('header', 0, 'header', { title: 'Incubator', action: 'COMPLETE' })
        .update('footer', 0, 'footer', {
            message: 'Incubation ' + (err ? clicolor.red('FAILED') : clicolor.green('SUCCEEDED')) + ' at ' + endTime + ', took ' + ((endTime - startTime) / 1000) + 's'
        });
    (err ? (err.errors || [err]) : []).forEach(function (err) {
        dashboard.term.fg.red().write(err.message).reset().write("\r\n");    
    });
    dashboard.term.write("\r\n");
    process.exit(err ? 1 : 0);
});