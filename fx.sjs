
var Fx = exports.Fx = {

	nextFrame: function() {
		waitfor() {
			if (typeof requestAnimationFrame == 'function') {
				requestAnimationFrame(resume);
			} else if (typeof mozRequestAnimationFrame == 'function') {
				mozRequestAnimationFrame(resume);
			} else if (typeof webkitRequestAnimationFrame == 'function') {
				webkitRequestAnimationFrame(resume);
			} else if (typeof msRequestAnimationFrame == 'function') {
				msRequestAnimationFrame(resume);
			} else {
				hold(1000 / 60);
				resume();
			}
		}
	},

	animation: function(duration, callback) {
		var start = new Date().getTime();
		do {
			var now = new Date().getTime();
			var value = Math.min(1, (now - start) / duration);
			callback(value);
			this.nextFrame();
		} while (now - start < duration);
	},

	fadeOutAndShow: function(list) {
		function setOpacity(o) {
			for (var i = 0; i < list.length; i ++) {
				list[i].style.opacity = o;
			}
		}
		Fx.animation(200, function(x) {
			setOpacity(1 - x);
		});
		return function() {
			setOpacity(1);
		};
	},

	slide: function(element, inner, duration, formula) {
		duration = duration || 300;
		Fx.animation(duration, function(x) {
			var height = formula(x) * inner.offsetHeight;
			element.style.height = height + 'px';
		});
	},
	
	slideDown: function(element, duration) {
		var inner = element.firstChild;
		element.style.overflow = 'hidden';
		element.style.height = '0';
		Fx.slide(element, inner, duration, function(x) { return (1 - Math.pow(1 - x, 2)) });
		element.style.height = '';
		element.style.overflow = '';
	},

	slideUp: function(element, duration, remove) {
		var inner = element.firstChild;
		element.style.overflow = 'hidden';
		Fx.slide(element, inner, duration, function(x) { return Math.pow(1 - x, 2); });
		remove && element.parentNode && element.parentNode.removeChild(element);
	},

	image: function(src) {
		var el = new Image();
		el.className = 'hide';
		function worker() {
			waitfor {
				waitfor() {
					el.onload = resume;
					el.src = src;
				}
			} or {
				hold(3000);
			}
			hold(1);
			el.className = 'show';
		}
		spawn worker();
		return $(el);
	}

};
