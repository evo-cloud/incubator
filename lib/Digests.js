var fs     = require('fs'),
    crypto = require('crypto'),
    Class  = require('js-class');

var Digest = Class({
    constructor: function (algo, value) {
        this._algo = algo;
        this._value = value;
    },
    
    verify: function (filename, callback) {
        var hash = crypto.createHash(this._algo), stream;
        try {
            stream = fs.createReadStream(filename);
        } catch (e) {
            // ignored
            process.nextTick(function () {
                callback(e, false);
            });
            return this;
        }
        stream
            .on('data', function (data) {
                    hash.update(data);
                })
            .on('end', function () {
                    var result = hash.digest('hex');
                    callback(null, result === this._value);
                }.bind(this))
            .on('error', function (err) {
                    callback(err);
                });
        return this;
    }
});

exports.parse = function (digest) {
    digest = digest.toLowerCase();
    var index = digest.indexOf(':');
    var algo = index && digest.substr(0, index);
    if (!algo || ['md5', 'sha1'].indexOf(algo) < 0) {
        throw new Error('Invalid digest: ' + digest);
    }
    return new Digest(algo, digest.substr(index + 1));
};