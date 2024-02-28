
const range = (start, end, step=1) => Array.from(Array(Math.floor((end-start)/step))).map((v,i)=>start + i * step);
const linspace = (start, end, n) => Array.from(Array(n)).map((v,i)=>start + i * ((end - start) / (n - 1)));
const randint = (a, b) => a + Math.floor((b-a)*Math.random());
const key_chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
const generateKey = (l=6) => Array.from(new Array(l)).map(v => key_chars[randint(0, key_chars.length)]).join('');

const loadMetadata = async (uri) => {
	try {
		return (await fetch(uri).then(res => res.json()));
	} catch (e) {
		return undefined;
	}
};

const loadTable = (uri, ext) => {
	return fetch(`${uri}.${ext}`).then(res => res.text()).then(data => data.toString().split('\n').filter(line => line !== '').map((line, i) => line.replace(/^[\t ]+/, '').split(/[\t ]+/)));
};

const loadLabels = (uri, ext) => {
	return fetch(`${uri}.${ext}`).then(res => res.text()).then(data => Object.fromEntries(data.toString().split('\n').filter(line => line !== '').map((line, i) => [line.replace(/[\t ]+/, ''), i])));
};

const loadData = (uri, filter, coords=JSON.parse(document.querySelector('.map').dataset.corners)) => {
	return loadMetadata(uri).then(data => data.filter(entry => {
		return (!filter.years || (entry.date <= filter.years[1] && entry.date >= filter.years[0])) &&
			(entry.long >= coords[0][0] && entry.lat >= coords[1][1] && entry.long <= coords[1][0] && entry.lat <= coords[0][1]);
	}));
};

const loadCol = async (uri, metadata) => {
	const col = await fetch(uri).then(res => res.json());
	return metadata.map(sample => col[sample.bed_id] || col[sample.sample_id]);
};

const appendCol = async (uri, label, metadata) => {
	const col = await fetch(uri).then(res => res.json());
	metadata.forEach(sample => {
		sample[label] = col[sample.sample_id];
	});
};

const saveAsset = (key, text_content, content_type='application/json', cache_name = 'mdx_cache_adna') => {
	return caches.open(cache_name).then(async cache => {
		try {
			const uri = key;
			await cache.put(new Request(uri), new Response(text_content, {headers: {'Content-Type': content_type}}));
		} catch (e) {
			console.log(e);
		}
	});
};

const remoteAssets = (type) => {
	// Fetch index of assets on S3 from S3 bucket
	return fetch('/public/index.json').then(res => res.json()).then(results => {
		return Object.values(results).filter(result => !type || result.file_type === type).map(result => Object.assign({}, result, {file_name: '/' + result.file_name}));
	});
};

// For library of layers, save metadata for layers somewhere for labels
const localAssets = (search='', cache_name = 'mdx_cache_adna') => {
	return caches.open(cache_name).then(async cache => {
		return cache.keys().then(results => {
			return results.filter(request => request.url.match(search));
		});
	});
};

const loadedAssets = async (type) => {
	const remote_assets = await remoteAssets(type); // Standardize metadata
	const local_assets = await localAssets('.*?\.metadata$').then(assets => Promise.all(assets.map(asset => loadMetadata(asset))).then(assets => assets.filter(asset => asset && (!type || asset.file_type === type))));
	return remote_assets.concat(local_assets);
};

const loadedSamples = async (cols=false, filter={}, coords=JSON.parse(document.querySelector('.map').dataset.corners)) => {
	const samples = await loadedAssets('samples').then(assets => Promise.all(assets.map(asset => loadData(asset.file_name, filter, coords)))).then(sample_lists => sample_lists.flat());
	if (!cols)
		return samples;
	for (const asset of (await loadedAssets())) {
		switch(asset.file_type) {
			case 'col':
			case 'q':
				await appendCol(asset.file_name, asset.label || asset.file_name.replace(/^.*?([^\/\.]+)[^\/]*?$/, '$1'), samples);
				break;
		}
	}
	return samples;
};

const textFromReader = async (reader) => {
	const decoder = new TextDecoder();
	const chunks = [];
	while(true) {
		const {value, done} = await reader.read();
		if (value !== null)
			chunks.push(decoder.decode(value));
		if (done)
			break;
	}
	return chunks.join('');
};

