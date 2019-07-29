
var file_helpers = require('./static_helpers');
var fs           = require('fs');
var aws          = require('aws-sdk');
aws.config.loadFromPath('./aws.json');
// aws.config.logger = process.stdout;
var lp           = require('./LongPoller.js');

var AppRoutes = function(app_config, dataacceptor) {
    this.config = app_config;
    this.da = dataacceptor;
    this.interesting = [
        'cat', 'goat', 'turkey', 'turkey bird', 'turkeys',
        'poultry', 'ostritch', 'emu', 'cougar', 'mountain lion',
        'lion',
    ];
    this.rekognition = null;
    if (!this.config.fake_rekognition) {
        this.rekognition = new aws.Rekognition();
    }
    this.starttime = (new Date()).toISOString();
    this.lp = new lp();
    this.da.setHook('push',this.lp.newChange.bind(this.lp));
    this.da.setHook('ping',this.lp.newChange.bind(this.lp));
};

AppRoutes.prototype.setupRoutes = function(router) {
    router.get('/devicenames',   this.handleListGet.bind(this));
    router.get('/status/:name',  this.handleStatusGet.bind(this));
    router.get('/turkeys/list',  this.handleTIKListGet.bind(this));
    router.get('/turkeys/:name', this.handleTIKImageGet.bind(this));
    router.get('/turkeys',       this.handleTurkeysGet.bind(this, '/static/turkeys.html'));
    router.get('/grid',          this.handleTurkeysGet.bind(this, '/static/grid.html'));
    router.get('/image/:name',   this.handleImageGet.bind(this));
    router.get('/uptime',        this.handleUptimeGet.bind(this));
    router.get('/poll',          this.lp.poll.bind(this.lp));
};

AppRoutes.prototype.handleUptimeGet = function(req, res) {
    res.status(200);
    var now = (new Date()).toISOString();
    res.json({start_time: this.starttime, now: now});
};

AppRoutes.prototype.handleImageGet = function(req, res) {
    var name = req.params.name.replace('/','');
    var cstate = this.da.getdevicestate(name);
    if (cstate && cstate.valid && !cstate.busy) {
        res.writeHead(200,{'Content-Type': 'image/jpeg'});
        res.end(cstate.image_jpeg_buffer, 'binary');
    } else {
        res.status(503);
        res.json({message: 'No image or image busy.'});
    }
};

AppRoutes.prototype.handleTurkeysGet = function(file, req, res) {
    file_helpers.simpleSplat(res,'text/html', file);
};

AppRoutes.prototype.handleTIKImageGet = function(req, res) {
    var name = req.params.name.replace('/','');
    fs.access(__dirname + '/images/' + name, 
              fs.constants.R_OK, 
              function(err) {
        if (err) {
            res.status(500);
            res.json({message: 'Whoops. Problem sending file.'});
            return;
        } else {
            file_helpers.simpleSplat(res, 'image/jpeg', '/images/' + name);
        }
    });

};

AppRoutes.prototype.handleTIKListGet = function(req, res) {
    var rv = {};
    fs.readdir(__dirname + '/images/', function(err, files) {
        if (err) {
            res.json({message: 'Ruh roh, raggy.'});
            return;
        }
        res.status(200);
        var re = /(.*)\.(jpg|json)$/;
        for (var i=0;i<files.length; i++) {
            var match = re.exec(files[i]);
            if (match) {
                var x = rv[match[1]];
                if (!x) rv[match[1]] = {};
                rv[match[1]][match[2]] = match[0];
            }
        }
        res.json(rv);
    });
};


AppRoutes.prototype.handleListGet = function(req, res) {
    console.info('get devicelist');
    var devlist = this.da.getdevicelist();
    res.json(devlist);
};

AppRoutes.prototype.handleStatusGet = function(req, res) {
    var suppress = {
        image_jpeg: 1, sensor_data: 1, image_jpeg_buffer: 1,
    };
    var name = req.params.name;
    var cstate = this.da.getdevicestate(name) || null;
    rv = {};
    if (cstate) {
        Object.keys(cstate).forEach(function(k) {
            if (!suppress.hasOwnProperty(k)) {
                rv[k] = cstate[k];
            }
        });
    } else {
        rv.message = 'no such sensor';
    }
    res.json(rv);
};

AppRoutes.prototype.looksInteresting = function(cs) {
    if (cs.hasOwnProperty('aws_results') && 
        cs.aws_results.hasOwnProperty('Labels')) {
        for (var i=0; i< cs.aws_results.Labels.length; i++) {
            var label = cs.aws_results.Labels[i].Name;
            var conf  = cs.aws_results.Labels[i].Confidence;
            if (conf >= 55) {
                for (var j=0; j<this.interesting.length; j++) {
                    var interesting = new RegExp(
                        '\\b' + this.interesting[j] + '\\b',
                        'gi'
                    );
                    if (label.match(interesting)) {
                        return true;
                    }
                }
            }
        }
    }
    return false;
};

AppRoutes.prototype.fakeSendToAWS = function(idata, cb) {
    rd = {
        message: 'This is a fake response. Rekognition is turned off to save money.',
        fakemode: true,
        Labels: [
            {
                "Name": "Rekognition is disabled to save $$$.",
                "Confidence": "99",
            },
        ],
        OrientationCorrection: "ROTATE_0",
    };

    return cb(null,rd);
};

AppRoutes.prototype.onNewPost = function(hooktype, device_name) {
    if (hooktype == 'push') {
        arobj = this;
        cs = this.da.getdevicestate(device_name);
        if (cs) {
            cs.image_jpeg_buffer = Buffer.from(cs.sensor_data.image_jpeg,'base64');
            this.sendToAWS(cs, function(awerr,awdata) {
                cs.aws_results = awdata;
                // console.debug('back from sendToAWS');
                if (arobj.looksInteresting(cs)) {
                    arobj.saveImage(cs);
                }
            });
        }
    }
};

AppRoutes.prototype.sendToAWS = function(idata, cb) {
    // console.debug('sendToAWS()');
    if (this.config.fake_rekognition) return this.fakeSendToAWS(idata,cb);

    var parms = {
        Image: {
            Bytes: idata.image_jpeg_buffer
        },
        MaxLabels: 20,
        MinConfidence: 55,
    };

    this.rekognition.detectLabels(parms, function(err, data) {
        // console.debug('- detectLabels CB()');
        if (err) {
            console.error('AWS error');
            console.error(err);
        }
        if (data) {
            console.debug(data);
        }
        cb(err,data);
    }); 
};

AppRoutes.prototype.saveImage = function(cs) {
    if (cs.valid) {
        // first save the image
        var nows = (new Date()).toISOString();
        var fn = './images/' + nows + '.jpg';
        var ws = fs.createWriteStream(fn);
        ws.write(cs.image_jpeg_buffer);
        ws.end();

        // then save the metadata
        fn = './images/' + nows + '.json';
        ws = fs.createWriteStream(fn);
        var od = {};
        var ks = Object.keys(cs);
        var keys_to_skip = {
            'image_jpeg': 1,
            'image_jpeg_buffer': 1,
            'sensor_data': 1,
        };
        for (var i=0;i<ks.length;i++) {
            var k =ks[i];
            if (!keys_to_skip.hasOwnProperty(k)) od[k] = cs[k];
        }
        ws.write(JSON.stringify(od,null,2));
        ws.end();
    }
};


module.exports = AppRoutes;

