/*jshint esversion: 6 */

var LongPoller = function(config = null) {
    this.config = config;
    this.subscribers = {};
    this.lastRemoveCheck = 0;
};


LongPoller.prototype.poll = function(req, res) {
    var sid = req.query.id;
    if (!sid) sid = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    if (!sid) sid = 'anybody';

    if (!this.subscribers.hasOwnProperty(sid)) {
        this.subscribers[sid] = {
            last_poll: new Date(),
            changes: null,
            res: null,
        };
    }

    var subscriber = this.subscribers[sid];

    if (subscriber.changes) {
        // If there are waiting changes, return immediately
        subscriber.res = res;
        this.finishPoll(subscriber, sid);
    } else {
        // Else do nothing but store away the result handle to use later.
        // The poller will see his http session 'hang'
        subscriber.res = res;
    }
};

LongPoller.prototype.finishPoll = function(subscriber, sid) {
    if (subscriber && subscriber.res) {
        try {
            console.log('finishPoll for ' + sid);
            subscriber.res.json(subscriber.changes);
        } catch (e) {
            console.log('finishPoll for ' + sid + ' ERR: ' + e);
        }
        subscriber.changes = null;
        subscriber.res = null;
    }
};

LongPoller.prototype.removeOldSubscribers = function() {
    if (this.lastRemoveCheck % 10) {
    } else {
        var one_hour = 1000 * 60 * 60;
        var tthis = this;
        Object.keys(this.subscribers).forEach(function(sid) {
            var subscriber = tthis.subscribers[sid];
            if (!subscriber) delete tthis.subscribers[sid];
            var now = new Date();
            if (subscriber && (now - subscriber.last_poll) > one_hour) {
                delete tthis.subscribers[sid];
            }
        });
    }
    this.lastRemoveCheck += 1;
};

LongPoller.prototype.newChange = function(name, data) {
    var tthis = this;
    Object.keys(this.subscribers).forEach(function(sid) {
        var subscriber = tthis.subscribers[sid];
        if (subscriber) {
            if (!subscriber.changes) subscriber.changes = {};
            if (!subscriber.changes[name]) subscriber.changes[name] = [];
            subscriber.changes[name].push(data);
            tthis.finishPoll(subscriber, sid); 
        }
    });

    this.removeOldSubscribers();
};

module.exports = LongPoller;

