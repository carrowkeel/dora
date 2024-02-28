
const posFromCoords = (coords, corners) => {
	const map = document.querySelector('.map');
	const map_dims = [+(map.offsetWidth), +(map.offsetHeight)];
	const map_corners = corners || JSON.parse(map.dataset.corners);
	return [
		((coords[0] - map_corners[0][0]) / (map_corners[1][0] - map_corners[0][0])) * map_dims[0],
		((coords[1] - map_corners[0][1]) / (map_corners[1][1] - map_corners[0][1])) * map_dims[1]
	];
};

const coordsFromPos = (pos, corners) => {
	const map = document.querySelector('.map');
	const map_dims = JSON.parse(map.dataset.dims);
	const map_corners = corners || JSON.parse(map.dataset.corners);
	return [
		map_corners[0][0] + (pos[0] / map_dims[0]) * (map_corners[1][0] - map_corners[0][0]),
		map_corners[0][1] + (pos[1] / map_dims[1]) * (map_corners[1][1] - map_corners[0][1])
	];
};

const zoomToCoords = (layer, _coords) => {
	const map = document.querySelector('.map');
	const coords = _coords.map(v => v.map(Math.round));
	const dims = JSON.parse(map.dataset.dims);
	const map_coords = JSON.parse(map.dataset.origin);
	map.dataset.corners = JSON.stringify(coords);
	const map_offset = coords.map(coord => posFromCoords(coord, map_coords));
	const scale = (map_offset[1][0] - map_offset[0][0]) / dims[0];
	map.dataset.zoom = 1 / scale;
	map.dataset.offset = JSON.stringify([map_offset[0][0], map_offset[0][1]]);
	layer.setAttribute('viewBox', [map_offset[0][0], map_offset[0][1], map_offset[1][0] - map_offset[0][0], map_offset[1][1] - map_offset[0][1]].join(' '));
	layer.style.setProperty('--scale', Math.max(0.1, scale));
};

const hooks = [
	['[data-layer]', 'refresh', async e => {
		const type = e.target.dataset.type;
		const options = {years: JSON.parse(document.querySelector('.map').dataset.years), step: getOptions().step};
		const layer = await import(`./layers/${type}.js`);
		await layer.refresh(e.target, e.target.dataset.data, options);
		e.target.dispatchEvent(new Event('refreshed'));
	}],
	['[data-layer]', 'zoom', async e => {
		const coords = e.detail.coords;
		const type = e.target.dataset.type;
		const options = {years: JSON.parse(document.querySelector('.map').dataset.years), step: getOptions().step};
		const layer = await import(`./layers/${type}.js`);
		if (!(await layer.zoom(e.target, e.target.dataset.data, options, coords)))
			return zoomToCoords(e.target, coords);
	}]
];

const addLayerMenu = (label, selector, type, icon) => {
	const layers_menu = document.querySelector('.main-menu .layers');
	const link_elem = document.createElement('a');
	link_elem.dataset.selector = selector;
	link_elem.innerText = label;
	link_elem.dataset.label = label;
	link_elem.dataset.type = type;
	link_elem.dataset.icon = icon;
	layers_menu.insertBefore(link_elem, layers_menu.querySelector('[data-action="add-dataset"]'));
};

const addLayer = async (container, name, label, type, data, icon='a', aspect_ratio=2, draw_type='svg') => {
	if (label)
		addLayerMenu(label, name, type, icon);
	if (container) {
		const elem = await import('./plot.js').then(plot => plot.loadDrawingArea(container, draw_type, aspect_ratio));
		elem.dataset.layer = name.split(' ')[0];
		elem.dataset.type = type;
		elem.dataset.data = data;
		addHooks(elem, hooks);
		const options = {years: JSON.parse(document.querySelector('.map').dataset.years), step: getOptions().step};
		const layer = await import(`./layers/${type}.js`);
		await layer.init(elem, data, options);
		return elem;
	}
};

export { addLayer, addLayerMenu }
