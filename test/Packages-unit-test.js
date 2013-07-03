var assert  = require('assert'),
    path    = require('path'),
    yaml    = require('js-yaml'),
    sandbox = require('sandboxed-module');

describe('Packages', function () {
    var PKGFILES = {
        'base/a': {
            '1.0.0.yml': {
                package: {
                    name: 'a',
                    version: '1.0.0'
                }
            },
            
            '1.2.0.yml': {
                package: {
                    name: 'a',
                    version: '1.2.0'
                }
            }
        },
        
        'base/b': {
            '0.2.0.yml': {
                package: {
                    name: 'b',
                    version: '0.2.0',
                    dependencies: [
                        'a'
                    ]
                }
            }
        },
        
        'base/c': {
            '0.0.1.yml': {
                package: {
                    name: 'c',
                    version: '0.0.1',
                    dependencies: [
                        'b', 'd',
                        { a: '~1.0' }
                    ]
                }
            }
        },
        
        'base/d': {
            '0.1.0.yml': {
                package: {
                    name: 'd',
                    version: '0.1.0',
                    dependencies: [
                        { a: '~1.2' }
                    ]
                }
            }
        }
    };
    
    var Package = sandbox.require('../lib/Package', {
        requires: {
            'fs': {
                readFileSync: function (fn) {
                    var dir = path.dirname(fn);
                    var name = path.basename(fn);
                    var content = PKGFILES[dir] && PKGFILES[dir][name];
                    if (!content) {
                        throw new Error('NOENT: ' + fn);
                    }
                    return yaml.dump(content);
                }
            }
        }
    });
    
    var Packages = sandbox.require('../lib/Packages', {
        requires: {
            'fs': {
                readdirSync: function (dir) {
                    return Object.keys(PKGFILES[dir]);
                },
                
                statSync: function (fn) {
                    return Object.create({
                        isFile: function () { return true; }
                    });
                }
            },
            
            './Package': Package
        }
    });
    
    var packages;
    
    beforeEach(function () {
        packages = new Packages('base');
    });
    
    it('#versions', function () {
        assert.deepEqual(packages.versions('a'), [
            { ver: '1.2.0', file: 'base/a/1.2.0.yml' },
            { ver: '1.0.0', file: 'base/a/1.0.0.yml' }
        ]);
    });
    
    it('#select', function () {
        assert.deepEqual(packages.select('a'), { ver: '1.2.0', file: 'base/a/1.2.0.yml' });
        assert.deepEqual(packages.select('a', '>1'), undefined);
    });
    
    it('#filename', function () {
        assert.equal(packages.filename('a'), 'base/a/1.2.0.yml');
        assert.equal(packages.filename('a', '>1'), undefined);
    });
    
    it('#load single package', function () {
        packages.load('a');
        assert.ok(packages.packages['a']);
        assert.ok(packages.packages['a'][0].pkg);
        assert.equal(packages.packages['a'][0].pkg.version, '1.2.0');
        assert.equal(packages.packages['a'][0].pkg.fullName, 'a-1.2.0');
        packages.load({ name: 'a', ver: '~1.0' });
        assert.equal(packages.packages['a'][1].pkg.version, '1.0.0');
    });

    it('#load packages', function () {
        packages.load('c');
        assert.ok(packages.packages['a']);
        assert.ok(packages.packages['b']);
        assert.ok(packages.packages['c']);
        assert.ok(packages.packages['d']);
        assert.equal(packages.packages['a'][0].pkg.version, '1.2.0');
        assert.equal(packages.packages['a'][1].pkg.version, '1.0.0');
        assert.equal(packages.packages['b'][0].pkg.version, '0.2.0');
        assert.equal(packages.packages['c'][0].pkg.version, '0.0.1');
        assert.equal(packages.packages['d'][0].pkg.version, '0.1.0');
    });
    
    it('#order', function () {
        packages.load('c-0.0.1');
        var order = packages.order();
        var names = [];
        while (!order.empty) {
            var pkgs = order.fetch();
            assert.ok(pkgs);
            assert.notEqual(pkgs.length, 0);
            pkgs.forEach(function (pkg) { names.push(pkg.fullName); });
            order.complete(pkgs);
        }
        assert.deepEqual(names.slice(0, 2), ['a-1.2.0', 'a-1.0.0']);
        assert.equal(names[4], 'c-0.0.1');
    });
});