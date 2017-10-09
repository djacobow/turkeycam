
function showJS(jserr, jsdata, jsurl) {
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
    document.getElementById(jsurl).appendChild(ul);
}

var populateTurkeys = function() {
    var turktable = document.getElementById('turktable');
    removeChildren(turktable);
    getJSON('/turkeycam/turkeys/list', function(err, data) {
        if (err) {
            turksdiv.innerText += 'Error getting turkey list.';
            return;
        }
        if (!data) {
            turksdiv.innerText += 'No turkeys to show.';
        }
        var dates = Object.keys(data);
        for (var i=0; i<dates.length; i++) {
            var date = dates[i];
            var isrc = '/turkeycam/turkeys/' + data[date].jpg;
            if (isrc) {
                var img  = document.createElement('img');
                img.style.width = '600';
                img.style.height= '450';
                img.src = isrc;
                var a = document.createElement('a');
                a.href = isrc;
                a.appendChild(img);
                var space = document.createElement('span');
                space.innerText = ' ';
                var row = document.createElement('tr');
                var imgtd = document.createElement('td');
                imgtd.appendChild(a);
                imgtd.style.width = '50%';
                row.appendChild(imgtd);
                if ('json' in data[date]) {
                    var jsrc = '/turkeycam/turkeys/' + data[date].json;
                    var datatd = document.createElement('td');
                    datatd.style.width = '50%';
                    var dataspan = document.createElement('span');
                    dataspan.id = jsrc;
                    datatd.appendChild(dataspan);
                    row.appendChild(datatd);
                    getJSON(jsrc, showJS);
                }
                turktable.appendChild(row);
            }
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


var setup = function() {
    var tbutton = document.getElementById('reloadturkeys');
    tbutton.addEventListener('click',populateTurkeys);
    populateTurkeys();
};

setup();

