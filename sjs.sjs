
var http = require('apollo:http');
var ACCESS_TOKEN = localStorage.instagramAccessToken;
var CLIENT_ID = '99fd011a2cad4223a3b2bc48b4d2ab17';
var API_BASE = 'https://api.instagram.com/v1';
var CORS_BASE = 'https://corstagram.appspot.com/v1';

var scroll = require('./scroll');
var Fx = require('./fx').Fx;
var binds = require('./binder').binds;

if (location.href.match(/:8000/i)) {
	CLIENT_ID = 'd2f6987697f04bf9a99d0d98b7efa860';
}

var APP_NAME = 'dtinthstagram';
var me;

function req(url) {
	return http.jsonp(url);
}

function post(url, body) {
	return http.json(url, { method: "POST", body: body });
}
function del(url) {
	return http.json(url, { method: "DELETE" });
}
function up(res) {
	if (res.meta) return new Error(res.meta.code + ' ' + res.meta.error_type + ' ' + res.meta.error_message);
	return new Error('cannot load: ' + res);
}
function api_url(endpoint) {
	return endpoint + (~endpoint.indexOf('?') ? '&' : '?') + 'access_token=' + ACCESS_TOKEN;
}
function api(endpoint) {
	return req(api_url(endpoint));
}

function getFeed(params) {
	var m;
	if ((m = params.match(/uid=(\d+|self)/))) {
		return new UserFeed(m[1]);
	}
	if ((m = params.match(/tag=(\w+)/))) {
		return new TagFeed(m[1]);
	}
	if ((m = params.match(/u=(\w+)/))) {
		LoadingStuff.setStatus('searching for user: ' + m[1]);
		var res = api(API_BASE + '/users/search?q=' + m[1] + '&count=1');
		for (var i = 0; i < res.data.length; i ++) {
			if (res.data[i].username == m[1]) {
				return new UserFeed(res.data[i].id);
			}
		}
		alert('cannot find user: ' + m[1]);
		throw new Error('cannot find user: ' + m[1]);
	}
	return new HomeFeed();
}


function ElementWaiter(element, eventName) {
	var that = {};
	var trigger = function() {};
	$(element).bind(eventName, function() { trigger(); });
	that.wait = function() {
		waitfor() { trigger = resume; }
	};
	return that;
}

function ClickWaiter(element) {
	return new ElementWaiter(element, 'click');
}

function RateLimitedInvoker(callback, timeout) {
	var that = {};
	function worker() {
		var cont = false;
		while (true) {
			if (cont) {
				cont = false;
			} else {
				waitfor() {
					that.invoke = resume;
				}
				that.invoke = function() { cont = true; }
			}
			spawn callback();
			hold(timeout);
		}
	}
	spawn worker();
	return that;
}

var HistoryState = Backbone.Model.extend({
	destroy: function() {
		this.trigger('destroy');
		this.off();
	}
});

function StateManager(onstate) {

	var that = _.extend({}, Backbone.Events);

	var pool = {};
	var currentState = null;

	function getState(data) {
		if (pool[data.id]) return pool[data.id];
		var state = new HistoryState(data);
		onstate(state);
		return state;
	}

	function handle(data, url) {

		var exception;

		if (data == null) {
			var state = new HistoryState({
				id: createID(),
				breadcrumb:
					currentState && currentState.get('breadcrumb')
					? currentState.get('breadcrumb').concat(
						[currentState.get('id')])
					: []
			});
			onstate(state, currentState);
		} else {
			var state = getState(data);
		}
		pool[state.id] = state;

		if (currentState) {
			currentState.trigger('deactivate');
			currentState.off('change', replaceState);
			exception = currentState.id;
		}

		currentState = state;
		currentState.trigger('activate', url);
		currentState.on('change', replaceState);
		replaceState();

		pruneOldStates({ exceptions: [ exception ] });

	}

	function pruneOldStates(options) {
		var map = {};
		function except(list) {
			for (var i = 0; i < list.length; i ++) {
				map[list[i]] = true;
			}
		}
		except([currentState.id]);
		except(currentState.get('breadcrumb'));
		if (options.exceptions) except(options.exceptions);
		for (var i in pool) {
			if (pool.hasOwnProperty(i)) {
				if (!map.hasOwnProperty(i)) {
					pool[i].destroy();
					delete pool[i];
				}
			}
		}
	}

	function replaceState() {
		if (window.console && console.log) {
			console.log(JSON.stringify(currentState.toJSON()));
		}
		history.replaceState(currentState.toJSON(), null);
	}

	var nextID = 0;
	function createID() {
		return ':' + (nextID++) + ':' + new Date().getTime();
	}

	function go(url) {
		history.pushState(null, null, url);
		handle(history.state, location.search);
	}

	handle(history.state, location.search);

	window.addEventListener('popstate', function(e) {
		handle(e.state, location.search);
	}, false);

	that.getCurrentState = function() {
		return currentState;
	};

	that.go = go;

	return that;

}

