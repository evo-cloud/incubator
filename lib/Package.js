/** @fileoverview
 * Manage package metadata
 */

var fs     = require('fs'),
    path   = require('path'),
    yaml   = require('js-yaml'),
    Class  = require('js-class'),
    semver = require('semver'),
    
    Digests     = require('./Digests'),
    Downloader  = require('./Downloader'),
    BuildEngine = require('./BuildEngine');

var Package = Class({
    constructor: function (meta, filename) {
        filename && (this.filename = path.resolve(filename));
        
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
        
        this._srcs = Array.isArray(meta.sources) ?
            meta.sources.map(function (src) {
                if (!src.file) {
                    throw new Error('No file name present in sources');
                }
                var file = { file: src.file, pkg: this };
                src.digest && (file.digest = Digests.parse(src.digest));
                if (!src.origins) {
                    throw new Error('Unknown origins of file ' + src.file);
                }
                file.origins = (Array.isArray(src.origins) ? src.origins : [src.origins]).map(function (origin) {
                    return Downloader.create(origin);
                });
                return file;
            }.bind(this)) : [];
        
        this._buildSteps = Array.isArray(meta.build) ?
            meta.build.map(function (step) {
                return { engine: new BuildEngine.create(step), raw: step, pkg: this };
            }.bind(this)) : [];
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
    
    get sources() {
        return this._srcs;
    },
    
    get buildSteps() {
        return this._buildSteps;
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
            return new Package(yaml.load(content), filename);
        }
    }
});

module.exports = Package;