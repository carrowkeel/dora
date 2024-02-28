
const loadPGSFromCSV = async (url) => {
	const response = await fetch(url);
	if (!response.ok)
		throw new Error('Failed to retrieve PGS from PGSCatalog');
	const blob = await response.blob();
	const buffer = await blob.arrayBuffer();
	const decompressed = await import('/pako.js').then(module => module.pako.inflate(new Uint8Array(buffer), {to: 'string'}));
	const csv = decompressed.split('\n').filter(line => line !== '' && !line.startsWith('#')).map(line => line.split('\t'));
	const cols = csv[0];
	const col_labels = cols.includes('rsID') ? ['rsID', 'effect_allele', 'effect_weight'] : ['chr_name', 'chr_position', 'effect_allele', 'effect_weight']
	const col_indices = col_labels.map(col => cols.indexOf(col));
	return [csv.slice(1).map(line => col_indices.map(i => line[i])), col_labels];
};

const saveDataToCache = async (data, key, cache_name='mdx_cache_adna') => {
	const cache = await caches.open(cache_name);
	await cache.put(key, new Response(JSON.stringify(data), {headers: {'Content-Type': 'application/json'}}));
};

const getBimIndicesAndWeightsByRsid = (csv, bim) => {
	const bimIndexByRsidAllele1 = new Map();
	const bimIndexByRsidAllele2 = new Map();
	bim.forEach((row, index) => {
		bimIndexByRsidAllele1.set(`${row[1]}_${row[4]}`, index);
		bimIndexByRsidAllele2.set(`${row[1]}_${row[5]}`, index);
	});
	const result = [];
	csv.forEach(row => {
		const index1 = bimIndexByRsidAllele1.get(`${row[0]}_${row[1]}`);
		const index2 = bimIndexByRsidAllele2.get(`${row[0]}_${row[1]}`);
		if (index1 !== undefined)
			result.push([index1, +(row[2]), 1]);
		if (index2 !== undefined)
			result.push([index2, +(row[2]), 2]);
	});
	result.sort((a, b) => a[0] - b[0]);
	return result;
};

const getBimIndicesAndWeightsByPos = (csv, bim) => {
	const bimIndexByRsidAllele1 = new Map();
	const bimIndexByRsidAllele2 = new Map();
	bim.forEach((row, index) => {
		bimIndexByRsidAllele1.set(`${row[0]}_${row[3]}_${row[4]}`, index);
		bimIndexByRsidAllele2.set(`${row[0]}_${row[3]}_${row[5]}`, index);
	});
	const result = [];
	csv.forEach(row => {
		const index1 = bimIndexByRsidAllele1.get(`${row[0]}_${row[1]}_${row[2]}`);
		const index2 = bimIndexByRsidAllele2.get(`${row[0]}_${row[1]}_${row[2]}`);
		if (index1 !== undefined)
			result.push([index1, +(row[3]), 1]);
		if (index2 !== undefined)
			result.push([index2, +(row[3]), 2]);
	});
	result.sort((a, b) => a[0] - b[1]);
	return result;
};

const processPGS = async (bed_prefix, url) => {
	const [csv, csv_cols] = await loadPGSFromCSV(url);
	const bim = await fetch(`${bed_prefix}.bim`).then(res => res.text()).then(raw => raw.split('\n').map(line => line.split(/[ ]+/)));
	const result = csv_cols.includes('rsID') ? getBimIndicesAndWeightsByRsid(csv, bim) : getBimIndicesAndWeightsByPos(csv, bim);
	return result;
};

