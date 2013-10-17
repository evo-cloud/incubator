/** @fileoverview
 * SCM: git
 */

var Class = require('js-class'),
    path  = require('path'),
    fs    = require('fs'),
    url   = require('url'),
    exec  = require('child_process').exec,
    async = require('async');

function latestCommit(out) {
    var revision;
    out.split("\n").some(function (line) {
        var m = line.match(/^commit\s+(\S+)/);
        m && m[1] && (revision = m[1]);
        return !!m;
    });
    return revision;
}

var GitSCM = Class({
    constructor: function (src) {
        this.repoUrl = src.repo;
        var parsedUrl = url.parse(src.repo);
        this.repoName = path.basename(parsedUrl.path);
        this.dirName  = src.dir || this.repoName.replace(/\.git$/i, '');
        this.checkout = src.checkout;
        this.master = src.master || 'master';
        this.gitcmd = src.gitcmd || 'git';
    },

    sync: function (dir, callback) {
        var retry;
        async.waterfall([
            function (next) {
                fs.stat(path.join(dir, '.git'), function (err, st) {
                    next(null, err ? null : st);
                });
            },
            function (st, next) {
                if (st && st.isDirectory()) {
                    next(null, false);
                } else if (st) {
                    retry = true;
                    next(new Error('invalid'));
                } else {
                    next(null, true);
                }
            },
            function (clone, next) {
                clone ? this._git(null, 'clone', [this.repoUrl, dir], next) : next(null, null);
            }.bind(this),
            function (out, next) {
                this._git(dir, 'fetch', ['--all'], next);
            }.bind(this),
            function (out, next) {
                var args = [this.checkout || 'master'];
                this._git(dir, 'checkout', args, next);
            }.bind(this),
            function (out, next) {
                if (this.checkout && this.checkout != 'master') {
                    next(null, null);
                } else {
                    this._git(dir, 'pull', [], next);
                }
            }.bind(this),
            function (out, next) {
                this._git(dir, 'log', ['-1'], next);
            }.bind(this)
        ], function (err, out) {
            var revision;
            !err && out && (revision = latestCommit(out));
            callback(err, err ? retry : revision);
        });
    },

    validate: function (dir, revision, callback) {
        if (this.checkout && this.checkout == revision) {
            this._git(dir, 'log', ['-1'], function (err, out) {
                var commit;
                !err && out && (commit = latestCommit(out));
                callback(err, err ? false : (commit == revision));
            });
        } else {
            // current revision is not expected to be checkout
            // or always sync if checkout master
            callback(null, false);
        }
    },

    _git: function (dir, cmd, args, callback) {
        var opts = {};
        dir && (opts.cwd = dir);
        var cmdline = this.gitcmd + ' ' + cmd + ' ' + args.join(' ');
        exec(cmdline, opts, function (err, stdout, stderr) {
            callback(err, stdout);
        });
    }
});

exports.create = function (src) {
    return new GitSCM(src);
};