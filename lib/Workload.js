var Class = require('js-class');

var Workload = Class(process.EventEmitter, {
    constructor: function (concurrency) {
        this.concurrency = concurrency;
        this._waiting = [];
        this._working = [];
    },
    
    get load () {
        return this._waiting.length + Object.keys(this._working).length;
    },
    
    get busy () {
        return this.load > 0;
    },
    
    push: function (jobFn, data) {
        var self = this;
        var fn = function (job) {
            try {
                jobFn(this.workerId, function (err) {
                    self._done(err, job);
                });
            } catch (e) {
                self._done(e, job);
            }
        };
        this._waiting.push({ fn: fn, data: data });
        delete this._drained;
        this._shift();
        return this;
    },
    
    _shift: function () {
        for (var i = 0; i < this.concurrency; i ++) {
            if (!this._working[i]) {
                var job = this._waiting.shift();
                if (!job) {
                    break;
                }
                this._working[i] = job;
                job.workerId = i;
                this.emit('start', job.data, i);
                (function (job) {
                    process.nextTick(function () { job.fn(job); });
                })(job);
            }
        }
        
        if (this._waiting.length == 0 && !this._drained) {
            this._drained = true;
            this.emit('drain');
        }
    },
    
    _done: function (err, job) {
        if (job.done) {
            throw new Error('Job already completed: ' + job.workerId);
        }
        var workingJob = this._working[job.workerId];
        if (!workingJob) {
            throw new Error('Job not started: ' + job.workerId);
        }
        job.done = true;
        delete this._working[job.workerId];
        this.emit('done', err, job.data, job.workerId);

        this._shift();
        if (this._working.length == 0) {
            this.emit('idle');
        }
    }
});

module.exports = Workload;