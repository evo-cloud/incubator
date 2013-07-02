/** @fileoverview
 * Manage packages
 */

var fs     = require('fs'),
    path   = require('path'),
    yaml   = require('js-yaml'),
    Class  = require('js-class'),
    semver = require('semver'),

    Package = require('./Package');
    
var Packages = Class({
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
        }
        return single ? reqs[0].pkg : reqs.slice(0, count).map(function (req) { return req.pkg; });
    },
    
    /** @function
     * @description Return a sorted list of packages by dependencies
     */
    order: function () {
        var pkgs = {}, sorted = [];
        Object.keys(this.packages).forEach(function (name) {
            this.packages[name].forEach(function (info) {
                var ref = {
                    pkg: info.pkg,
                    deps: info.pkg.dependencies.length,
                    consumers: Object.keys(info.pkg.consumers)
                };
                ref.deps === 0 && sorted.push(ref) || (pkgs[info.pkg.fullName] = ref);
            });
        }, this);
        
        for (var i = 0; i < sorted.length; i ++) {
            var ref = sorted[i];
            ref.consumers.forEach(function (fullName) {
                var consumerRef = pkgs[fullName];
                // assert consumerRef must be present
                if (-- consumerRef.deps === 0) {
                    sorted.push(consumerRef);
                    delete pkgs[fullName];
                }
            });
        }
        
        if (Object.keys(pkgs).length > 0) {
            throw new Error('Cyclic dependencies in ' + Object.keys(pkgs).join(','));
        }
        
        return sorted.map(function (ref) { return ref.pkg; });
    }
});

module.exports = Packages;