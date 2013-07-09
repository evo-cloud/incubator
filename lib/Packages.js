/** @fileoverview
 * Manage packages
 */

var fs     = require('fs'),
    path   = require('path'),
    async  = require('async'),
    yaml   = require('js-yaml'),
    Class  = require('js-class'),
    semver = require('semver'),

    Package = require('./Package');

var Packages = Class(process.EventEmitter, {
    constructor: function (loadPaths) {
        this.paths = Array.isArray(loadPaths) ? loadPaths : (loadPaths ? [loadPaths] : []);
        this.packages = {};
    },

    /** @function
     * @description List all available versions of a package
     */
    versions: function (name) {
        var versions = [];
        this.paths.forEach(function (base) {
            var files, dir = path.join(base, name);
            try {
                fs.readdirSync(dir).forEach(function (fn) {
                    try {
                        var stat = fs.statSync(path.join(dir, fn));
                        var m = stat.isFile() && fn.match(/^(.+)\.yml$/i);
                        if (m && m.length >= 2 && semver.valid(m[1])) {
                            versions.push({ ver: m[1], file: path.join(dir, fn) });
                        }
                    } catch (e) {
                        // ignored
                    }
                });
            } catch (e) {
                // ignored
            }
        });
        return versions.sort(function (v1, v2) {
            return semver.lt(v1.ver, v2.ver) ? 1 : (semver.gt(v1.ver, v2.ver) ? -1 : 0);
        });
    },

    /** @function
     * @description Find the newest matched version
     */
    select: function (name, versionReq) {
        var matched;
        this.versions(name).some(function (info) {
            if (!versionReq || semver.satisfies(info.ver, versionReq)) {
                matched = info;
                return true;
            }
            return false;
        });
        return matched;        
    },
    
    /** @function
     * @description Get file name of specified package with version
     */
    filename: function (name, versionReq) {
        var info = this.select(name, versionReq);
        return info && info.file;
    },

    /** @function
     * @description Load packages
     */
    load: function (packages) {
        var single = false;
        if (typeof(packages) == 'string' ||
            (typeof(packages) == 'object' && packages.name)) {
            packages = [packages];
            single = true;
        }
        if (!Array.isArray(packages)) {
            throw new Error('Invalid argument');
        }

        var reqs = packages.map(function (pkg) {
            var info;
            if (typeof(pkg) == 'string') {
                info = Package.parse(pkg);
            } else if (pkg.name) {
                info = pkg;
            }
            if (!info) {
                throw new Error("Invalid package name: " + pkg);
            }
            return info;
        });
        var count = reqs.length;
        for (var i = 0; i < reqs.length; i ++) {
            var req = reqs[i];
            
            this.emit('examine', req);
            var loadedVers = this.packages[req.name];
            if (loadedVers && loadedVers.some(function (info) {
                    if (!req.ver || semver.satisfies(info.ver, req.ver)) {
                        req.pkg = info.pkg;
                        req.consumer && req.pkg.usedBy(req.consumer);
                        return true;
                    }
                    return false;
                })) {
                continue;
            }
            var filename = this.filename(req.name, req.ver);
            if (!filename) {
                throw new Error('Package not found: ' + req.name + (req.ver ? '-' + req.ver : ''));
            }
            
            this.emit('loading', req, filename);
            req.pkg = Package.load(filename);
            req.ver = req.pkg.version;
            req.consumer && req.pkg.usedBy(req.consumer);
            delete req.consumer;
            reqs = reqs.concat(req.pkg.dependencies.map(function (dep) { dep.consumer = req.pkg; return dep; }));
            if ((this.packages[req.name] || (this.packages[req.name] = [])).every(function (info, index, vers) {
                    if (semver.lt(info.ver, req.ver)) {
                        vers.splice(index, 0, req);
                        return false;
                    }
                    return true;
                })) {
                this.packages[req.name].push(req);
            };
            
            this.emit('loaded', req);
        }
        return single ? reqs[0].pkg : reqs.slice(0, count).map(function (req) { return req.pkg; });
    },
    
    /** @function
     * @description Return a sorted list of packages by dependencies
     */
    order: function () {
        return new Order(this.packages);
    }
});

/** @class
 * @description Provide a list of packages which can be fetched according to the dependencies
 */
var Order = Class({
    constructor: function (packages) {
        this._pkgs = {};
        this._sorted = [];
        Object.keys(packages).forEach(function (name) {
            packages[name].forEach(function (info) {
                var ref = {
                    pkg: info.pkg,
                    deps: info.pkg.dependencies.length
                };
                ref.deps === 0 && this._sorted.push(ref) || (this._pkgs[info.pkg.fullName] = ref);
            }, this);
        }, this);
    },
    
    /** @property
     * @description Get number of pending packages
     */
    get pendings() {
        return Object.keys(this._pkgs).length;
    },
    
    /** @property
     * @description Get number of packages which are ready
     */
    get ready() {
        return this._sorted.length;
    },
    
    /** @property
     * @description Indicate there's no package left
     */
    get empty() {
        return !this.ready && !this.pendings;
    },
    
    /** @function
     * @description Get a numnber of ready packages
     */
    fetch: function (count) {
        count || (count = 1);
        (count < 0 || count == 'all') && (count = this._sorted.length);
        var refs = this._sorted.slice(0, count);
        this._sorted.splice(0, count);
        return refs.map(function (ref) { return ref.pkg; });
    },
    
    /** @function
     * @description Indicate the completion of packages and try to make their consumers ready
     */
    complete: function (pkgs) {
        if (!Array.isArray(pkgs)) {
            pkgs = [pkgs];
        }
        pkgs.forEach(function (pkg) {
            Object.keys(pkg.consumers).forEach(function (fullName) {
                var consumerRef = this._pkgs[fullName];
                // assert consumerRef must be present
                if (-- consumerRef.deps === 0) {
                    this._sorted.push(consumerRef);
                    delete this._pkgs[fullName];
                }
            }, this);            
        }, this);
        return this.ready;
    },
    
    /** @function
     * @description Enumeration
     */
    each: function (iterator, count, callback) {
        if (typeof(count) == 'function') {
            callback = count;
            count = 'all';
        }
        var self = this, total = 0, completed = 0, fetchNext, errors = [];
        var isFinished = function (err) {
            err && errors.push(err);
            if (completed >= total) {
                var _done = callback;
                callback = null;
                if (_done) {
                    if (errors.length > 1) {
                        err = new Error('Multiple Errors');
                        err.errors = errors;
                    } else if (errors.length > 0) {
                        err = errors[0];
                    } else {
                        err = undefined;
                    }
                    _done(err);
                }
            }
        };
        
        async.whilst(
            function () { return !self.empty; },
            function (next) {
                var pkgs = self.fetch(count);
                if (pkgs.length > 0) {
                    total += pkgs.length;
                    fetchNext = next;
                    async.each(pkgs, function (pkg, next) {
                        iterator(pkg, function (err) {
                            self.complete(pkg);
                            completed ++;
                            if (fetchNext) {
                                var _next = fetchNext;
                                fetchNext = null;
                                _next(err);
                            } else {
                                isFinished(err);
                            }
                            next();
                        });
                    });
                } else {
                    fetchNext = next;
                }
            },
            isFinished
        );
        return this;
    }
});

module.exports = Packages;