function main() {

	$('#version').html(' v0.1.3')

	if (!ACCESS_TOKEN) {
		return authenticationNeeded();
	}

	LoadingStuff.setStatus('loading user data...');
	try {
		var res = api(API_BASE + '/users/self').data;
		if (res == null) {
			throw new Error('unauthorized');
		}
		me = UserFactory.fromJSON(res);
	} catch (e) {
		return authenticationNeeded();
	}

	var manager = ViewManager.getInstance();
	var states = new StateManager(handleState);

	function handleState(state, parent) {
		var view = null;
		state.on('activate', function(url) {
			if (view == null) {
				var feed = getFeed(url);
				view = new FeedView(feed, state.get('nav'));
				state.set('title', feed.title);
			}
			manager.setActiveView(view);
		});
		state.on('deactivate', function(url) {
		});
		state.on('destroy', function() {
			view.destroy();
			view = null;
		});
		function handleParent() {
			var nav = parent.get('nav');
			if (nav && nav.concat) {
				state.set('nav', nav.concat([parent.get('title')]));
			}
		}
		if (parent) handleParent();
		if (!state.get('nav')) state.set('nav', []);
	}

	function linkClicked(e) {
		var url = $(this).attr('href');
		states.go(url);
	}

	$('a[href^="?"]').live('click', function(e) {
		spawn linkClicked.call(this, e);
		return false;
	});

	LoadingStuff.finish();

	// unseen count
	var fluidHoster = window;
	var fluidIframe = null;
	var fluidQueuedText = null;
	function setDockBadge(text) {
		if ('fluid' in window) {
			try {
				if (fluidHoster == null) {
					fluidQueuedText = text;
				} else {
					fluidHoster.fluid.dockBadge = text;
				}
			} catch (e) {
				fluidHoster = null;
				fluidQueuedText = text;
				if (fluidIframe != null && fluidIframe.parentNode) {
					fluidIframe.parentNode.removeChild(fluidIframe);
				}
				var iframe = fluidIframe = document.createElement('iframe');
				iframe.onload = function() {
					fluidHoster = iframe.contentWindow;
					fluidHoster.fluid.dockBadge = fluidQueuedText;
				};
				iframe.src = 'about:blank';
				iframe.style.display = 'none';
				document.body.appendChild(iframe);
			}
		}
	}

	function setUnseen(count) {
		var titleBase = manager.activeView.getTitleBar() + '@' + me.get('username') + ' - ' + APP_NAME;
		if (count == 0) {
			setDockBadge('');
			document.title = titleBase;
		} else {
			setDockBadge(count);
			document.title = '(' + count + ') ' + titleBase;
		}
	}

	function updateUnseen() {
		var unseen = manager.activeView.getUnseen();
		setUnseen(unseen);
	}

	manager.on('activate', function(view) {
		view.calculatePositionTable();
		setTimeout(updateUnseen, 1);
	});

	var updateUnseenDelayedInvoker = new RateLimitedInvoker(updateUnseen, 100);
	$(window).bind('scroll', function() {
		updateUnseenDelayedInvoker.invoke();
	});

	setInterval(function() {
		manager.activeView.calculatePositionTable();
		updateUnseen();
	}, 1500);

}

var unimplemented = function() { throw new Error('Unimplemented!'); };

function View(dom) {

	var that = _.extend({}, Backbone.Events);
	that.dom = dom;
	that.id = View.generateId();
	
	that.subviews = {};
	that.parentView = null;
	that.register = function(subview) {
		// console.log(subview.id + ' register to ' + that.id)
		if (subview.parentView) subview.parentView.unregister(that);
		subview.parentView = that;
		that.subviews[subview.id] = subview;
		return that;
	};
	that.unregister = function(subview) {
		delete that.subviews[subview.id];
		subview.parentView = null;
		return that;
	};

	that.destroyed = false;
	that.destroy = function() {
		if (that.parentView) that.parentView.unregister(that);
		that.detach();
		for (var i in that.subviews) {
			if (that.subviews.hasOwnProperty(i)) {
				that.subviews[i].destroy();
			}
		}
		that.trigger('destroy');
		that.off();
		that.destroyed = true;
		that.dom = null;
		that.subviews = null;
	};

	that.detach = function() {
		if (that.dom.el) {
			that.dom.el.remove();
		}
	};

	var rendered = false;
	that.render = function() {
	};

	that.renderTo = function(el) {
		if (!rendered) {
			that.render();
			rendered = true;
		}
		that.dom.el.appendTo(el);
		return that;
	};

	return that;
}

View.generateId = (function() {
	var next = 0;
	return function() {
		return ':' + (next++);
	};
})();

