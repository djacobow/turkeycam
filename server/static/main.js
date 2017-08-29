
var removeChildren = function(n) {
    while (n.hasChildNodes()) n.removeChild(n.lastChild);
};


var reloadImage = function(name) {
    console.log('reloadImage()');
    document.getElementById('myimg').src = '/turkeycam/image/' + name + '?' + (new Date()).getTime();
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


current_results = {
    cam0: {
        valid: false,
        busy: false,
        date: '',
    },
};

var makeTable = function(d) {
    var ddiv = document.getElementById('ddiv');
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
        p.innerText = d.date;
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
            makeTable(data);
            return cb(null,data);
        } else {
            return cb('skip');
        }
    });
};

var startTimer = function() {
    checkData(cams[0], function(err, data) {
        window.setTimeout(startTimer, 15000);
    });
};



var cams = [];

getCamList(function(err,incams) {
    if (!err) {
        cams = incams;
        startTimer();
    }
});
