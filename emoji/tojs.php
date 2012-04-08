<?php

eval('?>' . file_get_contents(file_exists('emoji.php') ? 'emoji.php' : 'https://raw.github.com/iamcal/php-emoji/master/emoji.php'));

$ecode = array();
foreach ($emoji_maps['unified_to_html'] as $k => $v) {
	if (preg_match('~emoji([0-9a-f]+)~', $v, $m)) {
		$ecode[$k] = $m[1];
	}
}

class Emoji {
	public $mapping = array();
	public $position;
}

$emojis = array();

function getEmoji($id) {
	global $emojis;
	if (!isset($emojis[$id])) {
		$emojis[$id] = new Emoji();
	}
	return $emojis[$id];
}

foreach (array('docomo_to_unified', 'kddi_to_unified', 'softbank_to_unified', 'google_to_unified') as $type) {
	foreach ($emoji_maps[$type] as $k => $v) {
		getEmoji($ecode[$v])->mapping[] = $k;
	}
}
foreach ($emoji_maps['unified_to_html'] as $k => $v) {
	getEmoji($ecode[$k])->mapping[] = $k;
}

preg_match_all('~\.emoji(\S+) \{ background-position: 0px -(\d+)~', file_get_contents(file_exists('emoji.css') ? 'emoji.css' : 'https://raw.github.com/iamcal/php-emoji/master/emoji.css'), $m, PREG_SET_ORDER);
foreach ($m as $v) {
	getEmoji($v[1])->position = $v[2];
}

$jss = array();
foreach ($emojis as $k => $v) {
	if (count($v->mapping) > 0 && !empty($v->position)) {
		$jss[] = json_encode('' . $k) . ': ' . json_encode(array($v->position, $v->mapping));
	}
}

$js = 'emoji.register({' . "\n\t" . implode(",\n\t", $jss) . "\n});\n";
echo $js;
file_put_contents('emoji.data.js', $js);



