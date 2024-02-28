
export const init = (layer, identifier, options) => {
	return refresh(layer, identifier, options);
};


export const refresh = async (layer, label, options, coords) => {
	const origin = JSON.parse(document.querySelector('.map').dataset.origin);
	const metadata = await import('/assets.js').then(assets => assets.loadedSamples(true, options, coords));
	const admixture_samples = metadata.filter(sample => sample[label]);
	const sorted_metadata = admixture_samples.sort((a,b) => a.long - b.long);
	const plot = await import('/plot.js');
	plot.draw.svg.clear(layer);
	const col_width = +(layer.dataset.width) / sorted_metadata.length;
	const svg_height = +(layer.dataset.height);
	for (const sample_index in sorted_metadata) {
		const sample = sorted_metadata[sample_index];
		for (const proportion_index in sample[label]) {
			const [x, y] = [sample_index * col_width, sample[label].slice(0, proportion_index).reduce((a,v) => a+v, 0) * svg_height];
			const [width, height] = [col_width, sample[label][proportion_index] * svg_height];
			plot.draw.svg.rect(layer, x, y, width, height, color_cycle[proportion_index], 1, {'data-id': sample.bed_id});
		}
	}
	return true;
};

export const zoom = async (layer, label, options, coords) => {
	return refresh(layer, label, options, coords);
};
