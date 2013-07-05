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
        this.url = url;
    },
    
    start: function (opts, callback) {
        if (typeof(opts) == 'function') {
            callback = opts;
            opts = {};
        }
        var options = { url: this.url, stream: true };
        var uri = url.parse(this.url);
        uri.protocol == 'https:' && (options.noSslValidation = true);
        if (process.env.HTTP_PROXY) {
            uri = url.parse(process.env.HTTP_PROXY);
            if (uri.protocol == 'http:' || uri.protocol == 'https:') {
                options.proxy = {
                    host: uri.hostname,
                    port: parseInt(uri.port)
                };
                uri.protocol == 'https:' && (options.proxy.https = true);
                isNaN(options.proxy.port) && (options.proxy.port = options.proxy.https ? 443 : 80);
            }
        }
        httpget.get(options, function (err, result) {
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