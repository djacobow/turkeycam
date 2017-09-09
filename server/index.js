
var express    = require('express');
var app        = express();
var bodyParser = require('body-parser');
var aws        = require('aws-sdk');
var secret     = require('./secret_code.json');
var fs         = require('fs');

aws.config.loadFromPath('./aws.json');
aws.config.logger = process.stdout;

var rekognition = new aws.Rekognition();

var poster_token = secret.token;

app.use(bodyParser.urlencoded({extended: true, limit: '50mb'}));
app.use(bodyParser.json({limit:'50mb'}));

var port = process.env.TURKEY_PORT || 9080;
var router = express.Router();

var interesting_names = {
    cat:1,
    goat: 1,
    turkey: 1,
    turkeys: 1,
};

var cstates = {
    cam0: {
        busy: false,
        valid: false,
        image_number: 0,
    }
};


var sendToAWS = function(idata, cb) {
    console.log('sendToAWS()');
    var parms = {
        Image: {
            Bytes: idata.image_jpeg
        },
        MaxLabels: 20,
        MinConfidence: 50,
    };

    console.log('parms created');

    rekognition.detectLabels(parms, function(err, data) {
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



var saveImage = function(cs) {
    if (cs.valid) {
        var nows = (new Date()).toISOString();
        var fn = './images/' + nows + '.jpg';
        var ws = fs.createWriteStream(fn);
        ws.write(cs.image_jpeg);
        ws.end();
    }
};


var looksInteresting = function(cs) {
    var interesting = false;
    if (cs.hasOwnProperty('aws_results') && 
        cs.aws_results.hasOwnProperty('Labels')) {
        for (var i=0; i< cs.aws_results.Labels.length; i++) {
            var label = cs.aws_results.Labels[i].Name;
            var conf  = cs.aws_results.Labels[i].Confidence;
            if (conf > 50 && (interesting_names.hasOwnProperty(label.toLowerCase()))) {
                interesting = true;
                break;
            }
        }
    }
    return interesting;
};



var handleImagePost = function(req, res) {
    console.log('post!');
    var b = req.body;
    if (b.hasOwnProperty('token') && 
        b.hasOwnProperty('camera_name') &&
        secret.hasOwnProperty(b.camera_name) &&
        secret[b.camera_name].hasOwnProperty('token') &&
        (b.token == secret[b.camera_name].token)) {
       var camera_name = b.camera_name;
       var cstate = cstates[camera_name] || null;
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
       sendToAWS(cstate, function(err,data) {
           cstate.aws_results = data;
           console.log('back from sendToAWS');
           res.status(200);
           res.json({
               data: data,
               message: 'thanks!',
               image_number: cstate.image_number,
           });

           if (looksInteresting(cstate)) {
               saveImage(cstate);
           }
       });
    } else {
       res.status(403);
       res.json({ message: 'nope.' });
    }
};


var handleListGet = function(req, res) {
    console.log('GET list of cameras');
    rv = Object.keys(cstates);
    res.json(rv);
};

var handleStatusGet = function(req, res) {
    console.log('GET camera status!');
    var name = req.params.name;
    var cstate = cstates[name] || null;
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

var handleImageGet = function(req, res) {
    var name = req.params.name.replace('/','');
    var cstate = cstates[name];
    if (cstate && cstate.valid && !cstate.busy) {
        res.writeHead(200,{'Content-Type': 'image/jpeg'});
        res.end(cstate.image_jpeg, 'binary');
    } else {
        res.status(503);
        res.json({message: 'No image or image busy.'});
    }
};


var simpleSplat = function(res, type, fn) {
    // res.writeHead(200,{'Content-Type': type});
    res.sendFile(__dirname + fn);
};

var handleRootGet = function(req, res) {
    console.log('get HTML');
    simpleSplat(res,'text/html', '/static/index.html');
};
var handleJSGetM = function(req, res) {
    console.log('get JS');
    simpleSplat(res,'text/javascript', '/static/main.js');
};
var handleJSGetA = function(req, res) {
    console.log('get Async JS');
    simpleSplat(res,'text/javascript', '/static/async.js');
};

var handleTIKImageGet = function(req, res) {
    var name = req.params.name.replace('/','');
    fs.access(__dirname + '/images/' + name, 
              fs.constants.R_OK, 
              function(err) {
        if (err) {
            res.status(500);
            res.json({message: 'Whoops. Problem sending file.'});
            return;
        } else {
            simpleSplat(res, 'image/jpeg', '/images/' + name);
        }
    });

};

var handleTIKListGet = function(req, res) {
    var files = fs.readdir(__dirname + '/images/', function(err, files) {
        if (err) {
            //res.status(500);
            res.json({message: 'Ruh roh, raggy.'});
            return;
        }
        res.status(200);
        res.json(files);
    });
};

router.post('/newimage',   handleImagePost);
router.get('/cameranames', handleListGet);
router.get('/status/:name', handleStatusGet);
router.get('/image/:name', handleImageGet);
router.get('/',            handleRootGet);
router.get('/main.js',     handleJSGetM);
router.get('/async.js',    handleJSGetA);
router.get('/turkeys/list',handleTIKListGet);
router.get('/turkeys/:name/', handleTIKImageGet);

app.use('/turkeycam', router);

app.listen(port);
console.log('TurkeyCam running on port ' + port);


