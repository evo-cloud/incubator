var Class = require('js-class')
    util  = require('util');

var translates = {
    package: function (msg) {
        var text = 'PACKAGE ' + msg.event.toUpperCase() + ': ';
        if (msg.info.pkg) {
            text += msg.info.pkg.fullName;
        } else if (msg.info.ver) {
            text += msg.info.name + ' ' + msg.info.ver;
        } else {
            text += msg.info.name;
        }
        return [text];
    },

    source: function (msg) {
        return ['SOURCE ' + msg.event.toUpperCase() + ' <%s>: %s', msg.worker, msg.file.file];
    },

    'source:validated': function (msg, fmtargs) {
        fmtargs[0] += ' ' + msg.valid.toString();
        return fmtargs;
    },

    'source:failure': function (msg, fmtargs) {
        fmtargs[0] += ' ERROR: %s (%s)';
        fmtargs.push(msg.error.message);
        fmtargs.push(msg.url);
        return fmtargs;
    },

    'source:download': function (msg, fmtargs) {
        fmtargs[0] += ' (%s)';
        fmtargs.push(msg.url);
        return fmtargs;
    },

    'source:progress': function (msg, fmtargs) {
        if (msg.downloaded == 0 || (msg.size && msg.downloaded >= msg.size)) {
            fmtargs[0] += ' %s/%s';
            fmtargs.push(msg.downloaded);
            fmtargs.push(msg.size);
        } else {
            fmtargs = null;
        }
        return fmtargs;
    },

    build: function (msg) {
        return ['BUILD ' + msg.event.toUpperCase() + ' <%s>: %s', msg.worker, msg.pkg.fullName];
    },

    'build:step': function (msg, fmtargs) {
        fmtargs[0] += ' %d/%d';
        fmtargs.push(msg.stepIndex);
        fmtargs.push(msg.pkg.buildSteps.length);
        return fmtargs;
    },

    'build:step-event': function (msg, fmtargs) {
        fmtargs[0] += ' %d/%d';
        fmtargs.push(msg.stepIndex);
        fmtargs.push(msg.pkg.buildSteps.length);
        switch (msg.stepEvent) {
            case 'command':
                fmtargs[0] += ' COMMAND: %s';
                fmtargs.push(msg.params.command);
                break;
            case 'error':
                fmtargs[0] += ' ERROR: %s';
                fmtargs.push(msg.params.error.message);
                break;
            case 'exit':
                fmtargs[0] += ' EXIT: %d';
                fmtargs.push(msg.params.code);
                if (msg.params.signal != null) {
                    fmtargs[0] += ' KILLED %d';
                    fmtargs.push(msg.params.signal);
                }
                break;
        }
        return fmtargs;
    },

    'build:failed': function (msg, fmtargs) {
        fmtargs[0] += ' %s';
        fmtargs.push(msg.error.message);
        return fmtargs;
    }
};

var StreamLogger = Class({
    constructor: function (builder, stream) {
        this.builder = builder;
        this.stream = stream;
    },

    start: function (startTime) {
        this.startTime = startTime;
        this._println(startTime, 'INCUBATION START');
    },

    packages: function () {
        this._println('PACKAGES LOADED');
    },

    notify: function (msg) {
        var fmtargs = translates[msg.src](msg);
        var subproc = translates[msg.src + ':' + msg.event];
        subproc && (fmtargs = subproc(msg, fmtargs));
        fmtargs && this._println.apply(this, fmtargs);
    },

    complete: function (err, endTime) {
        this._println(endTime, 'INCUBATION COMPLETED: %s', err ? 'FAILURE ' + err.message + ' ' + err.stack.toString() : 'SUCCESS');
    },

    _println: function (time) {
        var text;
        if (time instanceof Date) {
            text = time.toISOString() + ' ' + util.format.apply(util, [].slice.call(arguments, 1));
        } else {
            text = (new Date()).toISOString() + ' ' + util.format.apply(util, arguments);
        }
        this.stream.write(text + "\n");
    }
});

module.exports = StreamLogger;
