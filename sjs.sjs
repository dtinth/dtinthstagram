
var http = require('apollo:http');
var ACCESS_TOKEN = localStorage.instagramAccessToken;
var CLIENT_ID = '99fd011a2cad4223a3b2bc48b4d2ab17';
var API_BASE = 'https://api.instagram.com/v1';
var CORS_BASE = 'https://corstagram.appspot.com/v1';

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

function main() {

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

	(function() {
		var viewsMap = {};
		var scrollPosMap = {};
		var currentStateId = null;
		function createViewId() {
			return new Date() + ':' + Math.random();
		}
		function setState(state) {
			var data = state.data;
			window.console && console.log('current state', state.url);
			if (state.data.viewId == null) {
				state.data.viewId = createViewId();
				History.replaceState(state.data, null, null);
			}
			var view = viewsMap[state.data.viewId];
			if (view == null) {
				var view = viewsMap[state.data.viewId] = new FeedView(getFeed(state.url));
			}
			manager.setActiveView(view);
			if (state.id) {
				currentStateId = state.id;
				if (scrollPosMap[currentStateId] != null) {
					var scrollPos = scrollPosMap[currentStateId];
					window.scrollTo(scrollPos[0], scrollPos[1]);
				}
				saveScrolling();
			}
			manager.activeView.calculatePositionTable();
			setTimeout(updateUnseen, 1);
		}
		function saveScrolling() {
			if (currentStateId != null) {
				scrollPosMap[currentStateId] = [ window.scrollX, window.scrollY ];
			}
		}
		$(window).bind('scroll', saveScrolling);
		setState(History.getState());
		History.Adapter.bind(window, 'statechange', function() {
			setState(History.getState());
		});
		function linkClicked(e) {
			var data = { viewId: $(this).attr('href') };
			var url = $(this).attr('href');
			History.pushState(data, null, url);
			setState({ data: data, url: url });
			window.scrollTo(0, 0);
		}
		$('a[href^="?"]').live('click', function(e) {
			spawn linkClicked.call(this, e);
			return false;
		});
	})();

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
		var titleBase = manager.activeView.getTitleBar() + '@' + me.username + ' - ' + APP_NAME;
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
	var updateUnseenDelayedInvoker = new RateLimitedInvoker(updateUnseen, 100);
	$(window).bind('scroll', function() {
		updateUnseenDelayedInvoker.invoke();
	});
	manager.activeView.calculatePositionTable();
	updateUnseen();
	setInterval(function() {
		manager.activeView.calculatePositionTable();
		updateUnseen();
	}, 1500);

}

function EventEmitter() {
	var that = {};
	var list = {};
	that.on = function(name, fn) {
		var c = list[name] || (list[name] = []);
		list[name].push(fn);
	};
	that.emit = function(name) {
		var a = _.toArray(arguments).slice(1);
		if (list[name]) {
			for (var i = 0; i < list[name].length; i ++) {
				spawn list[name][i].apply(that, a);
			}
		}
	};
	return that;
}

var unimplemented = function() { throw new Error('Unimplemented!'); };

function View(view) {
	var that = {};
	that.view = view;
	that.list = {};
	var rendered = false;
	that.render = function() {
	};
	that.renderTo = function(el) {
		if (!rendered) {
			that.render();
			rendered = true;
		}
		that.view.el.appendTo(el);
		return that;
	};
	return that;
}

function ViewManager() {
	var that = {};
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

function Comment(json) {
	var that = {};
	that.created = new Date(json.created_time * 1000);
	that.text = json.text;
	that.from = UserFactory.fromJSON(json.from);
	that.id = json.id;
	that.isMention = function() {
		var mentions = that.text.match(/@\w+/g);
		if (!mentions) return false;
		for (var i = 0; i < mentions.length; i ++) {
			if (mentions[i].toLowerCase() == '@' + me.username.toLowerCase()) {
				return true;
			}
		}
		return false;
	};
	return that;
}

function Collection() {
	var that = new EventEmitter();
	that.list = [];
	that.prepend = function() {
		if (arguments.length == 0) return;
		that.list.unshift.apply(that.list, arguments);
		that.emit('prepend', _.toArray(arguments));
		that.emit('change');
	};
	that.append = function() {
		if (arguments.length == 0) return;
		that.list.push.apply(that.list, arguments);
		that.emit('append', _.toArray(arguments));
		that.emit('change');
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
			that.emit('remove', toRemove);
		}
		that.append.apply(that.append, addition);
		if (toRemove.length > 0 && addition.length == 0) {
			that.emit('change');
		}
	};
	return that;
}

