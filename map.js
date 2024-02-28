
const addRegions = async (layer_name, region_opacity = 0.5) => {
	const plot = await import('/plot.js');
	const layer = document.querySelector(`.map [data-layer="${layer_name}"]`);
	const current_regions = getOptions().regions || {};
	if (Object.keys(current_regions).length > 0 && document.querySelector('.map .tooltip-overlay'))
		document.querySelector('.map .tooltip-overlay').classList.add('disabled');
	for (const region_id in current_regions) {
		const region = current_regions[region_id];
		plot.draw.svg.polygon(layer, region.corners.map(corner => posFromCoords(corner)), region.color.split(',').concat(region_opacity), 1, {'data-region': region.region_id, 'data-corners': JSON.stringify(region.corners), 'data-region_i': region.region_i, 'data-label': region.label, 'data-color': region.color, stroke: `rgba(${region.color})`});
	}
};

const saveRegion = region_id => {
	const region_elem = document.querySelector(`.map [data-region="${region_id}"]`);
	const region = {corners: JSON.parse(region_elem.dataset.corners), region_id, region_i: region_elem.dataset.region_i, label: region_elem.dataset.label, color: region_elem.dataset.color, excluded: []};
	const current_regions = getOptions().regions || {};
	current_regions[region_id] = region;
	getOptions([['regions', current_regions]]);
};

const removeRegion = region_elem => {
	const current_regions = getOptions().regions || {};
	if (current_regions[region_elem.dataset.region])
		delete current_regions[region_elem.dataset.region];
	region_elem.remove();
	getOptions([['regions', current_regions]]);
};

