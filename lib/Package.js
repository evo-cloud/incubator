/** @fileoverview
 * Manage package metadata
 */

var fs     = require('fs'),
    yaml   = require('js-yaml'),
    Class  = require('js-class'),
    semver = require('semver');

var Package = Class({
    constructor: function (meta) {
        if (!meta) {
            throw new Error('Invalid argument');
        }
        if (!meta.package) {
            throw new Error('No section: package');
        }
        if (!meta.package.name) {
            throw new Error('No package.name');
        }
        if (!semver.valid(meta.package.version)) {
            throw new Error('Invalid version: ' + meta.package.version);
        }
        this._meta = meta;
        
        this._deps = Array.isArray(meta.package.dependencies) ?
            meta.package.dependencies.map(function (dep) {
                if (typeof(dep) == 'string') {
                    return { name: dep };
                } else if (typeof(dep) == 'object') {
                    var pkg = Object.keys(dep)[0];
                    return { name: pkg, ver: dep[pkg] };
                } else {
                    throw new Error('Invalid dependency: ' + dep);
                }
            }) : [];
        
        this._consumers = {};
    },
    
    get name() {
        return this._meta.package.name;
    },
    
    get version() {
        return this._meta.package.version;
    },
    
    get fullName() {
        return this.name + '-' + this.version;
    },
    
    get description() {
        return this._meta.package.description;
    },
    
    get dependencies() {
        return this._deps;
    },
    
    get consumers() {
        return this._consumers;
    },
    
    usedBy: function (pkg) {
        this._consumers[pkg.fullName] = pkg;
    }
}, {
    statics: {
        parse: function (fullName) {
            var m = fullName.match(/^(.+)-((\d+\.){2}\d+.*)$/);
            return m && m.length >= 3 ? { name: m[1], ver: m[2] } : { name: fullName };
        },
        
        load: function (filename) {
            var content = fs.readFileSync(filename).toString();
            return new Package(yaml.load(content));
        }
    }
});

module.exports = Package;