function Media(id) {
	var that = new EventEmitter();
	that.id = id;
	that.likes = new ResponseCollection();
	that.comments = new ResponseCollection();
	that.load = function(json) {
		var user = UserFactory.fromJSON(json.user);
		that.user = user;
		that.likes.merge(json.likes, function(c) {
			return UserFactory.fromJSON(c);
		});
		that.location = json.location;
		var comments = { count: 0, data: [] };
		if (json.comments != null) {
			comments.count = json.comments.count;
			comments.data = json.comments.data.slice();
		}
		if (json.caption) {
			comments.data.unshift(json.caption);
		}
		that.comments.merge(comments, function(c) {
			return new Comment(c);
		});
		that.created = new Date(json.created_time * 1000);
		that.link    = json.link;
		that.images  = json.images;

		that.setLiked(!!json.user_has_liked);
		return that;
	};
	that.setLiked = function(liked) {
		if (liked != that.liked) {
			that.liked = liked;
			that.emit('likeChanged');
		}
	};
	that.toggleLike = function() {
		try {
			that.emit('startLike');
			var target = !that.liked;
			var res = (target ? post : del)(api_url(CORS_BASE + '/media/' + that.id + '/likes/'));
			if (res.meta && res.meta.code == 200) {
				that.setLiked(target);
			}
			return target;
		} finally {
			that.emit('finishLike');
		}
	};
	that.comment = function(text) {
		var res = post(api_url(CORS_BASE + '/media/' + that.id + '/comments'), 'text=' + encodeURIComponent(text));
		if (res.meta && res.meta.code == 200) {
			that.comments.append(new Comment(res.data));
		} else {
			throw up(res);
		}
	};
	that.reload = function() {
		try {
			that.emit('startReload');
			var media = api(API_BASE + '/media/' + that.id + '?now=' + new Date().getTime());
			that.load(media.data);
		} finally {
			that.emit('finishReload');
		}
	};
	return that;
}

function User(id) {
	var that = {};
	var data;
	that.id = id;
	that.load = function(json) {
		data = json;
		that.username = data.username;
		that.fullName = data.full_name;
		that.profilePicture = data.profile_picture;
		return that;
	};
	return that;
}

function Factory() {
	var that = {};
	that.map = {};
	that.has = function(id) {
		var key = 'id_' + id;
		return !!that.map[key];
	};
	that.get = function(id) {
		var key = 'id_' + id;
		return that.map[key] || (that.map[key] = that.create(id));
	};
	that.fromJSON = function(json) {
		return that.get(json.id).load(json);
	};
	that.create = unimplemented;
	return that;
}

var MediaFactory = new Factory();
MediaFactory.create = function(id) {
	return new Media(id);
};

var UserFactory = new Factory();
UserFactory.create = function(id) {
	return new User(id);
};

function Feed() {
	var that = new Collection();
	var map = {};
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
			that.emit('startLoading');
			var list = that.loader.loadNext();
			var addition = getNewMedia(list);
			if (addition.length > 0) {
				that.append.apply(that.append, addition);
			}
			return addition.length;
		} finally {
			that.emit('finishLoading');
		}
	};
	that.hasNext = function() {
		return that.loader.hasNext();
	};
	that.refresh = function() {
		try {
			that.emit('startRefreshing');
			var list = that.loader.refresh();
			var addition = getNewMedia(list);
			if (addition.length > 0) {
				that.prepend.apply(that.prepend, addition);
			}
		} finally {
			that.emit('finishRefreshing');
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
		return '[user: ' + user.username + '] ';
	};
	that.userInfo = null;
	that.user = null;
	function loadUserInfo() {
		var res = api(API_BASE + '/users/' + uid);
		var user = UserFactory.fromJSON(res.data);
		that.userInfo = res.data;
		that.user = user;
		that.emit('userInfoLoaded');
	}
	that.userInfoStratum = spawn loadUserInfo();
	return that;
}

