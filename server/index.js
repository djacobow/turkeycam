
var express      = require('express');
var bodyParser   = require('body-parser');
var DataAcceptor = require('./DataAcceptor');
var file_helpers = require('./static_helpers');
var AppRoutes    = require('./AppRoutes');

var app        = express();
var port = process.env.TURKEY_PORT || 9080;


var setup_debug_hooks = function(da, ar) {

    var w = function(hname,sname) {
        console.log('Device action: [' + hname + '] ' + sname);
    };
    da.setHook('provision',w);
    da.setHook('push',ar.onNewPost.bind(ar));
    da.setHook('push',w);
    da.setHook('ping',w);
    da.setHook('getparams',w);
    da.setHook('fetchmail',w);
    da.setHook('respondmail', function(hname, sname) {
        w(hname, sname);
        r = da.mb.getResponses();
        console.debug('responses',JSON.stringify(r,null,2));
    });
};


if (require.main === module) {

    var dev_config = {
        'provisioned_clients_path': './provisioned.sqlite',
        'provisioning_tokens_path': './provisioning_tokens.json',
        'device_params_path': './camera_params.json',
    };
    var app_config = {
        // for future
    };

    var da = new DataAcceptor(dev_config);
    var ar = new AppRoutes(app_config, da);
    setup_debug_hooks(da, ar);

    var toprouter = express.Router();
    var devrouter = express.Router();
    var approuter = express.Router();

    da.setupRoutes(devrouter);
    ar.setupRoutes(approuter);

    toprouter.get('/',              file_helpers.handleRoot);
    toprouter.get('/static/:name',  file_helpers.handleStaticFile);

    app.use(bodyParser.urlencoded({extended: true, limit: '50mb'}));
    app.use(bodyParser.json({limit:'50mb'}));

    app.use('/turkeycam/device', devrouter);
    app.use('/turkeycam/app'   , approuter);
    app.use('/turkeycam'       , toprouter);

    app.listen(port);
    console.log('TurkeyCam running on port ' + port);
}

