
function makeUL(jsdata) {
    var labels = Object.keys(jsdata);
    var ul = document.createElement('ul');
    for (var j=0;j<labels.length;j++) {
        var label = labels[j];
        var ldata = jsdata[label];
        var li = document.createElement('li');
        ul.appendChild(li);
        var value = '';
        if (label === 'aws_results') {
            /* jshint loopfunc: true */
            value = ldata.Labels.map(function(x) { 
                var y = Math.floor(parseFloat(x.Confidence)+0.5); 
                return x.Name + ' (' + y + ')'; }).join(', ');
        } else {
            value = JSON.stringify(ldata);
        }
        li.innerText = label + ': ' + value;
    }
    return ul;
}

var populateTurkeys = function() {
    var turktable = document.getElementById('turktable');
    removeChildren(turktable);
    getJSON('/turkeycam/app/turkeys/list', function(err, data) {
        if (err) {
            turksdiv.innerText += 'Error getting turkey list.';
            return;
        }
        if (!data) {
            turksdiv.innerText += 'No turkeys to show.';
        }
        var dates = Object.keys(data);
        var row_idx = 0;
        var col_idx = 0;
        var row = document.createElement('tr');
        for (var i=0; i<dates.length; i++) {
            var date = dates[i];
            var isrc = '/turkeycam/app/turkeys/' + data[date].jpg;
            if (isrc) {
                var img  = document.createElement('img');
                img.style.display = 'block';
                img.style.width = '100%';
                img.src = isrc;
                var sp = document.createElement('span');
                sp.addEventListener('click',zoomImage);
                sp.appendChild(img);
                var imgtd = document.createElement('td');
                imgtd.appendChild(sp);
                imgtd.style.width = '33%';
                row.appendChild(imgtd);
                col_idx += 1;
                if (col_idx >= 3) {
                    turktable.appendChild(row);
                    col_idx = 0;
                    row_idx += 1;
                    row = document.createElement('tr');
                }
            }
        }
        if (col_idx) turktable.appendChild(row);
    });
};

var unZoomImage = function() {
    var zd = document.getElementById('zoomdiv');
    zd.style.display = 'none';
};

var zoomImage = function(ev) {
    console.log(ev);
    var zd = document.getElementById('zoomdiv');
    removeChildren(zd);
    var img = document.createElement('img');
    img.src = ev.target.src;
    img.style.width = "100%";
    zd.appendChild(img);
    // zd.style.top = ev.clientY + 'px';
    // zd.style.top = ev.pageY+ 'px';
    var jsrc = ev.target.src.replace(/\.jpg$/,'.json');
    getJSON(jsrc, function(jserr, jdata, jsurl) {
        if (!jserr) {
	    ul = makeUL(jdata);
            zd.appendChild(ul);
	}
        zd.style.display = 'block';
    });
};

var setup = function() {
    var tbutton = document.getElementById('reloadturkeys');
    tbutton.addEventListener('click',populateTurkeys);
    document.getElementById('zoomdiv').addEventListener('click',unZoomImage);
    populateTurkeys();
};

setup();

