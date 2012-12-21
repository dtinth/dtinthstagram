var animation = null
var offset = 0

function get() {
	return window.scrollY + offset
}

function animateBy(s) {
	offset += s
	startAnimation()
}

function startAnimation() {
	if (animation == null) setTimeout(frame, 1 / 60);
	animation = { start: new Date().getTime(), size: offset, last: offset }
}

function frame() {
	var elapsed = (new Date().getTime() - animation.start) / 100;
	var exp = Math.max(Math.exp(-elapsed) * 1.02 - 0.02, 0);
	var left = Math.round(exp * animation.size)
	var by = left - animation.last
	window.scrollBy(0, -by)
	offset = animation.last = left
	if (left != 0) {
		setTimeout(frame, 1 / 60)
	} else {
		animation = null
	}
}

exports.get = get
exports.animateBy = animateBy
