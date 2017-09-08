
var camelems = {};
var current_results = {};

var removeChildren = function(n) {
    while (n.hasChildNodes()) n.removeChild(n.lastChild);
};


var reloadImage = function(name) {
    console.log('reloadImage(' + name + ')');
    camelems[name].img.src = '/turkeycam/image/' + name + '?' + (new Date()).getTime();
};


var getJSON = function(url, cb) {
    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function() {
        if ((this.readyState == 4) && (this.status == 200)) {
            var data = JSON.parse(this.responseText);
            return cb(null, data);
        }
    };
    xhr.open('GET',url);
    xhr.send();
};


var turkeyAlert = function(name,d) {
    var turkey = false;
    if (d &&  d.aws_results && d.aws_results.Labels) {
        d.aws_results.Labels.forEach(function(el) {
            if (el.Name.match(/turkey/i)) {
                // turkey = true;
            }
        });
    }
   
    var adiv = camelems[name].alert;

    removeChildren(adiv);
    if (!turkey) {
        var p = document.createElement('p');
        p.innerText = 'No turkeys detected.';        
        adiv.appendChild(p);
    } else {
        var q = document.createElement('p');
        q.innerText = 'Gobble gobble! Turkey detected!';
        q.style = 'text-decoration: blink; font-size: 200%; color: red;';
        adiv.appendChild(q);
    }
};

var makeTable = function(name,d) {
    var ddiv = camelems[name].data;
    removeChildren(ddiv);
    if (d && d.aws_results && d.aws_results.Labels) {
        var t = document.createElement('table');
        var r = document.createElement('tr');
        td0 = document.createElement('th');
        td1 = document.createElement('th');
        td0.innerText = 'Label';
        td1.innerText = 'Confidence';
        r.appendChild(td0);
        r.appendChild(td1);
        t.appendChild(r);
        d.aws_results.Labels.forEach(function(el) {
            r = document.createElement('tr');
            td0 = document.createElement('td');
            td1 = document.createElement('td');
            td0.innerText = el.Name;
            var conf = Math.floor((parseFloat(el.Confidence) * 100) + 0.5) / 100;
            td1.innerText = conf.toString();
            r.appendChild(td0);
            r.appendChild(td1);
            t.appendChild(r);
        });
        ddiv.appendChild(t);
    }
    if (d && d.date) {
        var p = document.createElement('p');
        var dt = new Date(d.date);
        var ds = dt;
        p.innerText = ds.toLocaleString();
        ddiv.appendChild(p);
    }

};

var getCamList = function(cb) {
    getJSON('/turkeycam/cameranames', function(err, data) {
        if (err) {
            console.log('Error getting camera list: ' + err);
            return cb(err);
        } else {
            return cb(null,data);
        }
    });
};

var checkData = function(name, cb) {
    getJSON('/turkeycam/status/' + name, function(err, data) {
        var current_result = current_results[name];
    
        if (err) {
            console.log('checkData err: ' + err);
            return cb('err');
        } else if (!data || !current_result) {
            console.log('checkData err, missing camera');
            return cb('err missing camera');
        } else if (data && 
            (!current_result || 
             (current_result.date != data.date)) &&
             data.valid
           ) {
            current_results[name] = data;
            console.log(JSON.stringify(data,null,2));
            reloadImage(name);
            makeTable(name,data);
            turkeyAlert(name,data);
            return cb(null,data);
        } else {
            return cb('skip');
        }
    });
};



var makeCamDivs = function(camlist,cb) {
    var topdiv = document.getElementById('topdiv');
    camlist.forEach(function(cname) {
        var cam_top_div = document.createElement('div');
        var cam_nam_div = document.createElement('div');
        cam_nam_div.innerText = "Camera: " + cname;
        var cam_img_div = document.createElement('div');
        cam_img_div.style = "width: 801px; float: left;";
        var cam_img     = document.createElement('img');
        cam_img_div.appendChild(cam_img);
        var cam_dta_div = document.createElement('div');
        cam_dta_div.style = "margin-left: 801px;";
        var cam_trk_div = document.createElement('div');
        cam_trk_div.style = "margin-left: 801px;";
        cam_top_div.appendChild(cam_nam_div);
        cam_top_div.appendChild(cam_img_div);
        cam_top_div.appendChild(cam_dta_div);
        cam_top_div.appendChild(cam_trk_div);
        topdiv.appendChild(cam_top_div);
        camelems[cname] = {
            img_div: cam_img_div,
            img: cam_img,
            data: cam_dta_div,
            'alert': cam_trk_div,
            'top': cam_top_div,
        };
        current_results[cname] = {
            valid: false,
            busy: false,
            date: '',
        };
   
    });
    return cb();
};

var populateTurkeys = function() {
    var turksdiv = document.getElementById('turksdiv');
    removeChildren(turksdiv);
    getJSON('/turkeycam/turkeys/list', function(err, data) {
        if (err) {
            turksdiv.innerText += 'Error getting turkey list.';
            return;
        }
        if (!data.length) {
            turksdiv.innerText += 'No turkeys to show.';
        }
        for (var i=0; i<data.length; i++) {
            var isrc = '/turkeycam/turkeys/' + data[i];
            var img  = document.createElement('img');
            img.src = isrc;
            turksdiv.appendChild(img);
        }
    });
};


var addShowTurkeysButton = function() {
    var bottomdiv = document.getElementById('bottomdiv');
    var showbutton = document.createElement('button');
    showbutton.innerText = 'Show collected turkeys.';
    showbutton.addEventListener('click', populateTurkeys);
    var hr = document.createElement('hr');
    var turksdiv = document.createElement('div');
    turksdiv.id = 'turksdiv';
    bottomdiv.appendChild(showbutton);
    bottomdiv.appendChild(hr);
    bottomdiv.appendChild(turksdiv);
    
};


var startTimer = function() {
    var camlist = Object.keys(camelems);
    async.each(camlist, function(camn,cb) {
        checkData(camn, function(cerr, cd) {
            cb();
        });
    },
    function (err) {
        window.setTimeout(startTimer, 15000);
    });
};




getCamList(function(err,incams) {
    if (!err) {
        makeCamDivs(incams, function() {
            addShowTurkeysButton();
            startTimer();
        });
    }
});