function ViewManager() {
	var that = _.extend({}, Backbone.Events);
	that.activeView = null;
	that.setActiveView = function(view) {
		if (that.activeView == view) return;
		if (that.activeView != null) {
			try {
				that.activeView.deactivate();
			} catch (e) { window.console && console.error(e); }
		}
		that.activeView = view;
		if (!view.insertedByViewManager) {
			view.renderTo('#main');
		}
		view.insertedByViewManager = true;
		view.activate();
		that.trigger('activate', view);
	};
	return that;
}

ViewManager.getInstance = function() {
	if (this._instance == null) this._instance = new ViewManager();
	return this._instance;
};

function FeedLoader(baseURL) {
	var that = {};
	var minId = null;
	var maxId = null;
	var url = baseURL;
	function handleResponse(res) {
		if (res.data) {
			if (res.data[0]) {
				minId = res.data[0].id;
			}
			return res.data;
		}
	}
	that.hasNext = function() {
		return url != null;
	};
	that.loadNext = function() {
		var res = req(url);
		if (res.pagination) {
			maxId = res.pagination.next_max_id;
			url = baseURL + (~baseURL.indexOf('?') ? '&' : '') + 'max_id=' + maxId;
		} else {
			maxId = null;
			url = null;
		}
		// res.data.splice(0, 1); // for debugging refresh button
		return handleResponse(res);
	};
	that.refresh = function() {
		var res = req(baseURL + (~baseURL.indexOf('?') ? '&' : ''));
		return handleResponse(res);
	};
	return that;
}

function Collection() {
	var that = _.extend({}, Backbone.Events);
	that.list = [];
	that.prepend = function() {
		if (arguments.length == 0) return;
		that.list.unshift.apply(that.list, arguments);
		that.trigger('prepend', _.toArray(arguments));
		that.trigger('change');
	};
	that.append = function() {
		if (arguments.length == 0) return;
		that.list.push.apply(that.list, arguments);
		that.trigger('append', _.toArray(arguments));
		that.trigger('change');
	};
	that.get = function(i) { return that.list[i]; };
	that.set = function(i, v) { that.list[i] = v; };
	that.size = function() { return that.list.length; };
	return that;
}

function ResponseCollection() {
	var that = new Collection();
	var map = {};
	that.count = 0;
	that.merge = function(json, mapfn) {
		if (json == null) return;
		that.count = json.count;
		var addition = [];
		var newMap = {};
		for (var i = 0; i < json.data.length; i ++) {
			var c = mapfn(json.data[i]);
			if (map[c.id] == null) {
				map[c.id] = true;
				addition.push(c);
			}
			newMap[c.id] = true;
		}
		var toRemove = [];
		for (var i in map) {
			if (map.hasOwnProperty(i) && !newMap[i]) {
				delete map[i];
				for (var j = 0; j < that.list.length; j ++) {
					if (that.list[j].id == i) {
						toRemove.push(that.list[j]);
						that.list.splice(j, 1);
						break;
					}
				}
			}
		}
		if (toRemove.length > 0) {
			that.trigger('remove', toRemove);
		}
		that.append.apply(that.append, addition);
		if (toRemove.length > 0 && addition.length == 0) {
			that.trigger('change');
		}
	};
	return that;
}

var Media = Backbone.Model.extend({

	initialize: function(attributes) {
		this.likes = new ResponseCollection();
		this.comments = new ResponseCollection();
	},

	load: function(json) {
		this.likes.merge(json.likes, function(c) {
			return UserFactory.fromJSON(c);
		});
		this.mergeComments(json);
		this.set(this.parse(json));
		return this;
	},

	parse: function(json) {
		return {
			user:     UserFactory.fromJSON(json.user),
			filter:   json.filter,
			location: json.location,
			created:  new Date(json.created_time * 1000),
			link:     json.link,
			images:   json.images,
			liked:    !!json.user_has_liked
		};
	},

	mergeComments: function(json) {
		var comments = { count: 0, data: [] };
		if (json.comments != null) {
			comments.count = json.comments.count;
			comments.data = json.comments.data.slice();
		}
		if (json.caption) {
			comments.data.unshift(json.caption);
		}
		this.comments.merge(comments, function(c) {
			return Comment.fromJSON(c);
		});
	},

	toggleLike: function() {
		try {
			this.set('liking', true);
			var target = !this.get('liked');
			var res = (target ? post : del)(api_url(CORS_BASE + '/media/' + this.id + '/likes/'));
			if (res.meta && res.meta.code == 200) {
				this.set('liked', target);
			}
			return target;
		} finally {
			this.set('liking', false);
		}
	},

	comment: function(text) {
		var res = post(api_url(CORS_BASE + '/media/' + this.id + '/comments'), 'text=' + encodeURIComponent(text));
		if (res.meta && res.meta.code == 200) {
			this.comments.append(Comment.fromJSON(res.data));
		} else {
			throw up(res);
		}
	},

	reload: function() {
		try {
			this.set('reloading', true);
			var media = api(API_BASE + '/media/' + this.id + '?now=' + new Date().getTime());
			this.load(media.data);
		} finally {
			this.set('reloading', false);
		}
	}

});