const hooks = [
	['*', 'keyup', e => {
		if (e.target.matches('input') || (e.keyCode !== 8 && e.keyCode !== 46))
			return;
		e.preventDefault();
		const map = document.querySelector('.map');
		if (map.querySelector('[data-region].selected'))
			removeRegion(map.querySelector('[data-region].selected'));
	}],
	['[data-action="create-region"]', 'click', async e => {
		const region_opacity = 0.5; // Temp
		const map = document.querySelector('.map');
		if (map.classList.contains('draw-region'))
			return;
		e.stopPropagation();
		const layer = map.querySelector('[data-layer="samples"]');
		map.querySelector('.selector').classList.remove('show');
		map.classList.add('draw-region');
		if (map.querySelector('.tooltip-overlay'))
			map.querySelector('.tooltip-overlay').innerHTML = 'Left-click to draw the polygon points, right-click when finished';
		const region_ids = range(0, 20); // Max 20 regions
		const current_regions = Array.from(layer.querySelectorAll(`[data-region]`)).map(region => +(region.dataset.region_i));
		const region_id = Math.round(Math.random()*1e7);
		const region_i = region_ids.filter(i => !current_regions.includes(i))[0];
		const color = color_cycle[region_i]; // Allow also user-defined colors
		const plot = await import('/plot.js');
		const addPoint = (point, color) => {
			plot.draw.svg.circle(layer, ...point, 3, color, 1, {class: 'corner'});
		};
		const corners = [];
		const map_offset = JSON.parse(map.dataset.offset);
		const map_origin = JSON.parse(map.dataset.origin);
		const map_zoom = +(map.dataset.zoom);
		const point = e => {
			if (!e.target.matches('.map, .map *'))
				return;
			corners.push([map_offset[0] + e.offsetX / map_zoom, map_offset[1] + e.offsetY / map_zoom]);
			addPoint(corners[corners.length - 1], color);
			if (corners.length > 2) {
				if (layer.querySelector(`[data-region="${region_id}"]`)) {
					layer.querySelector(`[data-region="${region_id}"]`).setAttribute('points', corners.map(v => v.join(',')).join(' '));
					layer.querySelector(`[data-region="${region_id}"]`).dataset.corners = JSON.stringify(corners.map(corner => coordsFromPos(corner, map_origin)));
				} else {
					plot.draw.svg.polygon(layer, corners, color.concat(region_opacity), 1, {'data-region': region_id, 'data-corners': JSON.stringify(corners.map(corner => coordsFromPos(corner, map_origin))), 'data-region_i': region_i, 'data-label': `Region ${region_i}`, 'data-color': color, stroke: `rgba(${color.join(',')})`});
				}
			}
		};
		const disable = e => {
			if (!e.target.matches('.create-region') && e.button !== 2)
				return;
			window.removeEventListener('click', point);
			window.removeEventListener('mouseup', disable);
			map.querySelectorAll('svg .corner').forEach(corner => corner.remove());
			map.classList.remove('draw-region');
			if (map.querySelector('.tooltip-overlay')) {
				map.querySelector('.tooltip-overlay').innerHTML = 'Click to start analyses';
				map.querySelector('.tooltip-overlay').classList.add('disabled');
			}
			saveRegion(region_id);
		};
		window.addEventListener('click', point);
		window.addEventListener('mouseup', disable);
	}],
	['.map', 'update', e => {
		e.target.querySelector('.loading').classList.add('show');
		Promise.all(Array.from(document.querySelectorAll('[data-layer]')).map(layer => new Promise(resolve => { // There should be a higher level element that contains timeline
			layer.addEventListener('refreshed', resolve, {once: true});
			layer.dispatchEvent(new Event('refresh'));
		}))).then(() => {
			e.target.closest('.map').querySelector('.loading').classList.remove('show');
		});
	}],
	['.map, .map *', 'mousedown', e => {
		if (e.target.matches('.menu, .menu *, [data-info], [data-region], .info, .info *') || e.target.closest('.map.draw-region') || e.button !== 0)
			return;
		const map = e.target.closest('.map');
		map.querySelectorAll('.info, .menu').forEach(elem => elem.classList.remove('show'));
		map.classList.add('dragging');
		const map_corners = JSON.parse(map.dataset.corners);
		const scale = Math.min(360, (map_corners[1][0] - map_corners[0][0]));
		const map_center = [map_corners[0][0] + scale / 2, map_corners[0][1] - scale / 4];
		const current_pos = coordsFromPos([e.offsetX, e.offsetY]);
		const moveToPoint = e => {
			const new_pos = coordsFromPos([e.offsetX, e.offsetY]);
			const diff = [new_pos[0] - current_pos[0], new_pos[1] - current_pos[1]];
			if (Math.abs(diff[0]) < 0.1 && Math.abs(diff[1]) < 0.1)
				return;
			const map_corners = JSON.parse(map.dataset.corners);
			const scale = Math.min(360, (map_corners[1][0] - map_corners[0][0]));
			const zoomed_box = [Math.min(360, scale), Math.min(180, scale / 2)];
			const offset = [Math.max(-180, map_center[0] - scale / 2 - diff[0]), Math.min(90, map_center[1] + scale / 4 - diff[1])];
			const overflow = [Math.max(0, offset[0] + scale - 180), Math.max(0, -offset[1] + scale / 2 - 90)];
			const zoomed_coords = [
				[offset[0] - overflow[0], offset[1] + overflow[1]],
				[offset[0] - overflow[0] + scale, offset[1] + overflow[1] - scale / 2]
			];
			document.querySelectorAll('[data-layer]').forEach(layer => layer.dispatchEvent(new CustomEvent('zoom', {detail: {coords: zoomed_coords}})));
		};
		window.addEventListener('mouseup', (e) => {
			moveToPoint(e);
			map.classList.remove('dragging');
		}, {once: true});
	}],
	['.map, .map *', 'mousemove', e => {
		const tooltip = document.querySelector('.tooltip-overlay');
		if (!tooltip || tooltip.classList.contains('disabled'))
			return;
		if (tooltip.classList.contains('hidden'))
			clearTimeout(+(tooltip.dataset.timeout));
		else
			tooltip.classList.add('hidden');
		tooltip.dataset.timeout = setTimeout(() => tooltip.classList.remove('hidden'), 2000);
	}],
	['.map', 'menu', e => {
		const menu = document.querySelector('.map .menu');
		menu.classList.add('show');
		menu.innerHTML = e.detail.html;
		menu.style.left = (e.detail.x + 5) + 'px';
		menu.style.top = (e.detail.y + 5) + 'px';
	}],
	['.map, .map *', 'mouseup', e => {
		if (e.target.matches('.menu, .menu *, .info, .info *, [data-region]') || e.target.closest('.map.draw-region') || e.button !== 2)
			return;
		e.target.closest('.map').dispatchEvent(new CustomEvent('menu', {detail: {x: e.offsetX, y: e.offsetY, html: `<a data-action="create-region">Create region</a><a data-action="analyze">Analyze</a><a data-action="export">Export</a><a data-action="reset">Reset view</a>`}}));
	}],
	['.map, .map *', 'contextmenu', e => {
		e.preventDefault();
	}],
	['.menu [data-action]', 'click', e => {
		e.target.closest('.menu').classList.remove('show');
	}],
	['[data-tab="variants"], [data-action="add-variant"]', 'click', async e => {
		const variant_list = document.querySelector('.variants-plot');
		const current_variants = (getOptions().variants || []);
		const form = addPopup(e.target.closest('.map-container'), 'Selected Variants', [{name: 'range', label: 'Range', content: `<div class="errors"></div><div class="field"><label>Selected regions</label><select name="selected_regions" style="height: 200px;" multiple="multiple">${current_variants.sort((a,b) => a.range.localeCompare(b.range)).map(variant => `<option value="${variant.range}">${variant.range}</option>`).join('')}</select></div><div class="field"><label>Add range</label><input type="text" name="range" placeholder="Range (e.g., chr12:1000-2000)"></div><a class="button" data-action="add">Add</a><a class="button" data-action="delete">Delete</a>`}], () => () => {});
		if (!form)
			return;
		form.addEventListener('click', e => {
			switch(true) {
				case e.target.matches('[data-action="add"]'): {
					const data = readForm(form.querySelector('[data-tab-content].selected'));
					const type = form.querySelector('[data-tab].selected').dataset.tab;
					if (data.type === 'range' && data.range === '' || data.type === 'rsid' && data.rsid === '')
						return;
					const current_variants = (getOptions().variants || []);
					const updated_variants = current_variants.concat(Object.assign({type}, data));
					getOptions([['variants', updated_variants]]);
					document.querySelector('[data-layer="variants"]').dispatchEvent(new Event('refresh'));
					form.querySelector('[name="selected_regions"]').innerHTML = updated_variants.sort((a,b) => a.range.localeCompare(b.range)).map(variant => `<option value="${variant.range}">${variant.range}</option>`).join('')
					break;
				}
				case e.target.matches('[data-action="delete"]'): {
					const selected = Array.from(form.querySelector('[name="selected_regions"]').children).filter(elem => elem.selected).map(elem => elem.value);
					const current_variants = (getOptions().variants || []);
					const updated_variants = current_variants.filter(variant => !selected.includes(variant.range));
					if (updated_variants.length === 0)
						formError(form, 'Note that running analyses such as PCA or Fst with no selected variants will likely fail owing to memory limits', 25000);
					getOptions([['variants', updated_variants]]);
					document.querySelector('[data-layer="variants"]').dispatchEvent(new Event('refresh'));
					form.querySelector('[name="selected_regions"]').innerHTML = updated_variants.sort((a,b) => a.range.localeCompare(b.range)).map(variant => `<option value="${variant.range}">${variant.range}</option>`).join('')
					break;
				}
			}
		});
	}],
	['[data-action="bam-lookup"]', 'click', e => {
		const sample_id = e.target.dataset.id;
		import('/ebi.js').then(ebi => ebi.findSampleFiles(sample_id).then(results => {
			addPopup(e.target.closest('.map-container'), 'Load BAM files', [{name: 'bam', label: 'BAM', content: `<div class="field"><label>BAM files</label><textarea>${results.length === 0 ? 'No BAM files found' : results.join('\n')}</textarea></div>`}], () => {});
		}));
	}],
	['[data-action="pubmed-lookup"]', 'click', e => {
		const term = e.target.dataset.term;
		import('/ncbi.js').then(ncbi => ncbi.ncbiFromTerms(term).then(links => {
			if (links.length === 0)
				return;
			window.open(links[0], '_blank');
		}));
	}],
	['.layers [data-selector]', 'click', e => {
		const layer_selector = e.target.dataset.selector.split(' ');
		document.querySelectorAll(`[data-layer="${layer_selector[0]}"]`).forEach(elem => elem.classList.toggle(layer_selector[1] || 'hidden'));
		e.target.classList.toggle('hidden');
	}],
	['[data-action="zoomin"], [data-action="zoomout"]', 'click', e => {
		const zoomin = e.target.matches('[data-action="zoomin"]');
		const map_corners = JSON.parse(document.querySelector('.map').dataset.corners);
		const scale = Math.min(360, (map_corners[1][0] - map_corners[0][0]) * (zoomin ? 0.75 : 1.25));
		const center = [map_corners[0][0] + (map_corners[1][0] - map_corners[0][0]) / 2, map_corners[0][1] - (map_corners[1][0] - map_corners[0][0]) / 4];
		const zoomed_box = [Math.min(360, scale), Math.min(180, scale / 2)];
		const offset = [Math.max(-180, center[0] - scale / 2), Math.min(90, center[1] + scale / 4)];
		const overflow = [Math.max(0, offset[0] + scale - 180), Math.max(0, -offset[1] + scale / 2 - 90)];
		const zoomed_coords = [
			[offset[0] - overflow[0], offset[1] + overflow[1]],
			[offset[0] - overflow[0] + scale, offset[1] + overflow[1] - scale / 2]
		];
		document.querySelectorAll('[data-layer]').forEach(layer => layer.dispatchEvent(new CustomEvent('zoom', {detail: {coords: zoomed_coords}})));
	}],
	['.map, .map *', 'wheel', e => {
		if (getOptions().scroll_zoom === 'off')
			return;
		const map_corners = JSON.parse(e.target.closest('.map').dataset.corners);
		const scale = Math.min(360, (map_corners[1][0] - map_corners[0][0]) * (e.deltaY < 0 ? 0.75 : 1.25));
		const center = e.deltaY < 0 ? coordsFromPos([e.offsetX, e.offsetY]) : [map_corners[0][0] + (map_corners[1][0] - map_corners[0][0]) / 2, map_corners[0][1] - (map_corners[1][0] - map_corners[0][0]) / 4];
		const zoomed_box = [Math.min(360, scale), Math.min(180, scale / 2)];
		const offset = [Math.max(-180, center[0] - scale / 2), Math.min(90, center[1] + scale / 4)];
		const overflow = [Math.max(0, offset[0] + scale - 180), Math.max(0, -offset[1] + scale / 2 - 90)];
		const zoomed_coords = [
			[offset[0] - overflow[0], offset[1] + overflow[1]],
			[offset[0] - overflow[0] + scale, offset[1] + overflow[1] - scale / 2]
		];
		document.querySelectorAll('[data-layer]').forEach(layer => layer.dispatchEvent(new CustomEvent('zoom', {detail: {coords: zoomed_coords}})));
	}],
	['.main-menu [data-action="minimize"]', 'click', e => {
		e.target.closest('.main-menu').classList.toggle('minimized');
	}],
	['.main-menu [data-action="settings"]', 'click', e => {
		if (e.target.closest('.map-container').querySelector(`.popup[data-title="Settings"]`))
			return e.target.closest('.map-container').querySelector(`.popup[data-title="Settings"]`).remove();
		const current_settings = getOptions();
		const callback = form => async e => {
			if (!form)
				return;
			const data = readForm(form.querySelector('[data-tab-content].selected'));
			if (data.year_range) {
				data.year_range = data.year_range.split('-').map(v => +(v));
				data.year_range[0] = Math.max(0, Math.round(data.year_range[0] / 1000) * 1000);
				data.year_range[1] = Math.round(data.year_range[1] / 1000) * 1000;
			}
			getOptions(Object.entries(data));
			form.remove();
			document.querySelector('.map').dispatchEvent(new Event('update'));
		};
		addPopup(e.target.closest('.map-container'), 'Settings', [{name: 'timeline', label: 'Timeline', content: `<div class="field"><label>Window size in years</label><input type="text" name="step" placeholder="Window size in years" value="${current_settings.step}"></div><div class="field"><label>Year range</label><input type="text" name="year_range" placeholder="Year range (e.g., 0-5000)" value="${current_settings.year_range ? current_settings.year_range.join('-') : ''}"></div><a data-action="submit">Save</a>`}, {name: 'navigation', label: 'Navigation', content: `<div class="field"><label>Scroll zoom</label><select name="scroll_zoom"><option value="off"${current_settings.scroll_zoom === 'off' ? ' selected="selected"' : ''}>Off</option><option value="on"${current_settings.scroll_zoom === 'on' ? ' selected="selected"' : ''}>On</option></select></div><a data-action="submit">Save</a>`}, {name: 'debug', label: 'Additional', content: `<div class="field"><label>Debug</label><select name="debug"><option value="off"${current_settings.debug === 'off' ? ' selected="selected"' : ''}>Off</option><option value="on"${current_settings.debug === 'on' ? ' selected="selected"' : ''}>On</option></select></div><a data-action="submit">Save</a>`}], callback);
	}],
	['[data-action="reset"]', 'click', e => {
		const map = e.target.closest('.map');
		map.querySelector('.selector').classList.remove('show');
		document.querySelectorAll('[data-layer]').forEach(layer => layer.dispatchEvent(new CustomEvent('zoom', {detail: {coords: [[-180, 90], [180, -90]]}})));
	}],
	['[data-action="add-dataset"]', 'click', async e => { // Doesn't always result in adding a layer
		const data = await import('./assets.js').then(module => module.assetForm(e.target.closest('.map-container')));
		if (data.type !== 'samples')
			return;
		const { addLayer } = await import('./layer.js');
		await addLayer(document.querySelector('.map'), `layer_${data.asset_id}`, data.label, data.type, data.asset_id, 'a').then(layer => layer.dispatchEvent(new Event('refresh')));
		if (data.type === 'admixture') // Where should this be
			await addLayer(document.querySelector('.bars-overlay'), `layer_${data.asset_id}`, false, data.type+'_bars', data.asset_id, false, 20)
				.then(layer => layer.dispatchEvent(new Event('refresh')));
	}],
	['.popup [data-action="close"]', 'click', async e => {
		e.target.closest('.popup').remove();
	}],
	['.plot [data-action="close"]', 'click', async e => {
		window.location.hash = '';
		e.target.closest('.plot').remove();
	}],
	['[data-tab]:not(.multiple)', 'click', e => {
		e.target.closest('.tabbed-content').querySelectorAll('[data-tab]').forEach(elem => elem.classList.remove('selected'));
		e.target.classList.add('selected');
		e.target.closest('.tabbed-content').querySelectorAll('[data-tab-content]').forEach(elem => elem.classList.remove('selected'));
		e.target.closest('.tabbed-content').querySelector(`[data-tab-content="${e.target.dataset.tab}"]`).classList.add('selected');
	}],
	['[data-tab].multiple', 'click', e => {
		e.target.classList.toggle('selected');
		e.target.closest('.tabbed-content').querySelector(`[data-tab-content="${e.target.dataset.tab}"]`).classList.toggle('selected');
	}],
	['.upload-area', 'dragover', e => {
		e.preventDefault();
		e.dataTransfer.dropEffect = 'copy';
	}],
	['.moveable .header, .moveable .header *', 'mousedown', e => {
		e.preventDefault();
		const panel = e.target.closest('.moveable');
		const initial = [e.offsetX, e.offsetY];
		const track = e => {
			e.preventDefault();
			if (e.target.closest('.moveable') !== panel)
				return window.removeEventListener('mousemove', track);
			panel.style.left = panel.offsetLeft - initial[0] + e.offsetX;
			panel.style.top = panel.offsetTop - initial[1] + e.offsetY;
		};
		window.addEventListener('mousemove', track);
		window.addEventListener('mouseup', e => {
			window.removeEventListener('mousemove', track);
		}, {once: true});
	}],
	['[data-action="analysis-list"]', 'click', async e => {
		const analyses = await import('/analysis.js').then(module => module.list()).then(analyses => analyses.map(analysis => {
			return Object.fromEntries(Object.entries(analysis).map(([prop, value]) => {
				switch(prop) {
					case 'variant_regions':
						return [prop, value.map(variant_region => variant_region.range).join(', ')];
					default:
						return [prop, value];
				}
			}));
		}));
		const form = addPopup(e.target.closest('.map-container'), 'Analyses', [
			{'name': 'analyses', 'label': 'Analyses', content: `<div class="col header">Label</div><div class="col header">Time</div><div class="col header">Parameters</div>${analyses.length === 0 ? '<div class="col wide">No saved analyses</div>' : analyses.map(analysis => `<div class="col"><a href="#analysis/${analysis.result_id}">${analysis.label}</a></div><div class="col">${new Date(analysis.time * 1000).toLocaleString()}</div><div class="col"><textarea rows="3">${Object.entries(analysis).filter(v => typeof v[1] === 'string' || typeof v[1] === 'number').map(v => `${v[0]}: ${v[1]}`).join('\n')}</textarea></div>`).join('')}`}
		], () => () => {});
		form.addEventListener('click', e => {
			if (e.target.matches('a[href]'))
				form.remove();
		});
		form.dataset.cols = 3;
	}],
	['[data-action="analyze"]', 'click', async e => {
		try {
			const analysis = await import('./analysis.js').then(analysis => analysis.run(document.querySelector('.map')));
			if (!analysis)
				return;
			const box = document.createElement('div');
			box.classList.add('plot');
			box.innerHTML = `<div class="header"><a data-icon="x" data-action="close" class="right"></a>Analysis running</div><div class="text"><p>The results of "${analysis.label}" will be available in the analysis list and at the following URL when completed:</p><p><a href="https://dora.modelrxiv.org/#analysis/${analysis.result_id}">https://dora.modelrxiv.org/#analysis/${analysis.result_id}</a></p></div>`;
			box.addEventListener('click', e => {
				if (e.target.matches('a[href]'))
					box.remove();
			});
			document.querySelector('.map-container').appendChild(box);
		} catch (e) {
			return errorBox('Analysis error', e);
		}
	}],
	['[data-action="export"]', 'click', async e => {
		const output = await import('./analysis.js').then(analysis => analysis.exportSubsets(document.querySelector('.map')));
		const data = new Blob([output], {type: 'text/csv'});
		const url = window.URL.createObjectURL(data);
		const link_elem = document.createElement('a');
		link_elem.href = url;
		link_elem.download = 'subsets.csv';
		document.body.appendChild(link_elem);
		link_elem.click();
		window.URL.revokeObjectURL(url);
		document.body.removeChild(link_elem);
	}],
	['.data-overlays .select a:not(.selected)', 'click', e => {
		const map = document.querySelector('.map');
		const menu = e.target.closest('.select');
		menu.querySelectorAll('a').forEach(elem => elem.classList.remove('selected'));
		e.target.classList.add('selected');
		map.dispatchEvent(new Event('update')); // Maybe just update samples?
	}],
	['.selector .slider', 'mousedown', e => {
		e.preventDefault();
		const map = document.querySelector('.map');
		const year_range = getOptions().year_range;
		const left = e.target.matches('.left');
		const selector = e.target.closest('.selector');
		const panel_width = selector.parentElement.offsetWidth;
		const initial = e.offsetX;
		const track_slider = e => {
			e.preventDefault();
			if (e.target.closest('.panel') === null)
				return;
			if (e.target.matches('.slider')) {
				if (left)
					selector.style.left = selector.offsetLeft - initial + e.offsetX;
				else
					selector.style.width = selector.offsetWidth - initial + e.offsetX;
			} else if (e.target.matches('.selector')) {
				if (left)
					selector.style.left = e.offsetX + e.target.offsetLeft;
				else
					selector.style.width = e.offsetX;
			} else {
				if (left)
					selector.style.left = e.offsetX;
				else
					selector.style.width = e.offsetX - selector.offsetLeft;
			}
			const years = [year_range[0] + (year_range[1] - year_range[0]) * selector.offsetLeft / panel_width, year_range[0] + (year_range[1] - year_range[0]) * (selector.offsetLeft + selector.offsetWidth) / panel_width].map(Math.round);
			selector.querySelector('.left').innerHTML = years[0];
			selector.querySelector('.right').innerHTML = years[1];
		};
		window.addEventListener('mousemove', track_slider);
		window.addEventListener('mouseup', e => {
			window.removeEventListener('mousemove', track_slider);
			const years = [year_range[0] + (year_range[1] - year_range[0]) * selector.offsetLeft / panel_width, year_range[0] + (year_range[1] - year_range[0]) * (selector.offsetLeft + selector.offsetWidth) / panel_width]
				.map(year => Math.round(year / 100) * 100);
			map.dataset.years = JSON.stringify(years);
			getOptions([['years', years]]);
			map.dispatchEvent(new Event('update'));
			document.querySelector('.timeline-plot').dispatchEvent(new Event('update'));
		}, {once: true});
	}],
	['.code textarea', 'keydown', e => { // Move to plot.js
		const tab = '\t';
		const t = e.target;
		const ss = t.selectionStart;
		const se = t.selectionEnd;
		if (e.keyCode === 9) {
			e.preventDefault();
			if (ss !== se && t.value.slice(ss,se).indexOf('\n') !== -1) {
				const pre = t.value.slice(0,ss);
				const sel = t.value.slice(ss,se).replace(/\n/g, '\n'+tab);
				const post = t.value.slice(se,t.value.length);
				t.value = pre.concat(tab).concat(sel).concat(post);
				t.selectionStart = ss + tab.length;
				t.selectionEnd = se + tab.length;
			} else {
				t.value = t.value.slice(0,ss).concat(tab).concat(t.value.slice(se,t.value.length));
				t.selectionStart = t.selectionEnd = ss + tab.length;
			}
		}
	}]
];

