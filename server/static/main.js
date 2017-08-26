
console.log('Hi there! 000');
// Hi there!

var removeChildren = function(n) {
    while (n.hasChildNodes()) n.removeChild(n.lastChild);
};


var reloadImage = function() {
    console.log('reloadImage()');
    if (false) {
        console.log('reload_img');
        var idiv = document.getElementById('imgdiv');    
        removeChildren(idiv);
        var img = document.createElement('img');
        img.src = '/turkeycam/image';
        idiv.appendChild(img);
    }

    document.getElementById('myimg').src = '/turkeycam/image?' + (new Date()).getTime();
};


var getJSON = function(url, cb) {
    console.log('getJSON');
    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function() {
        if ((this.readyState == 4) && (this.status == 200)) {
            console.log('getJSON parseAttempt');
            var data = JSON.parse(this.responseText);
            return cb(null, data);
        }
    };
    xhr.open('GET',url);
    xhr.send();
};


current_result = {
    valid: false,
    busy: false,
    date: '',
};

var makeTable = function(d) {
    var ddiv = document.getElementById('ddiv');
    removeChildren(ddiv);
    if (d && d.aws_results && d.aws_results.Labels) {
        var t = document.createElement('table');
        d.aws_results.Labels.forEach(function(el) {
            var r = document.createElement('tr');
            var td0 = document.createElement('td');
            var td1 = document.createElement('td');
            td0.innerText = el.Name;
            var conf = Math.floor((parseFloat(el.Confidence) * 100) + 0.5) / 100;
            td1.innerText = conf.toString();
            r.appendChild(td0);
            r.appendChild(td1);
            t.appendChild(r);
        });
        ddiv.appendChild(t);
    }
};

var checkData = function(cb) {
    console.log('checkData()');
    getJSON('/turkeycam/status', function(err, data) {
        console.log('getJSON CB()');
        if (err) {
            return cb('err');
        } else if (data && 
            (!current_result || 
             (current_result.data != data.date)) &&
             data.valid
           ) {
            current_result = data;
            console.log(JSON.stringify(data,null,2));
            reloadImage();
            makeTable(data);
            return cb(null,data);
        } else {
            return cb('skip');
        }
    });
};

var startTimer = function() {
    checkData(function(err, data) {
        console.log('checkData CB()');
        window.setTimeout(startTimer, 15000);
    });
};


startTimer();
