
exports.binds = binds;

function binds(model, view) {
	model.on('change', onchange)
	var bindings = []
	function onchange() {
		for (var i = 0; i < bindings.length; i ++) {
			bindings[i]()
		}
	}
	view.on('destroy', function() {
		model.off('change', onchange);
	});
	return {
		bind: function(attribute, callback) {
			callback();
			return this.add(function() {
				if (model.hasChanged(attribute)) {
					callback();
				}
			});
		},
		add: function(fn) {
			bindings.push(fn);
			return this;
		},
		toggle: function(attribute, on, off) {
			return this.bind(attribute, function() {
				if (model.get(attribute)) on(); else off();
			});
		},
		toggleClass: function(attribute, el, className) {
			return this.toggle(attribute,
				function() { el.addClass(className); },
				function() { el.removeClass(className); }
			);
		},
		showWhile: function(attribute, el) {
			return this.toggle(attribute,
				function() { el.show(); },
				function() { el.hide(); });
		},
		hideWhile: function(attribute, el) {
			return this.toggle(attribute,
				function() { el.hide(); },
				function() { el.show(); });
		},
	}
}