var User = Backbone.Model.extend({

	load: function(json) {
		this.set(this.parse(json));
		return this;
	},

	parse: function(json) {
		return {
			username: json.username,
			fullName: json.fullName,
			profilePicture: json.profile_picture
		};
	}

});

var Comment = Backbone.Model.extend({
	isMention: function() {
		var mentions = this.get('text').match(/@\w+/g);
		if (!mentions) return false;
		for (var i = 0; i < mentions.length; i ++) {
			if (mentions[i].toLowerCase() == '@' + me.get('username').toLowerCase()) {
				return true;
			}
		}
		return false;
	}
});

Comment.fromJSON = function(json) {
	return new Comment({
		created: new Date(json.created_time * 1000),
		text:    json.text,
		from:    UserFactory.fromJSON(json.from),
		id:      json.id
	});
};

function Factory(model) {
	var that = {};
	that.map = {};
	that.has = function(id) {
		var key = 'id_' + id;
		return !!that.map[key];
	};
	that.get = function(id) {
		var key = 'id_' + id;
		return that.map[key] || (that.map[key] = new model({ id: id }));
	};
	that.fromJSON = function(json) {
		return that.get(json.id).load(json);
	};
	that.create = unimplemented;
	return that;
}

var MediaFactory = new Factory(Media);
var UserFactory = new Factory(User);

function Feed() {
	var that = new Collection();
	var map = {};
	that.status = new Backbone.Model();
	function getNewMedia(list) {
		var addition = [];
		for (var i = 0; i < list.length; i ++) {
			var media = MediaFactory.fromJSON(list[i]);
			if (map[media.id] == null) {
				map[media.id] = media;
				addition.push(media);
			}
		}
		return addition;
	}
	that.getTitleBar = function() {
		return '';
	};
	that.loadNext = function() {
		try {
			that.status.set('loading', true);
			var list = that.loader.loadNext();
			var addition = getNewMedia(list);
			if (addition.length > 0) {
				that.append.apply(that.append, addition);
			}
			return addition.length;
		} finally {
			that.status.set('loading', false);
		}
	};
	that.hasNext = function() {
		return that.loader.hasNext();
	};
	that.refresh = function() {
		try {
			that.status.set('refreshing', true);
			var list = that.loader.refresh();
			var addition = getNewMedia(list);
			if (addition.length > 0) {
				that.prepend.apply(that.prepend, addition);
			}
		} finally {
			that.status.set('refreshing', false);
		}
	};
	return that;
}

function HomeFeed() {
	var that = new Feed();
	that.loader = new FeedLoader(api_url(API_BASE + '/users/self/feed'));
	that.title = '/users/self/feed';
	return that;
}

function TagFeed(tagName) {
	var that = new Feed();
	that.loader = new FeedLoader(api_url(API_BASE + '/tags/' + tagName + '/media/recent'));
	that.title = '/tags/' + tagName + '/media/recent';
	that.getTitleBar = function() {
		return '[tag: ' + tagName + '] ';
	};
	return that;
}

function UserFeed(uid) {
	var that = new Feed();
	that.loader = new FeedLoader(api_url(API_BASE + '/users/' + uid + '/media/recent'));
	that.title = '/users/' + uid + '/media/recent';
	that.getTitleBar = function() {
		if (!UserFactory.has(uid)) return '';
		var user = UserFactory.get(uid);
		return '[user: ' + user.get('username') + '] ';
	};
	that.userInfo = null;
	that.user = null;
	function loadUserInfo() {
		var res = api(API_BASE + '/users/' + uid);
		var user = UserFactory.fromJSON(res.data);
		that.userInfo = res.data;
		that.user = user;
		that.trigger('userInfoLoaded');
	}
	that.userInfoStratum = spawn loadUserInfo();
	return that;
}


function TopLevelView(el) {

	var that = new View(el);
	
	that.active = false;
	that.activate = function() {
		that.active = true;
		that.dom.el.removeClass('hidden-view');
	};
	that.deactivate = function() {
		that.active = false;
		that.dom.el.addClass('hidden-view');
	};

	return that;

}

