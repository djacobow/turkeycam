var fs = require('fs');

var ImageAcceptor = function(rek, lookfor, pv) {
    this.fake = false;
    if (!rek) this.fake = true;
    this.rekognition = rek;
    this.interesting_names = lookfor;
    this.pv = pv;
};

ImageAcceptor.prototype.setCameraParams = function(cps) {
    this.cparams = cps;
};

ImageAcceptor.prototype.looksInteresting = function(cs) {
    if (cs.hasOwnProperty('aws_results') && 
        cs.aws_results.hasOwnProperty('Labels')) {
        for (var i=0; i< cs.aws_results.Labels.length; i++) {
            var label = cs.aws_results.Labels[i].Name;
            var conf  = cs.aws_results.Labels[i].Confidence;
            if (conf >= 50) {
                for (var j=0; j<this.interesting_names.length; j++) {
                    var interesting = new RegExp(
                        '\\b' + this.interesting_names[j] + '\\b',
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

ImageAcceptor.prototype.getcstate = function(name) {
    var cs = this.cstates[name] || null;
    if (!cs) {
        cs = {
            camera_name: name,
            busy: false,
            valid: false,
            image_number: 0,
        };
        this.cstates[name] = cs;
    }
    return cs;
};

ImageAcceptor.prototype.setupDefaults = function() {
    console.log('setupDefaults()');
    var cstates = {};
    this.cstates = cstates;
    var othis = this;
    Object.keys(this.pv.getProvisioned()).forEach(function(camera_name) {
        othis.getcstate(camera_name);
    });
};


ImageAcceptor.prototype.fakeSendToAWS = function(idata, cb) {
    rd = {
        message: 'This is a fake response. We never used AWS Rekognition',
        fakemode: true,
        Labels: [
            {
                "Name": "Blurkey Bird",
                "Confidence": "51",
            },
            {
                "Name": "Flying Saucer",
                "Confidence": "100",
            },
            {
                "Name": "Elvis",
                "Confidence": "90",
            },
        ],
        OrientationCorrection: "ROTATE_0",
    };

    return cb(null,rd);
};


ImageAcceptor.prototype.sendToAWS = function(idata, cb) {
    console.log('sendToAWS()');
    if (this.fake) return this.fakeSendToAWS(idata,cb);

    var parms = {
        Image: {
            Bytes: idata.image_jpeg
        },
        MaxLabels: 20,
        MinConfidence: 50,
    };

    console.log('parms created');

    this.rekognition.detectLabels(parms, function(err, data) {
        console.log('detectLabels CB()');
        if (err) {
            console.log('AWS error');
            console.log(err);
        }
        if (data) {
            console.log(data);
        }
        console.log('calling Final CB()');
        cb(err,data);
    }); 
};


ImageAcceptor.prototype.handleParamsGet = function(req, res) {
    var b = { camera_name: req.params.name, token: req.query.token };
    if (this.tokValid(b)) {
        res.status(200);
        if (this.cparams.hasOwnProperty(b.camera_name)) {
            res.json(this.cparams[b.camera_name]);
        } else {
            res.json({});
        }
        return;
    }
    res.status(403);
    res.json({ message: 'nyet.' }); 
};


ImageAcceptor.prototype.handleStillHere = function(req, res) {
    console.log('ping!');
    var iaobj = this;
    var b = req.body;
    if (this.pv.tokValid(b)) {
       var camera_name = b.camera_name;
       var cstate = this.getcstate(camera_name);
       cstate.ping = {
           'date': b.date,
       };
       res.status(200);
       res.json({message: 'thanks!' });
       return;
    }
    res.status(403);
    res.json({ message: 'nope.' });
};


ImageAcceptor.prototype.handleImagePost = function(req, res) {
    console.log('post!');
    var iaobj = this;
    var b = req.body;
    if (this.pv.tokValid(b)) {
       var camera_name = b.camera_name;
       var cstate = this.getcstate(camera_name);
       if (!cstate) {
           res.status('403');
           res.json({message:'unknown camera'});
           return;
       }
       cstate.busy = true;
       cstate.source_ip = b.source_ip; 
       cstate.date = b.date;
       cstate.image_jpeg = Buffer.from(b.image_jpeg,'base64');
       cstate.valid = true;
       cstate.image_number += 1;
       cstate.busy = false;
       this.sendToAWS(cstate, function(err,data) {
           cstate.aws_results = data;
           console.log('back from sendToAWS');
           res.status(200);
           res.json({
               data: data,
               message: 'thanks!',
               image_number: cstate.image_number,
           });
           if (iaobj.looksInteresting(cstate)) {
               iaobj.saveImage(cstate);
           }
       });
    } else {
       res.status(403);
       res.json({ message: 'nope.' });
    }
};


ImageAcceptor.prototype.handleListGet = function(req, res) {
    console.log('GET list of cameras');
    var cstates = this.cstates;
    rv = Object.keys(cstates);
    res.json(rv);
};


ImageAcceptor.prototype.handleStatusGet = function(req, res) {
    console.log('GET camera status!');
    var name = req.params.name;
    var cstate = this.cstates[name] || null;
    rv = {};
    if (cstate) {
        Object.keys(cstate).forEach(function(k) {
            if (k !== 'image_jpeg') rv[k] = cstate[k];
        });
    } else {
        rv.message = 'no such camera';
    }
    res.json(rv);
};


ImageAcceptor.prototype.handleImageGet = function(req, res) {
    var name = req.params.name.replace('/','');
    var cstate = this.cstates[name];
    if (cstate && cstate.valid && !cstate.busy) {
        res.writeHead(200,{'Content-Type': 'image/jpeg'});
        res.end(cstate.image_jpeg, 'binary');
    } else {
        res.status(503);
        res.json({message: 'No image or image busy.'});
    }
};

ImageAcceptor.prototype.saveImage = function(cs) {
    if (cs.valid) {
        // first save the image
        var nows = (new Date()).toISOString();
        var fn = './images/' + nows + '.jpg';
        var ws = fs.createWriteStream(fn);
        ws.write(cs.image_jpeg);
        ws.end();

        // then save the metadata
        fn = './images/' + nows + '.json';
        ws = fs.createWriteStream(fn);
        var od = {};
        var ks = Object.keys(cs);
        for (var i=0;i<ks.length;i++) {
            var k =ks[i];
            if (k != 'image_jpeg') od[k] = cs[k];
        }
        ws.write(JSON.stringify(od,null,2));
        ws.end();
    }
};


module.exports = ImageAcceptor;

