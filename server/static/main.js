
var camelems = {};
var current_results = {};

var removeChildren = function(n) {
    while (n.hasChildNodes()) n.removeChild(n.lastChild);
};


var reloadImage = function(name,crdate) {
    console.log('reloadImage(' + name + ')');
    camelems[name].img.style.display = 'inline';
    var dt = new Date(crdate).getTime();
    var img_url = '/turkeycam/app/image/' + name + '?date=' + encodeURIComponent(dt);
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
            if (el.Name.match(/\bturkey|ostritch|poultry|emu\b/gi)) {
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

var getDiag = function(d, sh, name) {
    var v = null;
    if (d.ping && d.ping.diagnostic && d.diagnostic[sh]) {
        v = d.ping.diagnostic[sh][name];
    } else if (d.diagnostic && d.diagnostic[sh]) {
        v = d.diagnostic[sh][name];
    }
    return v;
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
            var conf = Math.floor((parseFloat(el.Confidence) * 10) + 0.5) / 10;
            td1.innerText = conf.toString();
            r.appendChild(td0);
            r.appendChild(td1);
            t.appendChild(r);
        });
        ddiv.appendChild(t);
    }
    var el, ds, latest;
    latest = new Date(0);
    var ul = document.createElement('ul');
    ddiv.appendChild(ul);
    if (d && d.date) {
        el = document.createElement('li');
        ds = new Date(d.date);
        latest = ds;
        el.innerText = 'last image: ' + ds.toLocaleString();
        ul.appendChild(el);
    }
    if (d && d.ping && d.ping.date) {
        el = document.createElement('li');
        ds = new Date(d.ping.date);
        if (ds > latest) latest = ds;
        el.innerText = 'last ping: ' + ds.toLocaleString();
        ul.appendChild(el);
    }
    
    var ip = getDiag(d,'host','ip');
    if (ip) {
        el = document.createElement('li');
        el.innerText = 'Camera Local IP: ' + ip;
        ul.appendChild(el);

        var pip = null;
        if (d.ping && d.ping.diagnostic && d.ping.diagnostic.host) {
            if (!pip) pip = d.ping.diagnostic.host.public_ip;
        }
        if (pip) {
            el = document.createElement('li');
            el.innerText = 'Camera Public IP: ' + pip;
            ul.appendChild(el);
        }

        var host = getDiag(d,'host','name');
        el = document.createElement('li');
        el.innerText = 'Camera Host: ' + host;
        ul.appendChild(el);

        var uptime = getDiag(d,'host','uptime');
        el = document.createElement('li');
        el.innerText = 'Host Uptime: ' + uptime;
        ul.appendChild(el);

        var suptime = getDiag(d,'service','uptime');
        el = document.createElement('li');
        el.innerText = 'Service Uptime: ' + suptime;
        ul.appendChild(el);
    }

    if (latest) {
        now = new Date();
        el = document.createElement('li');
        if ((now - latest) > (5 * 60 * 1000)) {
            el.innerText = 'Camera is DOWN';
            el.style.color = 'red';
        } else {
            el.innerText = 'Camera is UP';
            el.style.color = 'green';
        }
        ul.appendChild(el);
    }

};

var getCamList = function(cb) {
    getJSON('/turkeycam/app/devicenames', function(err, data) {
        if (err) {
            console.log('Error getting camera list: ' + err);
            return cb(err);
        } else {
            return cb(null,data);
        }
    });
};

var checkData = function(name, cb) {
    getJSON('/turkeycam/app/status/' + name, function(err, new_data) {
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
        var cam_name = document.createElement('a');
        cam_name.style = "font-size: 150%;";
        cam_name.innerText = "Camera: " + cname;
        cam_name.href = 'app/status/' + cname;
        cam_nam_div.appendChild(cam_name);
        var cam_img_div = document.createElement('div');
        cam_img_div.style = "width: 805px; float: left;";
        var cam_img     = document.createElement('img');
        cam_img.style = "width: 800px; height: 600px;";
        cam_img.style.display = 'none';
        var cam_img_a = document.createElement('a');
        cam_img_a.href = "";
        cam_img_div.appendChild(cam_img_a);
        cam_img_a.appendChild(cam_img);
        var cam_dta_div = document.createElement('div');
        cam_dta_div.style = "margin-left: 810px;";
        var cam_trk_div = document.createElement('div');
        cam_trk_div.style = "margin-left: 810px;";
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

var to_dhms = function(secs) {
    var days = Math.floor(secs / (24*60*60));
    secs -= days * 24 * 60 * 60;
    var hours = Math.floor(secs / (60*60));
    secs -= hours * 60 * 60;
    var minutes = Math.floor(secs / (60));
    secs -= minutes * 60;
    return days.toString() + 'days, ' + hours.toString() + 'h, ' + minutes.toString() + 'm, ' + secs.toString() + 's';
};


var checkUptime = function(cb) {
    getJSON('/turkeycam/app/uptime' + name, function(err, rd) {
        var now = new Date();
        var start = new Date(rd.start_time);
        var uptime = Math.floor((now - start) / 1000);
        document.getElementById('uptimediv').innerText = 'Uptime: ' + to_dhms(uptime);
        cb(err,rd);
    });
};

var startTimer = function() {
    var camlist = Object.keys(camelems);
    async.each(camlist, function(camn,cb) {
        checkData(camn, function(cerr, cd) {
            cb();
        });
    },
    function (err) {
        checkUptime(function() {
            window.setTimeout(startTimer, 5000);
        });
    });
};




getCamList(function(err,incams) {
    if (!err) {
        makeCamDivs(incams, function() {
            startTimer();
        });
    }
});