function FeedView(feed, navigation) {

	var that = new TopLevelView($('#feed').tpl());
	
	that.feed = feed;
	that.dom.el.iconify();
	that.dom.title.text(feed.title);

	navigation.forEach(function(item, index) {
		var el = $('<div class="breadcrumb-item"></div>').appendTo(that.dom.breadcrumb);
		$('<span></span>').text(item).click(function() {
			history.go(index - navigation.length);
		}).appendTo(el);
	});

	that.getTitleBar = function() {
		return that.feed.getTitleBar();
	};
	that.add = function(view) {
		that.register(view);
		view.renderTo(that.dom.contents);
	};
	that.fadeHeader = function() {
		return Fx.fadeOutAndShow([that.dom.head[0], document.getElementById('head')]);
	};
	that.fadeFooter = function() {
		return Fx.fadeOutAndShow([that.dom.footer[0]]);
	};


	// debug mode: pressing p prepends
	/*
	$(window).keypress(function(e) {
		if (e.charCode == 'p'.charCodeAt(0)) {
			that.feed.prepend(that.feed.get(0));
		}
	});
	*/

	// user info, if available
	
	var userInfoView = null;
	function showUserInfo() {
		userInfoView = new UserInfoView(that.feed.userInfo, that.feed.user);
		userInfoView.renderTo(that.dom.userInfo);
		that.register(userInfoView);
		that.dom.userInfo.slideDown('slow');
	}
	that.dom.userInfo.hide();

	function userInfoWorker() {
		waitfor() {
			that.canShowUserInfo = resume;
		}
		return; // not yet :3
		if (!that.feed.userInfoStratum) return;
		that.feed.userInfoStratum.waitforValue();
		showUserInfo();
	}
	spawn userInfoWorker();

	function checkUserInfo() {
		if (userInfoChecked) return;
		userInfoChecked = true;
		if (that.feed.userInfo != null) {
			showUserInfo();
		}
		that.feed.on('userInfoLoaded', showUserInfo);
	}


	// loading indicator

	spawn function() {
		var waiter = new ClickWaiter(that.dom.loadMore);
		var scrollWaiter = new ElementWaiter(window, 'scroll');
		var count = 0;
		var cont = false;
		for (;;) {
			waitfor {
				waiter.wait();
				count = 0;
			} or {
				for (;;) {
					if (cont) {
						cont = false;
					} else {
						scrollWaiter.wait();
					}
					if (that.active && count < 3 && scroll.get() + window.innerHeight > document.body.offsetHeight - 150) {
						count ++;
						break;
					}
				}
			}
			try {
				if (that.feed.loadNext() == 0) {
					count = Infinity;
				}
			} catch (e) {
				count = Infinity;
				window.console && console.error(e);
			}
			hold(500);
			cont = true;
		}
	}();


	// refreshing indicator
	that.dom.refresh.click(function() {
		if (!that.feed.status.get('refreshing')) {
			that.feed.refresh();
		}
	});

	binds(that.feed.status, that)
		.showWhile('loading', that.dom.loading)
		.hideWhile('loading', that.dom.loadMore)
		.toggleClass('refreshing', that.dom.refresh, 'dim')

	
	var activeView = null;


	// get number of unseen pictures

	var posTable = [];
	that.calculatePositionTable = function() {
		posTable = [];
		if (activeView == null) return;
		var imgs = activeView.getItemElements();
		for (var i = 0; i < imgs.length; i ++) {
			posTable.push(imgs.eq(i).offset().top);
		}
	};
	that.getUnseen = function() {
		var min = 0, max = posTable.length - 1;
		var l = min, r = max;
		var cscroll = scroll.get();
		while (l <= r) {
			var m = Math.floor((l + r) / 2);
			if (posTable[m] < cscroll) {
				if (m + 1 > max || cscroll <= posTable[m + 1]) {
					return m + 1;
				} else {
					l = m + 1;
				}
			} else {
				r = m - 1;
			}
		}
		return 0;
	};
	function getCurrentScrollIndex() {
		var index = 0;
		var cscroll = scroll.get();
		that.calculatePositionTable();
		for (var i = 0; i < posTable.length; i ++) {
			if (posTable[i] >= cscroll) {
				index = i;
				break;
			}
		}
		return index;
	}
	function scrollPic(direction) {
		if (posTable.length == 0) return;
		var cscroll = scroll.get();
		var index = getCurrentScrollIndex();
		var target = index;
		for (i = index; i >= 0 && i < posTable.length; i += direction) {
			if (posTable[i] != posTable[target]) {
				target = i;
				break;
			}
		}
		scroll.animateBy(posTable[target] - cscroll - 30)
	}
	$(document).on('keydown', function(e) {
		if (document.activeElement && document.activeElement.nodeName == 'TEXTAREA') {
			return;
		}
		if (e.keyCode == 74) {
			scrollPic(1);
		}
		if (e.keyCode == 75) {
			scrollPic(-1);
		}
		if (e.keyCode == 76) {
			var index = getCurrentScrollIndex();
			if (activeView.like) {
				activeView.like(index);
			}
		}
	});

	// view switching
	
	spawn function() {
		var modes = [
			function() { return new MediaListView(that.feed); },
			function() { return new MediaGridView(that.feed); }
		];
		var views = {};
		var currentMode = 0;
		var waiter = new ClickWaiter(that.dom.switchView);
		for (;;) {
			activeView = views[currentMode];
			if (!activeView) {
				activeView = views[currentMode] = modes[currentMode]();
				that.add(activeView);
			} else {
				activeView.dom.el.show();
			}
			activeView.active = true;
			that.calculatePositionTable();
			waiter.wait();
			activeView.active = false;
			activeView.dom.el.hide();
			currentMode = (currentMode + 1) % modes.length;
		}
	}();

	spawn that.feed.loadNext();


	// auto refresh

	var refreshTimer = null;
	var lastRefreshTime = new Date().getTime();

	function refreshFeed() {
		lastRefreshTime = new Date().getTime();
		spawn that.feed.refresh();
		resetTimer(60000);
	}

	function resetTimer(fixedTime) {
		clearTimeout(refreshTimer);
		refreshTimer = setTimeout(refreshFeed, fixedTime);
	}

	that.activate = function(_super) {
		return function() {
			_super();
			resetTimer(Math.max(500, 60000 - (new Date().getTime() - lastRefreshTime)));
		};
	}(that.activate);

	that.deactivate = function(_super) {
		return function() {
			_super();
			clearTimeout(refreshTimer);
		};
	}(that.deactivate);

	return that;

}