const loadModules = async () => {
	const module_list = await fetch('/modules/.list').then(res => res.json());
	for (const module_name of module_list) {
		try {
			const module = await import(`/modules/${module_name}.js`);
			module.init(document.querySelector('.map-container'));
		} catch (e) {
			console.log(`Error loading module ${module_name}`);
		}
	}
};

const loadAssets = async (map, assets) => {
	const {addLayer, addLayerMenu} = await import('./layer.js');
	await addLayer(map, 'bg', false, 'background', '/sc/ne2.jpg'); // Change from static
	await addLayer(map, 'samples', false, 'samples', 'samples', false);
	await addLayer(document.querySelector('.timeline-plot'), 'timeline', false, 'timeline', 'samples', false, 20);
	await addLayer(document.querySelector('.variants-plot'), 'variants', false, 'variants', 'samples', false, 20);
	for (const asset of assets) {
		switch(asset.file_type) {
			case 'samples':
				addLayerMenu(asset.label, 'samples individuals-hidden', 'samples', 's');
				break;
		}
	}
	addLayerMenu('Regions', 'samples regions-hidden', 'regions', 'L');
};


const loadOverlays = async (map, assets) => {
	const {addLayer, addLayerMenu} = await import('./layer.js');
	const overlays_menu = document.querySelector('.data-overlays .select');
	const addToMenu = (menu, property, label) => {
		const a = document.createElement('a');
		a.dataset.property = property;
		a.innerText = label;
		menu.appendChild(a);
	};
	['Coverage', 'Date'].forEach(property => addToMenu(overlays_menu, property.toLowerCase(), property));
	for (const asset of assets) {
		const label = asset.label || asset.file_name.replace(/^.*?([^\/\.]+)[^\/]*?$/, '$1');
		switch(asset.file_type) {
			case 'col':
				addToMenu(overlays_menu, asset.file_name, label);
				break;
			case 'q':
				addToMenu(overlays_menu, asset.file_name, label);
				const panel = document.createElement('div');
				panel.classList.add('panel', 'selected');
				panel.dataset.tabContent = label;
				panel.innerHTML = `<div class="structure structure-plot"></div>`;
				const tab = document.createElement('a');
				tab.innerText = label;
				tab.dataset.tab = label;
				document.querySelector('.panels').insertBefore(panel, document.querySelector('.panels :first-child'));
				document.querySelector('.panels .tabs').insertBefore(tab, document.querySelector('.panels .tabs :first-child'));
				await addLayer(panel.querySelector('.structure-plot'), label, false, 'structure', label, false, 20);
				break;
		}
	}
	overlays_menu.querySelector('a').classList.add('selected');
};

const handleUrls = (hash) => {
	const parts = hash.slice(1).split('/');
	switch(parts[0]) {
		case 'analysis':
			return import('/analysis.js').then(module => module.display(parts[1]));
	}
};

const init = async (map, options) => {
	for (const option in options)
		map.dataset[option] = typeof options[option] === 'object' ? JSON.stringify(options[option]) : options[option];
	const assets = await import('./assets.js').then(module => module.loadedAssets());
	await loadAssets(map, assets);
	await loadOverlays(map, assets);
	document.querySelectorAll('.panel:not([data-tab-content="timeline"])').forEach(elem => elem.classList.remove('selected'));
	addRegions('samples');
	addHooks(window, hooks);
	loadModules();
	document.querySelector('.map').dispatchEvent(new Event('update'));
	handleUrls(window.location.hash);
	window.addEventListener('hashchange', e => handleUrls(window.location.hash));
};

export { init }