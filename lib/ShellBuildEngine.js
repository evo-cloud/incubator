var Class = require('js-class'),
    fs    = require('fs'),
    path  = require('path'),
    async = require('async'),
    spawn = require('child_process').spawn;

var ShellBuildEngine = Class({
    constructor: function (step) {
        this.name = step.name;
        if (step.script) {
            this._interpreter = step.interpreter;
            this._script = step.script;
            typeof(this._args) == 'string' && (this._args = [this._args]);
            this._execute = this._executeScript;
        } else {
            if (!Array.isArray(step.commands)) {
                throw new Error('Expect list of commands');
            }
            this._commands = step.commands;
            this._execute = this._executeCommands;
        }
    },
    
    build: function (host, opts, callback) {
        var options = { stdio: [process.stdin, process.stdout, process.stderr] };
        opts.workdir && (options.cwd = opts.workdir);
        opts.env && (options.env = opts.env);
        opts.stdout && (options.stdio[1] = opts.stdout);
        opts.stderr && (options.stdio[2] = opts.stderr);
        this._execute(host, opts, options, callback);                
    },
    
    _executeScript: function (host, opts, spawnOpts, callback) {
        var filename = path.join(host.blddir, 'script-' + opts.index);
        var cmd = this._interpreter ? this._interpreter + ' ' + filename : filename;
        async.series([
            function (next) {
                fs.writeFile(filename, this._script, next);
            }.bind(this),
            function (next) {
                this._spawn(cmd, spawnOpts, host, { script: !this._interpreter }, next);
            }.bind(this)
        ], callback);
    },
    
    _executeCommands: function (host, opts, spawnOpts, callback) {
        async.eachSeries(this._commands, function (cmd, next) {
            var ignoreCode = cmd[0] == '-';
            ignoreCode && (cmd = cmd.substr(1));
            this._spawn(cmd, spawnOpts, host, { script: false, ignoreCode: ignoreCode }, next);
        }.bind(this), callback);
    },
    
    _spawn: function (cmd, opts, host, ctrl, callback) {
        var args = [cmd];
        ctrl.script || args.unshift('-c');
        host.stepEvent('command', { command: cmd });
        spawn(process.env.SHELL || '/bin/sh', args, opts)
            .on('error', function (err) {
                host.stepEvent('error', { error: err, command: cmd });
                callback(err);
            })
            .on('exit', function (code, signal) {
                host.stepEvent('exit', { code: code, signal: signal, command: cmd });
                var err;
                if (code != 0 && !ctrl.ignoreCode) {
                    var msg = 'Exit ' + code;
                    signal != undefined && (msg += ' killed by ' + signal);
                    err = new Error(msg + ': ' + cmd);
                }
                callback(err);
            });
    }
});

module.exports = ShellBuildEngine;