function MediaCollectionView(template, feed) {

	var that = new View(template);

	that.feed = feed;
	return that;

}

function MediaListView(feed) {

	var that = new MediaCollectionView($('#list-view').tpl(), feed);

	that.like = function(index) {
		that.getItemElements().eq(index).closest('.picture').find('[data-role="likeIcon"]').eq(0).click();
	};
	that.getItemElements = function() {
		return that.dom.el.find('.image');
	};

	// appending and prepending media

	function showList(list) {
		var el = $('<div class="changeset"></div>');
		for (var i = 0; i < list.length; i ++) {
			var media = list[i];
			var view = new MediaView(media);
			view.renderTo(el);
			that.register(view);
		}
		return el;
	}

	that.dom.el.append(showList(that.feed.list));
	that.feed.on('append', function(nextData) {
		var changeset = showList(nextData);
		if (!that.active) {
			that.dom.el.append(changeset);
			return;
		}
		var show = that.parentView && that.parentView.fadeFooter && that.parentView.fadeFooter();
		that.dom.el.append(changeset);
		show && show();
		Fx.animation(600, function(x) {
			var top = Math.round(window.innerHeight * Math.pow(1 - x, 2));
			changeset.css('top', top + 'px');
		});
		that.parentView && that.parentView.canShowUserInfo && that.parentView.canShowUserInfo();
	});
	
	that.feed.on('prepend', function(newData) {
		var changeset = showList(newData);
		if (!that.active) {
			that.dom.el.prepend(changeset);
			return;
		}
		var el = that.dom.el.find('.picture').eq(0);
		var show = that.parentView && that.parentView.fadeHeader && that.parentView.fadeHeader();
		var oldTop = el.offset().top;
		changeset.css('visibility', 'hidden');
		that.dom.el.prepend(changeset);
		var newTop = el.offset().top;
		window.scrollBy(0, newTop - oldTop);
		show && show();
		changeset.css('visibility', '');
		Fx.animation(600, function(x) {
			var top = Math.round(-window.innerHeight * Math.pow(1 - x, 2));
			changeset[0].style.top = top + 'px';
		});
	});

	return that;

}

function MediaGridView(feed) {

	var that = new MediaCollectionView($('#grid-view').tpl(), feed);

	that.getItemElements = function() {
		return that.dom.el.find('.grid-item');
	};

	// appending and prepending media
	var list = [];
	var nextColumn = 0;
	function showList(list) {
		var el = $('<div class="changeset"></div>');
		for (var i = 0; i < list.length; i ++) {
			var view = new GridItemView(list[i]).renderTo(el);
			view.dom.el.attr('data-column', nextColumn);
			nextColumn = (nextColumn + 1) % 4;
			that.register(view);
		}
		return el;
	}

	that.dom.el.append(showList(that.feed.list));
	that.feed.on('append', function(nextData) {
		that.dom.el.append(showList(nextData));
	});
	
	var markerElement = null;

	that.feed.on('prepend', function(newData) {
		var el = markerElement == null ? that.dom.el.find('.grid-item').eq(0) : markerElement;
		var oldTop = el.find('.image').offset().top;
		that.dom.el.prepend(showList(newData));
		nextColumn = 0;
		that.dom.el.find('.grid-item').each(function() {
			$(this).attr('data-column', nextColumn).addClass('wtf').removeClass('wtf'); // wtf
			nextColumn = (nextColumn + 1) % 4;
		});
		if (that.active) {
			if (markerElement == null) {
				if (el.attr('data-column') != '0') {
					markerElement = el;
					el.addClass('new-mark');
					spawn function() {
						hold(1);
						el.addClass('marker');
						for (;;) {
							hold(1000);
							if (scroll.get() < el.offset().top - 150) {
								break;
							}
						}
						markerElement = null;
						el.removeClass('new-mark');
						hold(1000);
						el.removeClass('marker');
					}();
				}
			}
			that.parentView && that.parentView.calculatePositionTable && that.parentView.calculatePositionTable();
			var newTop = el.find('.image').offset().top;
			window.scrollBy(0, newTop - oldTop);
		}
	});

	return that;

}

