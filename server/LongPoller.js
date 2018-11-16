/*jshint esversion: 6 */

var LongPoller = function(config = null) {
    this.config = config;
    this.subscribers = {};
    this.lastRemoveCheck = 0;

    // This interval in ms is how often we aggregate updated 
    // notifications and send them back to the subscribers. 
    // Setting it to zero means everyone get notified as soon
    // as the server knows there is something new. Setting it
    // to a larger number means that subscribers will have to 
    // wait up to that long after the server has new data.
    // One second seems like a reasonable delay, unless
    // data is being uploaded much more often
    this.finish_interval = 1000;

    if (this.finish_interval) this.startTimer();
};

LongPoller.prototype.startTimer = function() {
    console.debug('startTimer');
    var tthis = this;
    var timer_fn = function() {
        try {
            Object.keys(tthis.subscribers).forEach(function(sid) {
                var subscriber = tthis.subscribers[sid];
                tthis.finishPoll(subscriber, sid); 
            });
        } catch (e) { }
        setTimeout(timer_fn,tthis.finish_interval);
    };
    timer_fn();
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
    if (subscriber && subscriber.res && subscriber.changes) {
        try {
            console.debug('finishPoll for ' + sid);
            subscriber.res.json(subscriber.changes);
        } catch (e) {
            console.debug('finishPoll for ' + sid + ' ERR: ' + e);
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
            if (!tthis.finish_interval) {
                tthis.finishPoll(subscriber, sid); 
            }
        }
    });

    this.removeOldSubscribers();
};

module.exports = LongPoller;

