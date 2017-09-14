
var camelems = {};
var current_results = {};

var removeChildren = function(n) {
    while (n.hasChildNodes()) n.removeChild(n.lastChild);
};


var reloadImage = function(name,crdate) {
    console.log('reloadImage(' + name + ')');
    camelems[name].img.style.display = 'inline';
    var img_url = '/turkeycam/image/' + name + '?date=' + encodeURIComponent(crdate);
    camelems[name].img.src = img_url;
    camelems[name].img_a.href = img_url;
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


var haveTurkey = function(d) {
    if (d &&  d.aws_results && d.aws_results.Labels) {
        for (var i=0; i<d.aws_results.Labels.length; i++) {
            var el = d.aws_results.Labels[i];
            if (el.Name.match(/\bturkey|bird|ostritch|poultry|emu|building\b/gi)) {
                console.log("MATCH: " + el.Name);
                return true;
            } else {
            }
        }
    }
    return false;
};

   
var turkeyAlert = function(name,d) {
    var adiv = camelems[name].alert;

    removeChildren(adiv);
    if (!haveTurkey(d)) {
        var p = document.createElement('p');
        p.innerText = 'No turkeys detected.';        
        adiv.appendChild(p);
    } else {
        var q = document.createElement('p');
        q.innerText = 'Gobble gobble! Turkey detected!';
        q.style = 'text-decoration: blink; font-size: 200%; color: red;';
        adiv.appendChild(q);
        try {
            var r = new Audio('/turkeycam/static/gobble.wav');
            r.play();
        } catch(e) {}
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
    var el, ds, latest;
    var ul = document.createElement('ul');
    ddiv.appendChild(ul);
    if (d && d.date) {
        el = document.createElement('li');
        ds = new Date(d.date);
        latest = ds;
        el.innerText = 'last image: ' + ds.toLocaleString();
        ul.appendChild(el);
    }
    if (d && d.ping && d.date) {
        el = document.createElement('li');
        ds = new Date(d.ping.date);
        if (ds > latest) latest = ds;
        el.innerText = 'last ping: ' + ds.toLocaleString();
        ul.appendChild(el);
    }
    if (d && d.source_ip) {
        el = document.createElement('li');
        if (ds > latest) latest = dt;
        el.innerText = 'Camera IP: ' + d.source_ip;
        ul.appendChild(el);
    }
    if (latest) {
        now = new Date();
        el = document.createElement('li');
        if ((now - latest) > (5 * 60 * 1000)) {
            el.innerText = 'Camera is probably DOWN';
            el.style.color = 'red';
        } else {
            el.innerText = 'Camera is probably UP';
            el.style.color = 'green';
        }
        ul.appendChild(el);
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
    getJSON('/turkeycam/status/' + name, function(err, new_data) {
        var old_data = current_results[name];
    
        if (err) {
            console.log('checkData err: ' + err);
            return cb('err');
        } else if (!new_data || !old_data) {
            console.log('checkData err, missing camera');
            return cb('err missing camera');
        } else if (new_data) {
            console.log('checkData ok');
            var old_image_date = new Date(old_data.date || 0);
            var new_image_date = new Date(new_data.date);
            var old_ping_date  = old_image_date;
            if (old_data.hasOwnProperty('ping')) {
                old_ping_date = new Date(old_data.ping.date);
            }
            var new_ping_date  = old_ping_date;
            if (new_data.hasOwnProperty('ping')) {
                new_ping_date = new Date(new_data.ping.date);
            }
            var new_image = !old_data || 
                            (new_image_date > old_image_date);
            var new_ping  = (new_ping_date > old_ping_date);

            if (false) {
                console.log('old_image_date: ' + old_image_date);
                console.log('new_image_date: ' + old_image_date);
                console.log('old_ping_date: ' + old_ping_date);
                console.log('new_ping_date: ' + old_ping_date);
                console.log('new_image: ' + new_image);
                console.log('new_ping: ' + new_ping);
            } 

            if (new_image) {
                reloadImage(name,new_data.date);
                turkeyAlert(name,new_data);
            }
            if (new_image || new_ping) {
                makeTable(name, new_data);
            }
            current_results[name] = new_data;
            // console.log(JSON.stringify(data,null,2));
            return cb(null,new_data);
        } else {
            return cb('skip');
        }
    });
};



var makeCamDivs = function(camlist,cb) {
    var topdiv = document.getElementById('topdiv');
    camlist.forEach(function(cname) {
        var cam_top_div = document.createElement('div');
        cam_top_div.style = "float: left; width: 100%;";
        var cam_nam_div = document.createElement('div');
        cam_nam_div.innerText = "Camera: " + cname;
        var cam_img_div = document.createElement('div');
        cam_img_div.style = "width: 801px; float: left;";
        var cam_img     = document.createElement('img');
        cam_img.style = "width: 800px; height: 600px;";
        cam_img.style.display = 'none';
        var cam_img_a = document.createElement('a');
        cam_img_a.href = "";
        cam_img_div.appendChild(cam_img_a);
        cam_img_a.appendChild(cam_img);
        var cam_dta_div = document.createElement('div');
        cam_dta_div.style = "margin-left: 801px;";
        var cam_trk_div = document.createElement('div');
        cam_trk_div.style = "margin-left: 801px;";
        cam_top_div.appendChild(cam_nam_div);
        cam_top_div.appendChild(cam_img_div);
        cam_top_div.appendChild(cam_dta_div);
        cam_top_div.appendChild(cam_trk_div);
        cam_top_div.appendChild(document.createElement('br'));
        topdiv.appendChild(cam_top_div);
        camelems[cname] = {
            img_a: cam_img_a,
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
        window.setTimeout(startTimer, 5000);
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


