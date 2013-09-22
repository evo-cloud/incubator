var Class     = require('js-class'),
    Dashboard = require('term-dashboard').Dashboard,
    bytes     = require('bytes'),
    clicolor  = require('cli-color');

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

var TermLogger = Class({
    constructor: function (builder) {
        this.builder = builder;
        this.dashboard = new Dashboard({
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
    },

    start: function (startTime) {
        this.startTime = startTime;
        this.dashboard
            .update('header', 0, 'header', { title: 'Incubator', action: 'LOADING' })
            .update('footer', 0, 'footer', { message: 'Incubation started at ' + startTime + ', Ctrl-C to break' });
    },

    packages: function () {
        this.dashboard
            .refresh([
                'header',
                'empty',
                { name: 'worker', rows: this.builder.cfg.parallel },
                'empty',
                'footer'
            ])
            .update('header', 0, 'header', { title: 'Incubator', action: 'BUILDING' });
        for (var i = 0; i < this.builder.cfg.parallel; i ++) {
            this.dashboard.update('worker', i, 'idle-worker', { worker: i });
        }
    },

    notify: function (msg) {
        var view = msg.src + '-' + msg.event;
        msg.src == 'package' ?
            this.dashboard.update('info', 0, view, translates[msg.src](msg)) :
            this.dashboard.update('worker', msg.worker, view, translates[msg.src](msg));
    },

    complete: function (err, endTime) {
        this.dashboard
            .update('header', 0, 'header', { title: 'Incubator', action: 'COMPLETE' })
            .update('footer', 0, 'footer', {
                message: 'Incubation ' + (err ? clicolor.red('FAILED') : clicolor.green('SUCCEEDED')) + ' at ' + endTime + ', took ' + ((endTime - this.startTime) / 1000) + 's'
            });
        (err ? (err.errors || [err]) : []).forEach(function (err) {
            this.dashboard.term.fg.red().write(err.message).reset().write("\r\n");
        }, this);
        this.dashboard.term.write("\r\n");
    }
});

module.exports = TermLogger;
