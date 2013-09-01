var url     = require('url'),
    Class   = require('js-class'),
    httpget = require('http-get'),
    ftpget  = require('ftp-get');

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
            err ? callback(err) : callback(null, { stream: result.stream, size: contentLength(result) });
        });
        return this;
    }
});

var BufferStream = Class(process.EventEmitter, {
    constructor: function (buf) {
        this._buffer = buf;
    },

    resume: function () {
        delete this._paused;
        this._next();
    },

    pause: function () {
        this._paused = true;
    },

    _next: function () {
        if (this._paused || this._done) {
            return;
        }
        if (this._data) {
            this._done = true;
            process.nextTick(function () {
                this.emit('end');
            }.bind(this));
        } else {
            this._data = true;
            process.nextTick(function () {
                this.emit('data', this._buffer);
                this._next();
            }.bind(this));
        }
    }
});

var FtpDownloader = Class({
    constructor: function (url) {
        this.url = url;
    },

    start: function (opts, callback) {
        if (typeof(opts) == 'function') {
            callback = opts;
            opts = {};
        }
        ftpget.get({ url: this.url, bufferType: 'buffer' }, function (err, result) {
            err ? callback(err) : callback(null, { stream: new BufferStream(result), size: result.length });
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
        case 'ftp:':
            return new FtpDownloader(origin);
        default:
            throw new Error('Unsupport download URL: ' + origin);
    }
};