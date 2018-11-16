
var simpleSplat = function(res, type, fn) {
    res.sendFile(__dirname + fn);
};

real_files = { 'async.js':1, 
               'main.js': 1, 
               'gobble.wav': 1, 
               'turkeys.js':1, 
               'helpers.js':1, 
               'main.css':1, 
               'whatisthis.html':1, 
               'camera.jpg':1,
               'grid.html': 1,
               'grid.js': 1,
};

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
       } else if (name.match(/\.jpg$/)) {
           type = 'image/jpeg';
       }
       simpleSplat(res,type, '/static/' + name);
   } else {
       res.status(404);
       res.json({message: 'never heard of that one.'});
   }
};

var handleRootGet = function(req, res) {
    console.debug('GET /');
    simpleSplat(res,'text/html', '/static/index.html');
};

module.exports = {
   simpleSplat: simpleSplat,
    handleStaticFile: handleStatic,
    handleRoot: handleRootGet,
};

