
var express    = require('express');
var app        = express();
var bodyParser = require('body-parser');
var aws        = require('aws-sdk');
var fs         = require('fs');
var ImageAcceptor = require('./ImageAcceptor');
var Provisioner   = require('./Provisioner');
var camera_params = require('./camera_params.json');
aws.config.loadFromPath('./aws.json');
aws.config.logger = process.stdout;

var port = process.env.TURKEY_PORT || 9080;
var fake = process.env.TURKEY_FAKE_REKOGNITION || false;

var simpleSplat = function(res, type, fn) {
    res.sendFile(__dirname + fn);
};

real_files = { 'async.js':1, 'main.js': 1, 'gobble.wav': 1, 'turkeys.js':1, 'helpers.js':1, 'main.css':1};

var handleStatic = function(req, res) {
   var name = req.params.name.replace('/','');
   if (real_files[name] || null) {
       var type = 'text/html';
       if (name.match(/\.js$/)) {
           type = 'text/javascript';
       } else if (name.match(/\.wav$/)) {
           type = 'audio/wave';
       } else if (name.match(/\.css$/)) {
           type = 'text/css';
       }
       simpleSplat(res,type, '/static/' + name);
   } else {
       res.status(404);
       res.json({message: 'never heard of that one.'});
   }
};

var handleRootGet = function(req, res) {
    console.log('get HTML');
    simpleSplat(res,'text/html', '/static/index.html');
};

var handleTurkeysGet = function(req, res) {
    simpleSplat(res,'text/html', '/static/turkeys.html');
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


if (require.main === module) {
    var rekognition = null;
    if (!fake) rekognition = new aws.Rekognition();

    var pv = new Provisioner('./provisioned_clients.json',
                             './provisioning_tokens.json');
    pv.load();

    var interesting = [
        'cat', 'goat', 'turkey', 'turkey bird', 'turkeys',
        'deer', 'poultry', 'ostritch', 'emu', 'cougar', 'mountain lion',
        'lion',
    ];
    var ia = new ImageAcceptor(rekognition,interesting,pv,fake);
    ia.setupDefaults();
    ia.setCameraParams(camera_params);

    var router = express.Router();

    router.post('/newimage',      ia.handleImagePost.bind(ia));
    router.post('/stillhere',     ia.handleStillHere.bind(ia));
    router.post('/setup/:name',   ia.handleProvision.bind(ia));
    router.get('/cameranames',    ia.handleListGet.bind(ia));
    router.get('/camparams/:name',ia.handleParamsGet.bind(ia));
    router.get('/status/:name',   ia.handleStatusGet.bind(ia));
    router.get('/image/:name',    ia.handleImageGet.bind(ia));
    router.get('/',               handleRootGet);
    router.get('/static/:name',   handleStatic);
    router.get('/turkeys/list',   handleTIKListGet);
    router.get('/turkeys/:name/', handleTIKImageGet);
    router.get('/turkeys',        handleTurkeysGet);

    app.use(bodyParser.urlencoded({extended: true, limit: '50mb'}));
    app.use(bodyParser.json({limit:'50mb'}));

    app.use('/turkeycam', router);

    app.listen(port);
    console.log('TurkeyCam running on port ' + port);
    if (fake) console.log('Faking calls to Rekognition to save money.');
}


