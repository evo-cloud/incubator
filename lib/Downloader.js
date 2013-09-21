var url     = require('url'),
    Class   = require('js-class'),
    async   = require('async'),
    httpget = require('http-get'),
    ftp     = require('ftp');

function contentLength (response) {
    var size = undefined;
    Object.keys(response.headers).some(function (head) {
        if (head.toLowerCase() == 'content-length') {
            size = parseInt(response.headers[head]);
            return true;
        }
        return false;
    });
    return size;
}

var HttpDownloader = Class({
    constructor: function (url) {
        this.url = url;
    },

    start: function (opts, callback) {
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
            err ? callback(err) : callback(null, { stream: result.stream, size: contentLength(result) });
        });
        return this;
    }
});

var FtpDownloader = Class({
    constructor: function (originUrl) {
        var parsedUrl = url.parse(originUrl);
        this.connInfo = { host: parsedUrl.host, path: parsedUrl.path };
        parsedUrl.port && (this.connInfo.port = parsedUrl.port);
        if (parsedUrl.auth) {
            var tokens = parsedUrl.split(':');
            this.connInfo.user = tokens[0];
            tokens.length > 1 && (this.connInfo.password = tokens[1]);
        }
    },

    start: function (opts, callback) {
        var path = this.connInfo.path, client = new ftp();
        client
            .on('ready', function () {
                async.waterfall([
                    function (next) {
                        client.size(path, function (err, bytes) {
                            next(null, err ? null : bytes);
                        });
                    },
                    function (bytes, next) {
                        client.get(path, function (err, stream) {
                            next(err, { stream: stream, size: bytes });
                        });
                    }
                ], function (err, response) {
                    if (!err && response.stream) {
                        response.stream.on('close', function () {
                            client.removeAllListeners();
                            client.end();
                        });
                    }
                    callback(err, response);
                });
            })
            .on('error', function (err) {
                callback(err);
            })
            .connect(this.connInfo);
        return this;
    }
});

exports.create = function (origin) {
    var uri = url.parse(origin);
    switch (uri.protocol) {
        case 'http:':
        case 'https:':
            return new HttpDownloader(origin);
        case 'ftp:':
            return new FtpDownloader(origin);
        default:
            throw new Error('Unsupport download URL: ' + origin);
    }
};