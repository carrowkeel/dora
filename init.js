'use strict';

const color_cycle = [
	[31,119,180],
	[255,127,14],
	[44,160,44],
	[214,39,40],
	[148,103,189],
	[140,86,75],
	[227,119,194],
	[127,127,127],
	[188,189,34],
	[23,190,207],
	[60,119,180],
	[255,167,14],
	[44,160,74],
	[244,39,40],
	[148,143,189],
	[140,86,115],
	[255,119,194],
	[127,170,127],
	[188,189,70],
	[70,190,207]
];

const range = (start, end, step=1) => Array.from(Array(Math.floor((end-start)/step))).map((v,i)=>start + i * step);
const linspace = (start, end, n) => Array.from(Array(n)).map((v,i)=>start + i * ((end - start) / (n - 1)));
const max = arr => arr.map((v,i) => [v, i]).sort((a,b) => b[0]-a[0])[0][1];
const mean = arr => arr.reduce((a,v) => a+v, 0) / arr.length;

const coordsFromPos = (pos, corners) => {
	const map = document.querySelector('.map');
	const map_dims = JSON.parse(map.dataset.dims);
	const map_corners = corners || JSON.parse(map.dataset.corners);
	return [
		map_corners[0][0] + (pos[0] / map_dims[0]) * (map_corners[1][0] - map_corners[0][0]),
		map_corners[0][1] + (pos[1] / map_dims[1]) * (map_corners[1][1] - map_corners[0][1])
	];
};

const posFromCoords = (coords, corners) => {
	const map = document.querySelector('.map');
	const map_dims = [+(map.offsetWidth), +(map.offsetHeight)];
	const map_corners = corners || JSON.parse(map.dataset.corners);
	return [
		((coords[0] - map_corners[0][0]) / (map_corners[1][0] - map_corners[0][0])) * map_dims[0],
		((coords[1] - map_corners[0][1]) / (map_corners[1][1] - map_corners[0][1])) * map_dims[1]
	];
};

const parseJSON = (json_string, defaults={}) => {
	try {
		if (json_string === null)
			throw 'Empty JSON string';
		return JSON.parse(json_string);
	} catch (e) {
		return defaults;
	}
};

const errorBox = (title, text) => {
	const box = document.createElement('div');
	box.classList.add('plot');
	box.innerHTML = `<div class="header"><a data-icon="x" data-action="close" class="right"></a>${title}</div><div class="text"><p>${text}</p></div>`;
	document.querySelector('.map-container').appendChild(box);
	return box;
};

const formError = (form, error, timeout=5000) => {
	const error_elem = document.createElement('div');
	error_elem.classList.add('error');
	error_elem.innerHTML = error;
	form.querySelector('.errors').appendChild(error_elem);
	setTimeout(() => error_elem.remove(), timeout);
};

const readForm = (form, defaults = {}) => {
	if (!form)
		return defaults;
	const args = {};
	Array.from(form.querySelectorAll('[name]')).filter(item => item.closest('.form, [data-tab-content]') === form).forEach(item => {
		const name = item.getAttribute('name');
		const value = item.dataset.value || item.value;
		if (item.getAttribute('type') === 'checkbox')
			return item.checked ? Object.assign(args, {[name]: args[name] ? args[name].concat(value) : [value]}) : 0;
		if (item.tagName === 'SELECT' && item.getAttribute('multiple'))
			return Object.assign(args, {[name]: Array.from(item.children).filter(option => option.selected).map(option => option.value)});
		switch(item.dataset.type) {
			case 'json':
				Object.assign(args, {[name]: JSON.parse(value)});
				break;
			case 'vector':
				Object.assign(args, {[name]: value.split(',').map(v => +(v))});
				break;
			default:
				Object.assign(args, {[name]: value});
		}
	});
	Array.from(form.querySelectorAll('[data-entry]')).filter(item => item.parentElement.closest('.form, [data-tab-content]') === form).forEach(entry => {
		const name = entry.dataset.entry;
		const data = readForm(entry);
		if (data.name)
			Object.assign(args, {[name]: args[name] ? args[name].concat(data) : [data]});
	});
	return Object.assign(defaults, args);
};

const addPopup = (container, title, tabs, callback, duplicate=false) => {
	if (!duplicate && container.querySelector(`.popup[data-title="${title}"]`))
		return;
	const form = document.createElement('div');
	form.classList.add('popup', 'form', 'tabbed-content');
	form.dataset.title = title;
	const tabs_html = tabs.map(tab => `<a data-tab="${tab.name}" class="selected">${tab.label}</a>`).join('');
	const tab_content = tabs.map(tab => `<div data-tab-content="${tab.name}">${tab.content}</div>`).join('');
	form.innerHTML = `<div class="header"><a data-action="close" data-icon="x"></a><h3>${title}</h3></div><div class="cols"><div class="tabs">${tabs_html}</div>${tab_content}</div>`;
	container.append(form);
	form.addEventListener('click', e => {
		if (e.target.matches('[data-action="submit"]'))
			callback(form)(e);
		if (e.target.matches('[data-action="close"]'))
			callback(false)(e);
	});
	form.querySelector('[data-tab]').dispatchEvent(new Event('click'));
	return form;
};

const addHooks = (elem, hooks) => {
	for (const type of Object.keys(hooks.reduce((a,v)=>Object.assign(a, {[v[1]]: 1}), {}))) {
		elem.addEventListener(type, e => {
			for (const hook of hooks.filter(v=>v[1]===type)) {
				if (e.target.matches(hook[0]))
					hook[2](e);
			}
		}, true);
	}
};

const getOptions = (update=[], defaults={}, key_name='adna_options_v2') => {
	const json_options = parseJSON(localStorage.getItem(key_name), defaults);
	for (const [key, value] of update)
		json_options[key] = value;
	localStorage.setItem(key_name, JSON.stringify(json_options));
	return json_options;
};

const initServiceWorker = (uri) => new Promise((resolve, reject) => {
	if ('serviceWorker' in navigator) {
		return navigator.serviceWorker.register(uri, {scope: '/'}).then(reg => {
			if (!reg.waiting && !reg.active) {
				reg.addEventListener('updatefound', () => {
					reg.installing.addEventListener('statechange', e => {
						if (e.target.state === "activated") {
							resolve();
						}
					});
				});
			} else
				resolve();
		}).catch(e => {
			console.log('Failed to register sw.js: ' + e);
			reject();
		});
	} else
		return reject();
});

window.addEventListener('load', async () => {
	await initServiceWorker('/sw.js');
	const container = document.querySelector('.map');
	const defaults = {years: [1000, 4000], year_range: [0, 20000], step: 1000, scroll_zoom: 'off', variants: [{type: 'range', range: 'chr1:1-10000000'}]};
	const options = getOptions(undefined, defaults);
	import('./map.js').then(map => map.init(container, options));
});