const hooks = [
	['[data-tab-content="add-pgs"] [data-action="search"]', 'click', e => {
		const search_term = e.target.closest('.form').querySelector('[name="pgs_search_trait"]').value;
		if (search_term.length < 3)
			return;
		fetch(`https://www.pgscatalog.org/rest/trait/search?term=${search_term}`).then(res => res.json())
			.then(terms => {
				e.target.closest('.form').querySelector('.pgs-search-results').innerHTML = '<div class="row header"><div class="col">Trait</div><div class="col">Description</div></div>' + terms.results.map(result => `<div class="row"><div class="col"><a data-pgs-trait="${result.id}" data-pgs-trait-label="${result.label}">${result.label}</a></div><div class="col">${result.description}</div></div>`).join('');
			});
	}],
	['[data-pgs-trait]', 'click', e => {
		const search_term = e.target.dataset.pgsTrait;
		const trait_label = e.target.dataset.pgsTraitLabel;
		fetch(`https://www.pgscatalog.org/rest/score/search?trait_id=${search_term}&limit=100`).then(res => res.json()) // Increase query limit
			.then(terms => {
				e.target.closest('.form').querySelector('.pgs-search-results').innerHTML = '<div class="table" data-cols="4"><div class="row header"><div class="col">PGS</div><div class="col">Release date</div><div class="col">Variants</div><div class="col">Samples</div></div>' + terms.results.map(result => `<div class="row"><div class="col"><a data-action="pgs-upload" data-pgs-id="${result.id}" data-pgs-url="${result.ftp_scoring_file}" data-trait="${trait_label}" data-variantn="${result.variants_number}" title="${result.name}">${result.name}</a></div><div class="col">${result.date_release}</div><div class="col">${result.variants_number}</div><div class="col">${result.samples_variants.length === 0 ? 'No data' : result.samples_variants.map((samples,i) => `(${i+1}) <a title="Cohorts: ${samples.cohorts.map(cohort => cohort.name_short).join(', ')}">${samples.sample_number} (${samples.ancestry_broad})</a>`).join(', ')}</div></div>`).join('') + '</div>';
			});
	}],
	['[data-pgs-id]', 'click', async e => {
		const pgs_id = e.target.dataset.pgsId;
		const url = e.target.dataset.pgsUrl;
		const loaded_bed_files = await import('/assets.js').then(module => module.loadedAssets('bed'));
		const bed_prefix = loaded_bed_files[0].file_name.replace('.bed', ''); // Run for all loaded bim files or user-selected
		e.target.closest('.popup').remove();
		const result = await processPGS(bed_prefix, url);
		if (result.length === 0)
			throw new Error('Empty variant list');
		const metadata = {file_name: `/pgs/${pgs_id}_${bed_prefix.replace(/^.*?\/([^\/]+)$/, '$1')}.pgs`, file_type: 'pgs', pgs_id, label: `${e.target.dataset.trait} (${pgs_id})`, shape: [result.length]};
		await saveDataToCache(result, metadata.file_name);
		await saveDataToCache(metadata, `${metadata.file_name}.metadata`);
	}],
	['[data-pgs]', 'click', e => {
		e.target.parentElement.querySelectorAll('[data-pgs]').forEach(elem => elem.classList.remove('selected'));
		e.target.classList.add('selected');
	}],
	['.form', 'analysisform', e => {
		const form = e.target;
		const options = getOptions();
		const tab_elem = document.createElement('a');
		tab_elem.dataset.tab = 'pgs';
		tab_elem.innerText = 'PGS';
		form.querySelector('.tabs').appendChild(tab_elem);
		const tab_content = document.createElement('div');
		tab_content.dataset.tabContent = 'pgs';
		const selected_pgs = document.querySelector('[data-pgs].selected');
		const pgs_label = selected_pgs ? selected_pgs.innerText : '';
		const pgs_id = selected_pgs ? selected_pgs.dataset.pgs : '';
		tab_content.innerHTML = `<div class="errors"></div><div class="field"><label>Label</label><input type="text" name="label" placeholder="Label" value="PGS Analysis"></div><div class="field"><label>PGS</label><input type="text" name="pgs" placeholder="PGS001234" value="${pgs_id}" autocomplete="off"></div><div class="field"><label>PGS score calculation</label><select name="model"><option value="mean">Mean</option><option value="sum">Sum</option></select></div><div class="field"><label>Sample coverage threshold</label><input type="text" name="sample_threshold" placeholder="Minimum sample coverage in BED" value="0"></div><div class="field"><label>Variant coverage threshold</label><input type="text" name="variant_threshold" placeholder="Minimum variant coverage in BED" value="0"></div><div class="field"><label>Window size</label><input type="text" name="step" placeholder="Window size" value="${options.step}"></div><div class="field"><label>Year range</label><input type="text" name="years" placeholder="Year range (e.g., 1000-2000)" value="${options.years.join('-')}"></div><a data-action="submit">Run</a>`;
		form.querySelector('.cols').appendChild(tab_content);
	}],
	['.form', 'assetform', e => {
		const form = e.target;
		const tab_elem = document.createElement('a');
		tab_elem.dataset.tab = 'add-pgs';
		tab_elem.innerText = 'PGS (PGSCatalog)';
		form.querySelector('.tabs').appendChild(tab_elem);
		const tab_content = document.createElement('div');
		tab_content.dataset.tabContent = 'add-pgs';
		tab_content.innerHTML = `<div class="error"></div><div class="field"><label>Search traits</label><input type="text" name="pgs_search_trait" placeholder="Trait label"></div><div class="pgs-search-results"></div><a data-action="search">Search</a>`;
		form.querySelector('.cols').appendChild(tab_content);
	}]
];

const initSearch = async () => {
	const pgs_list = await import('/assets.js').then(module => module.loadedAssets('pgs'));
	const displayResults = (elem, results) => {
		if (!elem.querySelector('.search-results')) {
			const results_box = document.createElement('div');
			results_box.classList.add('search-results');
			elem.appendChild(results_box);
		}
		elem.querySelector('.search-results').innerHTML = results.map(result => `<a data-pgs-result="${result.file_name}">${result.label}</a>`).join('');
		elem.querySelector('.search-results').addEventListener('click', e => {
			if (!e.target.matches('[data-pgs-result]'))
				return;
			const input = elem.querySelector('input[name]');
			input.value = e.target.innerText;
			input.dataset.value = e.target.dataset.pgsResult;
			e.target.closest('.search-results').remove();
		});
	};
	window.addEventListener('keyup', e => {
		if (!e.target.matches('[name="pgs"]'))
			return;
		const search = e.target.value;
		if (search.length < 3)
			return;
		const results = pgs_list.filter(asset => asset.label.match(search));
		displayResults(e.target.closest('.field'), results);
	});
};

const addPGS = (pgs) => {
	const container = document.querySelector('.map-container .main-menu [data-tab-content="pgs"]');
	const pgs_elem = document.createElement('a');
	pgs_elem.dataset.pgs = pgs.id;
	pgs_elem.innerText = `${pgs.label} (${pgs.id})`;
	container.insertBefore(pgs_elem, container.querySelector(':last-child'));
};

export const init = (map) => {
	initSearch(map);
	addHooks(map, hooks);
};