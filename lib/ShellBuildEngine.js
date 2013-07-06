var Class = require('js-class'),
    async = require('async'),
    spawn = require('child_process').spawn;

var ShellBuildEngine = Class({
    constructor: function (step) {
        this.name = step.name;
        if (!Array.isArray(step.commands)) {
            throw new Error('Expect list of commands');
        }
        this._commands = step.commands;
    },
    
    build: function (host, opts, callback) {
        var shell = process.env.SHELL || '/bin/sh';
        var options = { stdio: [process.stdin, process.stdout, process.stderr] };
        opts.workdir && (options.cwd = opts.workdir);
        opts.env && (options.env = opts.env);
        opts.stdout && (options.stdio[1] = opts.stdout);
        opts.stderr && (options.stdio[2] = opts.stderr);
        
        async.eachSeries(this._commands, function (cmd, next) {
            var ignoreCode = cmd[0] == '-';
            ignoreCode && (cmd = cmd.substr(1));
            host.stepEvent('command', { command: cmd });
            spawn(shell, ['-c', cmd], options)
                .on('error', function (err) {
                    host.stepEvent('error', { error: err, command: cmd });
                    next(err);
                })
                .on('exit', function (code, signal) {
                    host.stepEvent('exit', { code: code, signal: signal, command: cmd });
                    next(code != 0 && !ignoreCode ? new Error('Exit ' + code + ': ' + cmd) : undefined);
                });
        }, callback);
    }
});

module.exports = ShellBuildEngine;