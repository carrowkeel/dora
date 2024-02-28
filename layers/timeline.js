
const hooks = [
];

export const init = (layer, type, options) => {
	addHooks(layer, hooks);
};

export const refresh = async (layer, type, options, coords) => {
	const bin_size = options.step ? +(options.step) : 1000;
	const year_range = getOptions().year_range;
	const bins = linspace(...year_range, Math.round(year_range[1] / bin_size) + 1);
	const entries = await import('/assets.js').then(assets => assets.loadedSamples(false, {years: year_range}, coords));
	const y_values = new Float32Array(bins.length);
	for (const entry of entries)
		y_values[Math.floor((entry.date - year_range[0]) / bin_size)] += 1;
	const y_max = Math.ceil(Math.max.apply(null, y_values) / 100) * 100;
	const y_values_log = y_values.map(y => y > 0 ? Math.log2(y) : 0);
	const y_max_log = Math.ceil(Math.max.apply(null, y_values_log));
	document.querySelector('.timeline-plot .axis-tick.xmin').innerHTML = `${Math.round(year_range[0] / 1000)} kya`;
	document.querySelector('.timeline-plot .axis-tick.xmax').innerHTML = `${Math.round(year_range[1] / 1000)} kya`;
	document.querySelector('.timeline-plot .ymax').innerHTML = 2**y_max_log;
	const draw = await import('/plot.js').then(plot => plot.draw);
	draw.svg.clear(layer);
	for (const i in bins)
		draw.svg.bar(layer, bins[i], y_values_log[i], bin_size, [year_range, [0, y_max_log]], [241, 185, 148]);
		//draw.svg.bar(layer, bins[i], y_values[i], bin_size, [year_range, [0, y_max]], color_cycle[3]);
	const selector = document.querySelector('.panels .selector');
	selector.classList.add('show');
	selector.style.left = layer.dataset.width * (options.years[0] - year_range[0]) / (year_range[1] - year_range[0]) + 'px';
	selector.style.width = layer.dataset.width * (options.years[1] - options.years[0]) / (year_range[1] - year_range[0]) + 'px';
	selector.querySelector('.slider.left').innerHTML = options.years[0];
	selector.querySelector('.slider.right').innerHTML = options.years[1];
	return true;
};

export const zoom = async (layer, type, options, coords) => {
	return refresh(layer, type, options, coords);
};
