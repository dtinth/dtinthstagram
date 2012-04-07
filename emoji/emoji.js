
var emoji = {

	register: function(data) {
		var css = '.emj { background: url(https://github.com/iamcal/php-emoji/raw/eef7eb75efa88dee38c9fda7d4046aa30b6b09ea/iphone_emoji.png) top left no-repeat; width: 20px; height: 20px; display: -moz-inline-stack; display: inline-block; vertical-align: top; zoom: 1; *display: inline; text-indent: -40px; overflow: hidden; }';
		for (var i in data) {
			if (data.hasOwnProperty(i)) {
				css += '.emj' + i + ' { background-position: 0 -' + data[i][0] + 'px; }\n';
				for (var j = 0; j < data[i][1].length; j ++) {
					this.map[data[i][1][j]] = i;
				}
			}
		}
		document.write('<style>\n' + css + '</style>');
	},

	map: {},

	convert: function(str) {
		str = '' + str;
		for (var i in this.map) {
			if (this.map.hasOwnProperty(i)) {
				str = str.split(i).join('<span class="emj emj' + this.map[i] + '">' + i + '</span>');
			}
		}
		return str;
	}

};