function GridItemView(media) {

	var that = new View($('#grid-item').tpl());
	that.dom.image.append(Fx.image(media.get('images').thumbnail.url));

	spawn function() {
		var waiter = new ClickWaiter(that.dom.image);
		that.dom.large.hide();
		waiter.wait();
		var mediaView = new MediaView(media);
		mediaView.renderTo(that.dom.info);
		that.dom.large.show();
		that.register(mediaView);
		mediaView.dom.leftSide.hide();
		for (;;) {
			that.dom.el.addClass('active');
			mediaView.dom.leftSide.fadeIn();
			Fx.slideDown(that.dom.large[0], 500);
			waiter.wait();
			mediaView.dom.leftSide.fadeOut();
			that.dom.el.removeClass('active');
			Fx.slideUp(that.dom.large[0], 500);
			waiter.wait();
		}
	}();

	return that;

}

function CollectionView(collection, factory) {
	var that = new View($('#collection').tpl());
	var display = [];
	var animationEnabled = false;
	function update() {
		var all = [];
		var prevMap = {};
		var nextMap = {};
		var next = [];
		for (var i = 0; i < display.length; i ++) {
			var c = display[i];
			prevMap[c.id] = c;
			all.push(c);
		}
		for (var i = 0; i < collection.size(); i ++) {
			var c = {
				el: null,
				view: null,
				item: collection.get(i),
				id: collection.get(i).id
			};
			if (!prevMap[c.id]) {
				all.push(c);
				next.push(c);
			} else {
				next.push(prevMap[c.id]);
			}
			nextMap[c.id] = true;
		}
		var comparator = function(a, b) {
			return a.item.get('created').getTime() - b.item.get('created').getTime();
		};
		all.sort(comparator);
		next.sort(comparator);
		display = next;
		for (var i = 0; i < all.length; i ++) {
			var c = all[i];
			if (!nextMap[c.id]) {
				that.dom.el.append(c.el);
				if (animationEnabled) {
					spawn Fx.slideUp(c.el[0], null, true);
				} else {
					c.el.remove();
				}
			} else if (!prevMap[c.id]) {
				c.el = $('<div class="collectionview-item"></div>');
				c.view = factory(c.item);
				c.view.renderTo(c.el);
				that.dom.el.append(c.el);
				if (animationEnabled) {
					spawn Fx.slideDown(c.el[0]);
				}
			} else {
				that.dom.el.append(c.el);
			}
		}
	}
	that.render = function() {
		update();
		animationEnabled = true;
		collection.on('change', function() {
			update();
		});
	};
	return that;
}

function AddCommentView(feed) {

	var that = new View($('#add-comment').tpl());
	that.dom.pointer.each(function() {
		var paper = Raphael(this, 12, 12);
		paper.path('M 14 -1 M 10.5 -1 l 0 2 l -5 5 l 5 5 l 0 2 L 14 13')
			.attr({ 'stroke': '#454443', 'fill': '#090807' });
	});
	that.dom.user.html(user_html(me));
	that.dom.el.hide();

	var showing = false;
	that.hide = function() {
		if (!showing) return;
		showing = false;
		that.dom.el.hide('fast');
	};
	that.show = function() {
		if (showing) return;
		showing = true;
		that.dom.el.show('fast');
		that.dom.textarea[0].focus();
	};
	that.toggle = function() {
		if (showing) {
			that.hide();
		} else {
			that.show();
		}
	};
	that.events = _.extend({}, Backbone.Events);

	that.dom.textarea.keydown(function(e) {
		if (e.keyCode == 13) {
			that.events.trigger('enter');
			return false;
		}
	});
	that.getText = function() {
		return that.dom.textarea[0].value;
	};
	that.disable = function() {
		that.dom.textarea[0].disabled = true;
		that.dom.el.addClass('dim');
	};
	that.enable = function() {
		that.dom.textarea[0].disabled = false;
		that.dom.el.removeClass('dim');
	};
	return that;

}

