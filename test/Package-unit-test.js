var assert = require('assert'),
    
    Package = require('../lib/Package');

describe('Package', function () {
    it('#parse', function () {
        assert.deepEqual(Package.parse('name-3.2.1'), { name: 'name', ver: '3.2.1' });
        assert.deepEqual(Package.parse('name-abc-1.2.3'), { name: 'name-abc', ver: '1.2.3' });
        assert.deepEqual(Package.parse('name-1.2.3-pre'), { name: 'name', ver: '1.2.3-pre' });
        assert.deepEqual(Package.parse('name-1.2.3+build0'), { name: 'name', ver: '1.2.3+build0' });
        assert.deepEqual(Package.parse('name-1.2.3#tag'), { name: 'name', ver: '1.2.3#tag' });
        assert.deepEqual(Package.parse('name-1'), { name: 'name-1' });
        assert.deepEqual(Package.parse('name-1.2'), { name: 'name-1.2' });
        assert.deepEqual(Package.parse('name-1.x'), { name: 'name-1.x' });
    });
    
    it('#constructor', function () {
        assert.throws(function () {
            new Package();
        }, /invalid argument/i);
        assert.throws(function () {
            new Package({});
        }, /no section: package/i);
        assert.throws(function () {
            new Package({ package: {} });
        }, /no package.name/i);
        assert.throws(function () {
            new Package({ package: { name: 'abc', version: '' } });
        }, /invalid version/i);
        assert.throws(function () {
            new Package({ package: { name: 'abc', version: 'invalid' } });
        }, /invalid version/i);
        assert.throws(function () {
            new Package({ package: { name: 'abc', version: '1.2' } });
        }, /invalid version/i);
        new Package({ package: { name: 'abc', version: '1.2.3' } });
    });
});