const valueFromCoordFile = () => {
	const cache = {};
	return (data, long, lat, year, n=4) => {
		const cache_key = [long, lat, year].join('_');
		if (cache[cache_key] !== undefined)
			return cache[cache_key];
		if (!data)
			return 'null';
		const value = data.map(coord => [Math.sqrt((coord[0] - long)**2 + (coord[1] - lat)**2), coord[2]])
			.sort((a, b) => a[0] - b[0])
			.slice(0, n).reduce((a,v) => a+v[1], 0) / n;
		cache[cache_key] = value;
		return value;
	}
};

const assetForm = (container) => new Promise(async (resolve) => {
	const current_layers = await loadedAssets();
	const addAssetMetadata = async (tab, asset) => {
		const data = readForm(tab);
		const entry = Object.assign({label: data.label || asset.file_name}, asset);
		await saveAsset(`${asset.file_name}.metadata`, JSON.stringify(entry));
		const uploaded_files = tab.querySelector('.uploaded-files');
		const uploaded_item = document.createElement('div');
		uploaded_item.innerHTML = `<div class="label">${asset.file_name}</div><div class="status">Uploaded</div>`;
		uploaded_files.appendChild(uploaded_item);
	};
	const types = {samples: 'Samples', q: 'STRUCTURE', col: 'Sample metadata', 'bed': 'PLINK (bed)', 'fam': 'PLINK (fam)', 'bim': 'PLINK (bim)'};
	const form = addPopup(container, 'Add Dataset', [
		{'name': 'library', 'label': 'Library', content: `<div class="col header">Label</div><div class="col header">Type</div><div class="col header">Shape</div>${current_layers.length === 0 ? '<div class="col wide">No current layers</div>' : current_layers.map(asset => `<div class="col"><a data-filename="${asset.file_name}" data-label="${asset.label}" data-type="${asset.type}">${asset.label}</a></div><div class="col">${types[asset.file_type] || asset.file_type}</div><div class="col">${asset.shape}</div>`).join('')}`},
		{'name': 'samples', 'label': 'Samples', content: `<div class="field"><label>Label</label><input type="text" data-name="label" name="label" placeholder="Layer label"></div><div class="uploaded-files"></div><div class="upload-area">Drag files here (.csv, .tsv)</div>`},
		{'name': 'metadata', 'label': 'Sample metadata', content: `<div class="field"><label>Label</label><input type="text" data-name="label" name="label" placeholder="Layer label"></div><div class="uploaded-files"></div><div class="upload-area">Drag files here (.csv, .tsv)</div>`},
		{'name': 'admixture', 'label': 'Admixture results', content: `<div class="field"><label>Label</label><input type="text" data-name="label" name="label" placeholder="Layer label"></div><div class="uploaded-files"></div><div class="upload-area">Drag files here (.fam + .Q files)</div>`},
		{'name': 'genotypes', 'label': 'Genotypes', content: `<div class="field"><label>Label</label><input type="text" data-name="label" name="label" placeholder="Layer label"></div><div class="uploaded-files"></div><div class="upload-area">Drag files here (.bed + .fam + .bim)</div>`},
	], () => resolve);
	form.dataset.cols = 3;
	if (!form) // Temporary solution
		return;
	form.dispatchEvent(new Event('assetform'));
	form.querySelectorAll('.upload-area').forEach(elem => elem.addEventListener('drop', async e => {
		e.preventDefault();
		const files = e.dataTransfer.items ? Array.from(e.dataTransfer.items).map(file => file.getAsFile()) : Array.from(e.dataTransfer.files);
		const extensions = files.map(file => file.name.replace(/^.*?\.([^\.]+)$/, '$1').toLowerCase());
		await Promise.all(files.map(async (file, file_i) => { // This could potentially reprocess previously uploaded files when adding new files
			const stream = file.stream();
			switch(extensions[file_i]) {
				case 'csv':
				case 'tsv':
					const asset_type = form.querySelector('[data-tab].selected').dataset.tab;
					const reader = stream.getReader();
					const text_data = await textFromReader(reader);
					const lines = text_data.split('\n').filter(line => line !== '').map(line => line.split(extensions[file_i] === 'csv' ? ',' : '\t'));
					const cols = lines[0];
					const data = lines.slice(1).map(line => {
						return Object.fromEntries(line.map((val, i) => [cols[i], !isNaN(val) ? +(val) : val]));
					});
					if (asset_type === 'samples')
						return saveAsset(`/data/${file.name}.samples`, JSON.stringify(data), 'text/plain').then(() => addAssetMetadata(e.target.closest('[data-tab-content]'), {label: file.name.replace(/^.*?([^\/\.]+)[^\/]*?$/, '$1'), file_name: `/data/${file.name}.samples`, file_type: 'samples', shape: [data.length]}));
					else if (asset_type === 'metadata')
						return Promise.all(cols.slice(1).map(col => saveAsset(`/data/${file.name}_${col}.col`, JSON.stringify(Object.fromEntries(data.map(entry => [entry.sample_id, entry[col]]))), 'text/plain').then(() => addAssetMetadata(e.target.closest('[data-tab-content]'), {label: file.name.replace(/^.*?([^\/\.]+)[^\/]*?$/, '$1')+'_'+col, file_name: `/data/${file.name}_${col}.col`, file_type: 'col', shape: [data.length]}))));
				case 'fam':
				case 'bim':
				case 'bed':
					const fam = files.find(other_file => other_file.name === file.name.replace(/\.[0-9]+\.q/i, '.fam'));
					const bim = files.find(other_file => other_file.name === file.name.replace(/\.[0-9]+\.q/i, '.bim'));
					const bed = files.find(other_file => other_file.name === file.name.replace(/\.[0-9]+\.q/i, '.bed'));
					if (!fam || !bim || !bed)
						return; // Only upload sets
					return saveAsset(`/data/${file.name}`, stream, 'binary/octet-stream').then(() => addAssetMetadata(e.target.closest('[data-tab-content]'), {file_name: `/data/${file.name}`, file_type: extensions[file_i]}));
				case 'q': {
					const fam = files.find(other_file => other_file.name === file.name.replace(/\.[0-9]+\.q/i, '.fam'));
					if (!fam)
						return;
					const fam_reader = fam.stream().getReader();
					const fam_text_data = await textFromReader(fam_reader);
					const ids = fam_text_data.split('\n').filter(line => line !== '').map(line => line.split(/[\t ]+/)[1]);

					const reader = stream.getReader();
					const text_data = await textFromReader(reader);
					const lines = text_data.split('\n').filter(line => line !== '').map(line => line.split(/[\t ]+/).map(v => +(v)));
					const key = `/data/${file.name}`;

					if (lines.length !== ids.length)
						return; // Mark as error

					// It is understood that these IDs could be in multiple MD files
					const data = Object.fromEntries(ids.map((id, i) => [id, lines[i]]));
					const k = lines[0].length;

					return saveAsset(key, JSON.stringify(data)).then(() => addAssetMetadata(e.target.closest('[data-tab-content]'), {label: `${key.replace(/^.*?([^\/\.]+)[^\/]*?$/, '$1')} (K=${k})`, file_name: key, file_type: 'q', shape: [Object.keys(data).length, k]}));
				}
				case 'coords': { // This is currently not in use
					const key = `/data/${file.name}.col`;
					const metadata = await loadedSamples();
					const reader = stream.getReader();
					const text_data = await textFromReader(reader);
					const coords_data_years = {};
					text_data.split('\n').filter(line => line !== '').slice(1).map((line, i) => line.split(/[\t ]+/).map(v => +(v))).forEach(([long, lat, year, value]) => {
						const i = Math.round(year);
						if (coords_data_years[i] === undefined)
							coords_data_years[i] = [];
						coords_data_years[i].push([long, lat, value]);
					});
					const extract_value = valueFromCoordFile();
					const sample_values = Object.fromEntries(metadata.map(entry => [entry.id, extract_value(coords_data_years[Math.ceil(entry.date / 1000) * 1000], entry.long, entry.lat, Math.ceil(entry.date / 1000) * 1000)]));
					return saveAsset(key, JSON.stringify(sample_values)).then(() => addAssetMetadata(e.target.closest('[data-tab-content]'), {file_name: key, file_type: 'col', shape: [sample_values.length, Array.isArray(sample_values[0]) ? sample_values[0].length : 1]}));
				}
			}
		}));
	}));
});

export { loadData, loadCol, loadMetadata, assetForm, localAssets, remoteAssets, loadedSamples, loadedAssets, loadLabels, loadTable, saveAsset }
