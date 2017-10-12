var fs = require('fs');
var crypto = require('crypto');

var MAX_PROV_ATTEMPTS = 5;


var Provisioner = function(provisioned_fn, provtoks_fn) {
    this.provtoks_fn = provtoks_fn;
    this.provisioned_fn = provisioned_fn;
    this.provisioned = {};
    this.provtoks = [];
};

Provisioner.prototype.makeRandString = function(l) {
  var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  var text = crypto.randomBytes(l).toString('base64');
  return text;
};

var loadFJS = function(fn) {
    try {
        var fstring = fs.readFileSync(fn);
        var fdata = JSON.parse(fstring);
        return fdata;
    } catch (ex) {
        console.log('Error loading file: ' + fn);
        console.log(ex);
    }
    return null;
};

Provisioner.prototype.loadProvisioned = function() {
    var d  = loadFJS(this.provisioned_fn);
    if (d) {
        this.provisioned = d;
    }
    return this.provisioned;
};

Provisioner.prototype.tokValid = function(b) {
    if (b.hasOwnProperty('token') && 
        b.hasOwnProperty('sensor_name') &&
        this.provisioned.hasOwnProperty(b.sensor_name) &&
        this.provisioned[b.sensor_name].hasOwnProperty('tok_hash') &&
        this.provisioned[b.sensor_name].hasOwnProperty('serial_number') &&
        this.provisioned[b.sensor_name].hasOwnProperty('salt')) {
        var hash = this.hash(b.token,
                            [this.provisioned[b.sensor_name].serial_number,
                             this.provisioned[b.sensor_name].salt,
                            ]);
        return hash === this.provisioned[b.sensor_name].tok_hash;
    }
    return false;
};

Provisioner.prototype.loadProvToks = function() {
    var d  = loadFJS(this.provtoks_fn);
    if (d) {
        this.provtoks = d;
    }
    return this.provtoks;
};

Provisioner.prototype.load = function() {
    this.loadProvToks();
    this.loadProvisioned();
};

Provisioner.prototype.getProvisioned = function() {
    return this.provisioned;
};

Provisioner.prototype.provTokValid = function(candidate) {
    for (var i=0; i<this.provtoks.length; i++) {
        if (candidate == this.provtoks[i]) return true;
    }
    return false;
};


function thingInThings(things, kname, kvalue) {
    var keys = Object.keys(things);
    for (var i=0; i<keys.length; i++) {
        var key = keys[i];
        var kv = things[key][kname] || null;
        if (kv && (kv == kvalue)) return key;
    }
    return null;
}

Provisioner.prototype.create_new = function(name, serial, nows) {
    var new_token = this.makeRandString(64);
    var new_salt  = this.makeRandString(64);
    var new_hash  = this.hash(new_token,[serial,new_salt]);
    var rv = {
        new_entry: {
            serial_number: serial,
            sensor_name: name,
            provisioning_attempts: 1,
            prov_date: nows,
            salt: new_salt,
            tok_hash: new_hash,
        },
        return_data: {
            serial_number: serial,
            sensor_name: name,
            provisioning_attempts: 1,
            prov_date: nows,
            token: new_token,
        },
    };
    return rv;
};

Provisioner.prototype.provision = function(req) {
    var serial  = req.serial_number || '';
    var provtok = req.provtok || '';
    var name    = req.name || '';

    var nows = (new Date()).toISOString();
    var serial_in_use = thingInThings(this.provisioned, 'serial_number', serial);
    var d = null;
    if (this.provTokValid(provtok)) {
        var existing = this.provisioned[name] || null;
        if (existing) {
           if ((existing.provisioning_attempts < MAX_PROV_ATTEMPTS) &&
               (serial == existing.serial_number)) {
               existing.provisioning_attempts += 1;
               existing.prov_date = nows;
               this.saveProvisioned();
               return existing;
           } else {
               return null;
           }
        } else if (serial_in_use) {
            // console.log('serial_in_use: ' + serial_in_use);
            var provisioning_attempts = this.provisioned[serial_in_use].provisioning_attempts;
            if (provisioning_attempts < MAX_PROV_ATTEMPTS) {
                d = this.create_new(serial_in_use, serial, nows);
                provisioning_attempts += 1;
                d.new_entry.provisioning_attempts = provisioning_attempts;
                d.return_data.provisioning_attempts = provisioning_attempts;
                this.provisioned[serial_in_use] = d.new_entry;
                this.saveProvisioned();
                return d.return_data;
            } else {
                return null;
            }
        } else {
            d = this.create_new(name, serial, nows);
            this.provisioned[name] = d.new_entry;
            this.saveProvisioned();
            return d.return_data;
        }
    }
    return null;
};

Provisioner.prototype.hash = function(password, salts) {
    var hash = crypto.createHmac('sha512', password);
    for (var i=0; i<salts.length; i++) {
        hash.update(salts[i]);
    }
    return hash.digest('hex');
};

Provisioner.prototype.saveProvisioned = function() {
    try {
        var ws = fs.createWriteStream(this.provisioned_fn);
        ws.write(JSON.stringify(this.provisioned,null,2));
        ws.end();
        return null;
    } catch (ex) { 
        console.log('Error writing provisioned file.');
        console.log(ex);
    }
    return 'err';
};


module.exports = Provisioner;
