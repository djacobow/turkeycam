/* jshint esversion: 6 */
var Provisioner   = require('./Provisioner');
var fs = require('fs');

function copyWithoutKey(ind, banned) {
    var od = {};
    var keys = Object.keys(ind);
    for (var i=0; i<keys.length; i++) {
        var key = keys[i];
        if (key != banned) od[key] = ind[key];
    }
    return od;
}


var DataAcceptor = function(dev_config) {
    this.config = dev_config;
    this.pv = new Provisioner(this.config.provisioned_clients_path,
                              this.config.provisioning_tokens_path);
    this.pv.load();
    this.setupDefaults();
    this.loadSensorParams();
    this.hooks = {};
};

DataAcceptor.prototype.setupRoutes = function(router) {
    router.post('/push',         this.handleDataPost.bind(this));
    router.post('/ping',         this.handleStillHere.bind(this));
    router.get('/params/:name',  this.handleParamsGet.bind(this));
    router.post('/setup/:name',  this.handleProvision.bind(this));
};

DataAcceptor.prototype.setHook = function(name,func) {
    if (name && name.length && (typeof func === 'function')) {
        this.hooks[name] = func;
    } else {
        console.warn('hook not set for ' + name);
    }
};

DataAcceptor.prototype.fireHook = function(name, data) {
    if (this.hooks.hasOwnProperty(name)) {
        try {
            this.hooks[name](name, data);
        } catch (e) {
            console.log(e);
        }
    }
};

DataAcceptor.prototype.handleProvision = function(req, res) {
    var arg = {
        name: req.params.name.replace('/',''),
        serial_number: req.body.serial_number || '',
        provtok: req.body.provtok || '',
    };
    var rv = this.pv.provision(arg);
    if (rv) {
        this.getdevicestate(rv.sensor_name);
        res.status('200');
        var sv = copyWithoutKey(rv, 'serial_number');
        res.json(sv);
        this.fireHook('provision',rv.sensor_name);
        return;
    }
    res.status('403');
    res.json({message: 'begone!'});
};


DataAcceptor.prototype.loadSensorParams= function() {
    this.cparams = JSON.parse(fs.readFileSync(this.config.device_params_path, 'utf8'));
};


DataAcceptor.prototype.getdevicelist= function() {
    return Object.keys(this.cstates);
};

DataAcceptor.prototype.getdevicestate = function(name, startup = false) {
    var cs = this.cstates[name] || null;
    if (startup && !cs) {
        cs = {
            sensor_name: name,
            busy: false,
            valid: false,
        };
        this.cstates[name] = cs;
    }
    return cs;
};

DataAcceptor.prototype.setupDefaults = function() {
    console.log('setupDefaults()');
    var cstates = {};
    this.cstates = cstates;
    var othis = this;
    Object.keys(this.pv.getProvisioned()).forEach(function(sensor_name) {
        othis.getdevicestate(sensor_name, true);
    });
};


DataAcceptor.prototype.handleParamsGet = function(req, res) {
    var b = { sensor_name: req.params.name, token: req.query.token };
    if (this.pv.tokValid(b)) {
        res.status(200);
        if (this.cparams.hasOwnProperty(b.sensor_name)) {
            res.json(this.cparams[b.sensor_name]);
            this.fireHook('getparams',b.sensor_name);
        } else {
            res.json({});
        }
        return;
    }
    res.status(403);
    res.json({ message: 'nyet.' }); 
};


DataAcceptor.prototype.handleStillHere = function(req, res) {
    console.log('ping!');
    var iaobj = this;
    var b = req.body;
    if (this.pv.tokValid(b)) {
       var sensor_name= b.sensor_name;
       var cstate = this.getdevicestate(sensor_name);
       cstate.ping = {
           'date': b.date,
           'source_ip': b.source_ip,
       };
       res.status(200);
       res.json({message: 'thanks!' });
       this.fireHook('ping',sensor_name);
       return;
    }
    res.status(403);
    res.json({ message: 'nope.' });
};


DataAcceptor.prototype.handleDataPost = function(req, res) {
    console.log('handleDataPost()');
    var iaobj = this;
    var b = req.body;
    // console.log(JSON.stringify(b,null,2));
    if (this.pv.tokValid(b)) {
       var sensor_name= b.sensor_name;
       var cstate = this.getdevicestate(sensor_name);
       if (!cstate) {
           console.log('unknown device: ' + sensor_name);
           res.status('403');
           res.json({message:'unknown device'});
           return;
       }
       cstate.busy = true;
       cstate.source_ip = b.source_ip; 
       cstate.date = b.date;
       cstate.sensor_data = b.sensor_data;
       cstate.valid = true;
       cstate.upload_number += 1;
       cstate.busy = false;
       res.status(200);
       res.json({message: 'thanks!', upload_number: cstate.upload_number});
       this.fireHook('push',sensor_name);
    } else {
       res.status(403);
       res.json({ message: 'nope.' });
    }
};



module.exports = DataAcceptor;

