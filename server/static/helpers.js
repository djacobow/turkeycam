var removeChildren = function(n) {
    while (n.hasChildNodes()) n.removeChild(n.lastChild);
};


var getJSON = function(url, cb) {
    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function() {
        if (this.readyState == 4) {
            if (this.status == 200) {
                var data = JSON.parse(this.responseText);
                return cb(null, data, url);
            }
            return cb('err', null, url);
        }
    };
    xhr.open('GET',url);
    xhr.send();
};

