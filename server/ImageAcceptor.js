var fs = require('fs');

var ImageAcceptor = function(rek, lookfor, secrets) {
    this.fake = false;
    if (!rek) this.fake = true;
    this.rekognition = rek;
    this.interesting_names = lookfor;
    this.secret = secrets;
};

ImageAcceptor.prototype.looksInteresting = function(cs) {
    var interesting = false;
    if (cs.hasOwnProperty('aws_results') && 
        cs.aws_results.hasOwnProperty('Labels')) {
        for (var i=0; i< cs.aws_results.Labels.length; i++) {
            var label = cs.aws_results.Labels[i].Name;
            var conf  = cs.aws_results.Labels[i].Confidence;
            if (conf > 50 && (this.interesting_names.hasOwnProperty(label.toLowerCase()))) {
                interesting = true;
                break;
            }
        }
    }
    return interesting;
};

ImageAcceptor.prototype.setupDefaults = function() {
    console.log('setupDefaults()');
    var cstates = {};
    Object.keys(this.secret).forEach(function(camera_name) {
        cstates[camera_name] = {
            busy: false,
            valid: false,
            image_number: 0,
        };
    });
    this.cstates = cstates;
};


ImageAcceptor.prototype.fakeSendToAWS = function(idata, cb) {
    rd = {
        message: 'This is a fake response. We never used AWS Rekognition',
        fakemode: true,
        Labels: [
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


ImageAcceptor.prototype.handleImagePost = function(req, res) {
    console.log('post!');
    var iaobj = this;
    var b = req.body;
    if (b.hasOwnProperty('token') && 
        b.hasOwnProperty('camera_name') &&
        this.secret.hasOwnProperty(b.camera_name) &&
        this.secret[b.camera_name].hasOwnProperty('token') &&
        (b.token == this.secret[b.camera_name].token)) {
       var camera_name = b.camera_name;
       var cstate = this.cstates[camera_name] || null;
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
        var nows = (new Date()).toISOString();
        var fn = './images/' + nows + '.jpg';
        var ws = fs.createWriteStream(fn);
        ws.write(cs.image_jpeg);
        ws.end();
    }
};


module.exports = ImageAcceptor;

