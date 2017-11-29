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
        if (this.hooks.hasOwnProperty(name)) {
            this.hooks[name].push(func);
        } else {
            this.hooks[name] = [ func ];
        }
    } else {
        console.warn('hook not set for ' + name);
    }
};

DataAcceptor.prototype.fireHook = function(name, data) {
    // maybe fire these async?
    var hooks = this.hooks;
    if (hooks.hasOwnProperty(name)) {
        for (var i=0; i<hooks[name].length; i++) {
            try {
                var hkfn = hooks[name][i];
                hkfn(name, data);
            } catch (e) {
                console.log(e);
           }
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
        this.getdevicestate(rv.node_name, true);
        res.status('200');
        var sv = copyWithoutKey(rv, 'serial_number');
        res.json(sv);
        this.fireHook('provision',rv.node_name);
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
            node_name: name,
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
    Object.keys(this.pv.getProvisioned()).forEach(function(node_name) {
        othis.getdevicestate(node_name, true);
    });
};


DataAcceptor.prototype.handleParamsGet = function(req, res) {
    var b = { node_name: req.params.name, token: req.query.token };
    if (this.pv.tokValid(b)) {
        res.status(200);
        if (this.cparams.hasOwnProperty(b.node_name)) {
            res.json(this.cparams[b.node_name]);
            this.fireHook('getparams',b.node_name);
        } else {
            res.json({});
        }
        return;
    }
    res.status(403);
    res.json({ message: 'nyet.' });
};


DataAcceptor.prototype.handleStillHere = function(req, res) {
    var iaobj = this;
    var b = req.body;
    var rv = { message: 'nope.', };
    var rvs = 403;

    if (this.pv.tokValid(b)) {
       try {
           var node_name= b.node_name;
           var cstate = this.getdevicestate(node_name);
           cstate.ping = {
               'date': b.date,
               'diagnostic': b.diagnostic,
               'source_type': b.source_type,
           };
           rvs = 200;
           rv = {message: 'thanks!'};
           this.fireHook('ping',node_name);
        } catch (e) {
            rvs = 400;
            rv = {message: 'malformed submission'};
        }
    }
    res.status(rvs);
    res.json(rv);
};


DataAcceptor.prototype.handleDataPost = function(req, res) {
    // console.log('handleDataPost()');
    var iaobj = this;
    var b = req.body;
    var rv = { message: 'nope.', };
    var rvs = 403;
    // console.log(JSON.stringify(b,null,2));
    if (this.pv.tokValid(b)) {
       var node_name= b.node_name;
       var cstate = this.getdevicestate(node_name);
       if (!cstate) {
           console.log('unknown device: ' + node_name);
           res.status('403');
           res.json({message:'unknown device'});
           return;
       }
       try {
           cstate.busy = true;
           cstate.valid  = false;
           cstate.diagnostic = b.diagnostic;
           cstate.source_type = b.source_type;
           cstate.date = b.date;
           cstate.sensor_data = b.sensor_data;
           cstate.upload_number += 1;
           cstate.valid = true;
           cstate.busy = false;
           rv = {message: 'thanks!', upload_number: cstate.upload_number};
           rvs = 200;
           this.fireHook('push',node_name);
       } catch(e) {
           cstate.valid = false;
           cstate.busy = false;
           rv = {message: 'malformed submission' };
           rvs = 400;
       }
   }
   res.status(rvs);
   res.json(rv);
};



module.exports = DataAcceptor;