var Fx = {

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

function TopLevelView(el) {

	var that = new View(el);
	
	that.active = false;
	that.activate = function() {
		that.active = true;
		that.view.el.removeClass('hidden-view');
	};
	that.deactivate = function() {
		that.active = false;
		that.view.el.addClass('hidden-view');
	};

	return that;

}

function FeedView(feed) {

	var that = new TopLevelView($('#feed').tpl());
	
	that.feed = feed;
	that.view.el.iconify();
	that.view.title.text(feed.title);

	that.getTitleBar = function() {
		return that.feed.getTitleBar();
	};
	that.add = function(view) {
		view.renderTo(that.view.contents);
		view.setParentView(that);
	};
	that.fadeHeader = function() {
		return Fx.fadeOutAndShow([that.view.head[0], document.getElementById('head')]);
	};
	that.fadeFooter = function() {
		return Fx.fadeOutAndShow([that.view.footer[0]]);
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
		userInfoView.renderTo(that.view.userInfo);
		that.view.userInfo.slideDown('slow');
	}
	that.view.userInfo.hide();

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

	that.feed.on('startLoading', function() {
		that.view.loading.show();
		that.view.loadMore.hide();
	});
	that.feed.on('finishLoading', function() {
		that.view.loading.hide();
		if (that.feed.hasNext()) {
			that.view.loadMore.show();
		}
	});
	that.view.loadMore.hide();

	spawn function() {
		var waiter = new ClickWaiter(that.view.loadMore);
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
					if (that.active && count < 3 && window.scrollY + window.innerHeight > document.body.offsetHeight - 150) {
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

	var refreshing = false;
	that.feed.on('startRefreshing', function() {
		refreshing = true;
		that.view.refresh.addClass('dim');
	});
	that.feed.on('finishRefreshing', function() {
		refreshing = false;
		that.view.refresh.removeClass('dim');
	});
	that.view.refresh.click(function() {
		if (!refreshing) {
			that.feed.refresh();
		}
	});



	
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
		while (l <= r) {
			var m = Math.floor((l + r) / 2);
			if (posTable[m] < window.scrollY) {
				if (m + 1 > max || window.scrollY <= posTable[m + 1]) {
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


	// view switching
	
	spawn function() {
		var modes = [
			function() { return new MediaListView(that.feed); },
			function() { return new MediaGridView(that.feed); }
		];
		var views = {};
		var currentMode = 0;
		var waiter = new ClickWaiter(that.view.switchView);
		for (;;) {
			activeView = views[currentMode];
			if (!activeView) {
				activeView = views[currentMode] = modes[currentMode]();
				that.add(activeView);
			} else {
				activeView.view.el.show();
			}
			activeView.active = true;
			that.calculatePositionTable();
			waiter.wait();
			activeView.active = false;
			activeView.view.el.hide();
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
	that.setParentView = function(parentView) {
		that.parentView = parentView;
	};
	return that;

}

function MediaListView(feed) {

	var that = new MediaCollectionView($('#list-view').tpl(), feed);

	that.getItemElements = function() {
		return that.view.el.find('.image');
	};

	// appending and prepending media

	function showList(list) {
		var el = $('<div class="changeset"></div>');
		for (var i = 0; i < list.length; i ++) {
			var media = list[i];
			var view = new MediaView(media);
			view.renderTo(el);
		}
		return el;
	}

	that.view.el.append(showList(that.feed.list));
	that.feed.on('append', function(nextData) {
		var changeset = showList(nextData);
		if (!that.active) {
			that.view.el.append(changeset);
			return;
		}
		var show = that.parentView && that.parentView.fadeFooter && that.parentView.fadeFooter();
		that.view.el.append(changeset);
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
			that.view.el.prepend(changeset);
			return;
		}
		var el = that.view.el.find('.picture').eq(0);
		var show = that.parentView && that.parentView.fadeHeader && that.parentView.fadeHeader();
		var oldTop = el.offset().top;
		changeset.css('visibility', 'hidden');
		that.view.el.prepend(changeset);
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
		return that.view.el.find('.grid-item');
	};

	// appending and prepending media
	var list = [];
	var nextColumn = 0;
	function showList(list) {
		var el = $('<div class="changeset"></div>');
		for (var i = 0; i < list.length; i ++) {
			var view = new GridItemView(list[i]).renderTo(el);
			view.view.el.attr('data-column', nextColumn);
			nextColumn = (nextColumn + 1) % 4;
		}
		return el;
	}

	that.view.el.append(showList(that.feed.list));
	that.feed.on('append', function(nextData) {
		that.view.el.append(showList(nextData));
	});
	
	var markerElement = null;

	that.feed.on('prepend', function(newData) {
		var el = markerElement == null ? that.view.el.find('.grid-item').eq(0) : markerElement;
		var oldTop = el.find('.image').offset().top;
		that.view.el.prepend(showList(newData));
		nextColumn = 0;
		that.view.el.find('.grid-item').each(function() {
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
							if (window.scrollY < el.offset().top - 150) {
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
	that.view.image.append(Fx.image(media.images.thumbnail.url));

	spawn function() {
		var waiter = new ClickWaiter(that.view.image);
		that.view.large.hide();
		waiter.wait();
		var mediaView = new MediaView(media);
		mediaView.renderTo(that.view.info);
		that.view.large.show();
		mediaView.view.leftSide.hide();
		for (;;) {
			that.view.el.addClass('active');
			mediaView.view.leftSide.fadeIn();
			Fx.slideDown(that.view.large[0], 500);
			waiter.wait();
			mediaView.view.leftSide.fadeOut();
			that.view.el.removeClass('active');
			Fx.slideUp(that.view.large[0], 500);
			waiter.wait();
		}
	}();

	return that;

}

function CollectionView(collection) {
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
			return a.item.created.getTime() - b.item.created.getTime();
		};
		all.sort(comparator);
		next.sort(comparator);
		display = next;
		for (var i = 0; i < all.length; i ++) {
			var c = all[i];
			if (!nextMap[c.id]) {
				that.view.el.append(c.el);
				if (animationEnabled) {
					spawn Fx.slideUp(c.el[0], null, true);
				} else {
					c.el.remove();
				}
			} else if (!prevMap[c.id]) {
				c.el = $('<div class="collectionview-item"></div>');
				c.view = that.createView(c.item);
				c.view.renderTo(c.el);
				that.view.el.append(c.el);
				if (animationEnabled) {
					spawn Fx.slideDown(c.el[0]);
				}
			} else {
				that.view.el.append(c.el);
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
	that.view.pointer.each(function() {
		var paper = Raphael(this, 12, 12);
		paper.path('M 14 -1 M 10.5 -1 l 0 2 l -5 5 l 5 5 l 0 2 L 14 13')
			.attr({ 'stroke': '#454443', 'fill': '#090807' });
	});
	that.view.user.html(user_html(me));
	that.view.el.hide();

	var showing = false;
	that.hide = function() {
		if (!showing) return;
		showing = false;
		that.view.el.hide('fast');
	};
	that.show = function() {
		if (showing) return;
		showing = true;
		that.view.el.show('fast');
		that.view.textarea[0].focus();
	};
	that.toggle = function() {
		if (showing) {
			that.hide();
		} else {
			that.show();
		}
	};
	that.events = new EventEmitter();

	that.view.textarea.keydown(function(e) {
		if (e.keyCode == 13) {
			that.events.emit('enter');
			return false;
		}
	});
	that.getText = function() {
		return that.view.textarea[0].value;
	};
	that.disable = function() {
		that.view.textarea[0].disabled = true;
		that.view.el.addClass('dim');
	};
	that.enable = function() {
		that.view.textarea[0].disabled = false;
		that.view.el.removeClass('dim');
	};
	return that;

}

function MediaView(media) {

	var that = new View($('#picture').tpl());
	var view = that.view;


	// user

	view.user.html(user_html(media.user));
	view.picture.append('<a href="' + user_url(media.user) + '"><img src="' + media.user.profilePicture + '" alt=""></a>');
	view.date.html('<a href="' + media.link + '">' + formatDate(media.created) + '</a>');


	// image
	
	var lowResImage = Fx.image(media.images.low_resolution.url).appendTo(view.image);

	view.image.click(function() {
		view.el.toggleClass('zoomed');
	});

	spawn function() {
		waitfor() {
			view.image.one('click', resume);
		}
		lowResImage[0].className = 'dim';
		Fx.image(media.images.standard_resolution.url).appendTo(view.image);
	}();


	// geotag
	
	if (media.location) {
		var place = media.location.latitude + ', ' + media.location.longitude;
		var placeName = place;
		if (media.location.name) placeName = media.location.name;
		view.geo.html('<a href="http://maps.google.com/?q=' + encodeURIComponent(place) + '">' + placeName + '</a>');
	} else {
		view.geoContainer.hide();
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

	var commentsView = new CollectionView(media.comments);
	commentsView.createView = function(comment) {
		var commentView = new View($('#comment').tpl());
		if (comment.isMention()) {
			commentView.view.el.addClass('comment-mention');
		}
		commentView.view.user.html(user_html(comment.from));
		commentView.view.text.text(comment.text);
		commentView.view.text.html(emoji.convert(format(commentView.view.text.html())));
		commentView.view.date.html(formatDate(comment.created));
		return commentView;
	};
	function updateCommentCount() {
		view.commentCount.text(media.comments.count);
	}
	commentsView.renderTo(view.rows);
	updateCommentCount();
	media.comments.on('change', updateCommentCount);
	var addCommentView = null;
	view.commentIcon.click(function() {
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
			addCommentView.renderTo(view.addComment);
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
		view.likes.html(html);
		view.likeCount.text(media.likes.count);
	}
	showLikes();
	view.el.iconify();
	media.likes.on('change', showLikes);

	function updateLike() {
		view.likeIcon.data('icon').attr('fill', media.liked ? '#ffff99' : '#8b8685');
	}
	media.on('likeChanged', updateLike);
	updateLike();

	media.on('startLike', function() { view.likeIcon.addClass('dim'); });
	media.on('finishLike', function() { view.likeIcon.removeClass('dim'); });
	media.on('startReload', function() { view.right.addClass('dim'); });
	media.on('finishReload', function() { view.right.removeClass('dim'); });
	view.likeIcon.click(function() {
		var target = media.toggleLike();
		media.reload();
		media.setLiked(target);
	});

	return that;

}

function UserInfoView(userInfo, user) {
	var that = new View($('#user-info').tpl());
	that.view.picture.append('<img src="' + user.profilePicture + '" alt="">');
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
	return '?u=' + user.username;
}
function user_html(user) {
	return '<a href="' + user_url(user) + '" class="username" data-username="' + user.username + '" data-uid="' + user.id + '">' + user.username + '</a>';
}

function authenticationNeeded() {
	LoadingStuff.finish();
	var callbackURL = location.protocol + '//' + location.host + location.pathname.replace(/[^\/]*$/, '') + 'callback.html';
	var redirectURL = 'https://instagram.com/oauth/authorize/?client_id=' + CLIENT_ID + '&redirect_uri=' + encodeURIComponent(callbackURL) + '&response_type=token&scope=likes+comments+relationships';
	$('#auth-needed').tpl().el.appendTo('#main');
	location.replace(redirectURL);
}

$(main);
