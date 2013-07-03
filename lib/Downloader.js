var url     = require('url'),
    Class   = require('js-class'),
    httpget = require('http-get');

var DownloadStream = Class(process.EventEmitter, {
    constructor: function (response) {
        Object.keys(response.headers).some(function (head) {
            if (head.toLowerCase() == 'content-length') {
                this.size = parseInt(response.headers[head]);
                return true;
            }
            return false;
        }, this);
        this.stream = response.stream;
    }
});

var HttpDownloader = Class({
    constructor: function (url) {
        this._url = url;
    },
    
    start: function (opts, callback) {
        if (typeof(opts) == 'function') {
            callback = opts;
            opts = {};
        }
        httpget.get({ url: this._url, stream: true }, function (err, result) {
            err ? callback(err) : callback(null, new DownloadStream(result));
        });
        return this;
    }
});

exports.create = function (origin) {
    var uri = url.parse(origin);
    switch (uri.protocol) {
        case 'http:':
        case 'https:':
            return new HttpDownloader(origin);
        default:
            throw new Error('Unsupport download URL: ' + origin);
    }
};