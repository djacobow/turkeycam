
var express    = require('express');
var app        = express();
var bodyParser = require('body-parser');
var aws        = require('aws-sdk');
var secret     = require('./secret_code.json');

aws.config.loadFromPath('./aws.json');
aws.config.logger = process.stdout;

var rekognition = new aws.Rekognition();

var poster_token = secret.token;

app.use(bodyParser.urlencoded({extended: true, limit: '50mb'}));
app.use(bodyParser.json({limit:'50mb'}));

var port = process.env.TURKEY_PORT || 9080;
var router = express.Router();


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


var handleImagePost = function(req, res) {
    console.log('post!');
    var b = req.body;
    if (b.hasOwnProperty('token') && (b.token == poster_token)) {
       var cstate = cstates.cam0;
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
       });
    } else {
       res.status(403);
       res.json({ message: 'nope.' });
    }
};



var handleStatusGet = function(req, res) {
    console.log('get!');
    var rv = {};
    Object.keys(cstates).forEach(function(camn) {
        rv[camn] = {};
        var cstate = cstates[camn];
        Object.keys(cstate).forEach(function(k) {
            if (k !== 'image_jpeg') rv[camn][k] = cstate[k];
        });
    });
    res.json(rv);
};

var handleImageGet = function(req, res) {
    var name = req.params.name;
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
    res.sendFile(__dirname + '/static/' + fn);
};

var handleRootGet = function(req, res) {
    console.log('get HTML');
    simpleSplat(res,'text/html', 'index.html');
};
var handleJSGet = function(req, res) {
    console.log('get JS');
    simpleSplat(res,'text/javascript', 'main.js');
};

router.post('/newimage',   handleImagePost);
router.get('/status',      handleStatusGet);
router.get('/image/:name', handleImageGet);
router.get('/',            handleRootGet);
router.get('/main.js',     handleJSGet);

app.use('/turkeycam', router);

app.listen(port);
console.log('TurkeyCam running on port ' + port);


