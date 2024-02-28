
const round = (f, d) => Math.round(f * (10 ** d)) / 10 ** d;

export const regionSamples = (coords, samples) => {
	return samples.filter(entry => {
		const [x, y] = [entry.long, entry.lat];
		return range(0, coords.length).reduce((a, i) => {
			const j = i === coords.length - 1 ? 0 : i + 1;
			const [xi, yi] = coords[i];
			const [xj, yj] = coords[j];
			return ((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi) ? !a : a;
	    	}, false);
	});
};

const processEntry = entry => {
	for (const prop in entry) {
		switch(prop) {
			case 'date':
				entry[prop] = entry[prop] + 'ya';
				break;
			case 'coverage':
				entry[prop] = Math.round(1e4 * entry[prop]) / 1e4;
				break;
			case 'study':
				entry[prop] = `<a data-action="pubmed-lookup" data-term="${entry[prop]}">${entry[prop]}</a>`;
				break;
		}
	}
	return entry;
};

const hooks = [
	['[data-info]', 'click', e => {
		if (e.target.closest('.map.draw-region'))
			return;
		const entry = JSON.parse(e.target.dataset.info);
		const processed_entry = processEntry(entry);
		const html = `<h5>${processed_entry.sample_id}</h5>${Object.entries(processed_entry).map(([prop, value]) => `<div class="data-field"><div class="label">${prop}</div><div class="data">${value}</div></div>`).join('')}<div class="data-field"><div class="label">BAM files</div><div class="data"><a data-action="bam-lookup" data-id="${processed_entry.bed_id.replace(/\.[^\.]+$/, '')}">Search EBI</a></div></div>`;
		const infobox = e.target.closest('.map').querySelector('.info');
		infobox.classList.add('show');
		infobox.innerHTML = html;
		infobox.style.left = (e.offsetX + 5) + 'px';
		infobox.style.top = (e.offsetY + 5) + 'px';
		const id = e.target.dataset.id;
		//document.querySelectorAll(`.structure [data-id]`).forEach(item => item.classList.remove('selected'));
		//document.querySelectorAll(`.structure [data-id="${id}"]`).forEach(item => item.classList.add('selected'));
	}],
	['[data-region]', 'dblclick', async e => {
		const region = e.target;
		const label = region.dataset.label;
		const region_id = region.dataset.region;
		const current_regions = getOptions().regions;
		const callback = form => async e => {
			if (!form)
				return;
			const data = readForm(form.querySelector('[data-tab-content].selected'));
			switch(form.querySelector('[data-tab-content].selected').dataset.tabContent) {
				case 'attributes':
					current_regions[region_id].label = data.label;
					region.dataset.label = data.label;
					break;
				case 'samples':
					current_regions[region_id].excluded = data.excluded_samples;
					break;
			}
			getOptions([['regions', current_regions]]);
			form.remove();
		};
		const origin = JSON.parse(document.querySelector('.map').dataset.origin);
		const loaded_samples = await import('/assets.js').then(assets => assets.loadedSamples(false, getOptions(), origin));
		const coords = region.getAttribute('points').split(' ').map(v => coordsFromPos(v.split(',').map(v => +(v)), origin));
		const samples = regionSamples(coords, loaded_samples);
		addPopup(e.target.closest('.map-container'), 'Edit region', [{name: 'attributes', label: 'Attributes', content: `<div class="field"><label>Label</label><input type="text" name="label" placeholder="Label" value="${label}"></div><a data-action="submit">Save</a>`}, {name: 'samples', label: 'Samples', content: `<div class="field"><label>Exclude samples</label><select name="excluded_samples" style="height: 200px;" multiple="multiple">${samples.sort((a,b) => a.sample_id.localeCompare(b.sample_id)).map(sample => `<option value="${sample.bed_id}"${current_regions[region_id].excluded && current_regions[region_id].excluded.includes(sample.bed_id) ? ' selected="selected"' : ''}>${sample.bed_id} (${sample.date}ya)</option>`).join('')}</select></div><a data-action="submit">Save</a>`}], callback);
	}],
	['[data-region]', 'click', e => {
		e.target.classList.toggle('selected');
	}]
];

export const init = (layer, type, options) => {
	addHooks(layer, hooks);
	if (getOptions().debug === 'on') {
		let timeout = 0;
		let loaded_samples = [];
		window.addEventListener('mousemove', e => {
			if (!e.target.matches('.map, .map *') || e.target.matches('.menu'))
				return;
			clearTimeout(timeout);
			timeout = setTimeout(async () => {
				if (loaded_samples.length === 0)
					loaded_samples = await import('/assets.js').then(assets => assets.loadedSamples(false, getOptions()));
				const origin = JSON.parse(document.querySelector('.map').dataset.corners);
				const coords = [[e.offsetX - 10, e.offsetY - 10], [e.offsetX + 10, e.offsetY - 10], [e.offsetX + 20, e.offsetY + 20], [e.offsetX - 20, e.offsetY + 20]].map(v => coordsFromPos(v, origin));
				const samples = regionSamples(coords, loaded_samples);
				console.log(samples.map(sample => sample.sample_id));
			}, 1000);
		});
	}
};

const normed = (column_values) => {
	const values = column_values.map(value => Array.isArray(value) ? value.map((v,i) => [i.toString(), v]).sort((a,b) => b[1]-a[1])[0][0] : value); // for admixture, choose highest ancestry component
	const filled_values = values.filter(value => value !== undefined);
	const min = Math.min.apply(null, filled_values);
	const max = Math.max.apply(null, filled_values);
	return [values.map(v => typeof v !== 'number' ? v : (v - min) / (max - min)), [min, max]];
};

const getSampleValues = async (metadata, property) => {
	switch(true) {
		case metadata[0][property] !== undefined: {
			const col_data = metadata.map(sample => sample[property]);
			return normed(col_data);
		}
		default: {
			const col_data = await import('/assets.js').then(assets => assets.loadCol(property, metadata));
			return normed(col_data);
		}
	}
};

export const refresh = async (layer, type, options) => {
	const property = document.querySelector('.data-overlays .select a.selected')?.dataset.property || 'coverage';
	const origin = JSON.parse(document.querySelector('.map').dataset.origin);
	const metadata = await import('/assets.js').then(assets => assets.loadedSamples(false, options, origin));
	const plot = await import('/plot.js');
	plot.draw.svg.clear(layer);
	const [values, values_range] = metadata.length === 0 ? [[], [0, 1]] : await getSampleValues(metadata, property);
	const discrete = typeof values.filter(value => value !== undefined)[0] === 'string';
	if (discrete)
		document.querySelector('.data-overlays .colorbar-scale').style.background = `linear-gradient(to right, ${
			Array.from({length: (values_range[1] + 1)}, (_, i) => {
				const color = `rgb(${color_cycle[i % color_cycle.length].join(',')})`;
				const start = (i / (values_range[1] + 1)) * 100;
				const end = i < (values_range[1] + 1) - 1 ? ((i + 1) / (values_range[1] + 1) - 0.01) * 100 : 100;
				return `${color} ${start}%, ${color} ${end}%`;
			}).join(', ')
		})`;
	else
		document.querySelector('.data-overlays .colorbar-scale').style.background = `linear-gradient(to right, rgb(130, 255, 0), rgb(130, 0, 255))`;
	document.querySelector('.data-overlays .colorbar .x-min').innerText = round(values_range[0], 2);
	document.querySelector('.data-overlays .colorbar .x-max').innerText = round(values_range[1], 2);
	for (const entry_i in metadata) {
		const entry = metadata[entry_i];
		const color = values[entry_i] === undefined ? [200, 200, 200] : (discrete ? color_cycle[values[entry_i]] : [130, 255 * (1 - values[entry_i]), 255 * values[entry_i]]);
		const opacity = values[entry_i] === undefined ? 0.1 : 0.8;
		plot.drawIndividualMap(layer, [entry.long, entry.lat], origin, color, opacity, JSON.stringify(entry), entry.sample_id);
	}
};

export const zoom = async (layer, type, options) => {
	return false; // Zoom to coords
};