function MediaView(media) {

	var that = new View($('#picture').tpl());
	var dom = that.dom;

	var binder = binds(media, that);

	// user

	dom.user.html(user_html(media.get('user')));
	dom.picture.append('<a href="' + user_url(media.get('user')) + '"><img src="' + media.get('user').get('profilePicture') + '" alt=""></a>');
	dom.date.html('<a href="' + media.get('link') + '">' + formatDate(media.get('created')) + '</a>');


	// image
	
	var lowResImage = Fx.image(media.get('images').low_resolution.url).appendTo(dom.image);

	dom.image.click(function() {
		dom.el.toggleClass('zoomed');
	});

	if (media.get('filter') != 'Normal') {
		dom.effectsName.text(media.get('filter'));
	} else {
		dom.effectsIcon.hide();
	}

	spawn function() {
		waitfor() {
			dom.image.one('click', resume);
		}
		lowResImage[0].className = 'dim';
		Fx.image(media.get('images').standard_resolution.url).appendTo(dom.image);
	}();


	// geotag
	
	var location = media.get('location');
	if (location) {
		var place = location.latitude + ', ' + location.longitude;
		var placeName = place;
		if (location.name) placeName = location.name;
		dom.geo.html('<a href="http://maps.google.com/?q=' + encodeURIComponent(place) + '">' + placeName + '</a>');
	} else {
		dom.geoContainer.hide();
	}


	// comments

	function format(html) {
		return html.replace(/@(\w+)|#(\w+)/g, function(all, username, hashtag) {
			if (username) {
				return '<a href="?u=' + username + '">' + all + '</a>';
			}
			if (hashtag) {
				return '<a href="?tag=' + hashtag + '">' + all + '</a>';
			}
			return all;
		});
	}

	var commentsView = new CollectionView(media.comments, createCommentView);
	function createCommentView(comment) {
		var commentView = new View($('#comment').tpl());
		if (comment.isMention()) {
			commentView.dom.el.addClass('comment-mention');
		}
		commentView.dom.user.html(user_html(comment.get('from')));
		commentView.dom.text.text(comment.get('text'));
		commentView.dom.text.html(emoji.convert(format(commentView.dom.text.html())));
		commentView.dom.date.html(formatDate(comment.get('created')));
		return commentView;
	};
	function updateCommentCount() {
		dom.commentCount.text(media.comments.count);
	}
	commentsView.renderTo(dom.rows);
	updateCommentCount();
	media.comments.on('change', updateCommentCount);
	var addCommentView = null;
	dom.commentIcon.click(function() {
		if (addCommentView == null) {
			addCommentView = new AddCommentView();
			addCommentView.events.on('enter', function() {
				var text = addCommentView.getText();
				try {
					addCommentView.disable();
					media.comment(text);
					addCommentView.hide();
				} catch (e) {
					alert('cannot post comment:\n' + e.toString());
				} finally {
					addCommentView.enable();
				}
			});
			addCommentView.renderTo(dom.addComment);
		}
		addCommentView.toggle();
	});


	// likes

	function showLikes() {
		var html = '';
		var count = 0;
		for (var i = 0; i < media.likes.size(); i ++) {
			html += (i == 0 ? '' : ', ') + user_html(media.likes.get(i));
			count ++;
		}
		if (media.likes.size() < media.likes.count) {
			html += ', +' + (media.likes.count - media.likes.size()) + ' others';
		}
		dom.likes.html(html);
		dom.likeCount.text(media.likes.count);
	}

	showLikes();
	dom.el.iconify();
	media.likes.on('change', showLikes);

	function updateLike() {
		dom.likeIcon.data('icon').attr('fill', media.get('liked') ? '#ffff99' : '#8b8685');
	}

	binder
		.toggleClass('liking', dom.likeIcon, 'dim')
		.toggleClass('reloading', dom.right, 'dim')
		.bind('liked', updateLike)

	dom.likeIcon.click(function() {
		var target = media.toggleLike();
		media.reload();
		media.set('liked', target);
	});

	return that;

}


function UserInfoView(userInfo, user) {
	var that = new View($('#user-info').tpl());
	that.dom.picture.append('<img src="' + user.get('profilePicture') + '" alt="">');
	return that;
}

function formatDate(cdate) {
	var fdate = '';
	var now = new Date();
	if (cdate.getDate() != now.getDate() || cdate.getMonth() != now.getMonth() || cdate.getFullYear() != now.getFullYear()) {
		fdate = (cdate.getFullYear() != now.getFullYear() ? cdate.getFullYear() + '-' : '') + twoDigits(cdate.getMonth() + 1) + '-' + twoDigits(cdate.getDate()) + ' ';
	}
	function twoDigits(x) {
		return (x < 10 ? '0' : '') + x;
	}
	return fdate + cdate.getHours() + ':' + twoDigits(cdate.getMinutes()) + ':' + twoDigits(cdate.getSeconds());
}

function user_url(user) {
	return '?u=' + user.get('username');
}
function user_html(user) {
	return '<a href="' + user_url(user) + '" class="username" data-username="'
		+ user.get('username') + '" data-uid="' + user.id + '">'
		+ user.get('username') + '</a>';
}

function authenticationNeeded() {
	LoadingStuff.finish();
	var callbackURL = location.protocol + '//' + location.host + location.pathname.replace(/[^\/]*$/, '') + 'callback.html';
	var redirectURL = 'https://instagram.com/oauth/authorize/?client_id=' + CLIENT_ID + '&redirect_uri=' + encodeURIComponent(callbackURL) + '&response_type=token&scope=likes+comments+relationships';
	$('#auth-needed').tpl().el.appendTo('#main');
	location.replace(redirectURL);
}

$(main);
