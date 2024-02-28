
const range = (start, end, step=1) => Array.from(Array(Math.floor((end-start)/step))).map((v,i)=>start + i * step);

const htmlFromFields = (type, fields, exclude=[]) => {
	const options = getOptions();
	const standard_fields = [
		['label', 'Label', 'Label', `${type} analysis`],
		['step', 'Window size', 'Window size (years)', options.step],
		['years', 'Year range', 'Year range (e.g., 1000-2000)', options.years.join('-')],
		['variant_threshold', 'Variant coverage threshold (filtered before samples)', 'Minimum variant coverage in BED', '0'],
		['sample_threshold', 'Sample coverage threshold', 'Minimum sample coverage in BED', '0'],
		['metadata_filters', 'Metadata filters', 'Comma-separated filters (e.g., sex=F,qc=PASS)', '']
	].filter(field => !exclude.includes(field[0]));
	return '<div class="errors"></div>'+standard_fields.map(field => `<div class="field"><label>${field[1]}</label><input type="text" name="${field[0]}" placeholder="${field[2]}" value="${field[3]}"></div>`).concat(fields).join('');
};

const initVariantSearch = async (form, bed_prefix) => { // Display also allele
	const variants = await import('./assets.js').then(module => module.loadTable(bed_prefix, 'bim')).then(variants => Object.fromEntries(variants.map((variant, i) => [variant[1], [i, variant[0], variant[3]]])));
	form.querySelector('[name="rsid"]').addEventListener('keyup', e => {
		if (variants[e.target.value] === undefined) {
			e.target.classList.add('error');
			e.target.classList.remove('valid');
		} else {
			e.target.classList.add('valid');
			e.target.classList.remove('error');
		}
	});
};

const analysisForm = (container, defaults, bed_prefix) => new Promise((resolve, reject) => {
	const callback = form => async e => {
		if (!form)
			return resolve(false);
		if (form.querySelectorAll('[data-tab-content].selected input.error').length > 0)
			return formError(form.querySelector('[data-tab-content].selected'), 'There was an error with one or more fields');
		const form_data = readForm(form.querySelector('[data-tab-content].selected'));
		form.remove();
		return resolve(Object.assign({type: form.querySelector('[data-tab].selected').dataset.tab}, form_data));
	};
	const analysis_types = [
		['frequency', 'Allele frequency', ['<div class="field"><label>Variant</label><input type="text" name="rsid" value="" placeholder="rsID" class="error" autocomplete="off"></div>'], ['sample_threshold', 'variant_threshold']],
		['heterozygosity', 'Heterozygosity', []],
		['fst', 'Fst', []],
		['pca', 'PCA', ['<div class="field"><label>Imputation method</label><select name="impute_method"><option value="sample_all">Frequency (all samples)</option><option value="sample_subsets">Frequency (by region)</option><option value="zero">0 (ref homozygote)</option></select></div>']]
	];
	const form = addPopup(document.querySelector('.map-container'), 'Analysis', analysis_types.map(analysis_type => ({name: analysis_type[0], label: analysis_type[1], content: htmlFromFields(...analysis_type.slice(1)) + '<a data-action="submit">Run</a>'})), callback);
	if (!form) // if form is already open it will return false
		return;
	initVariantSearch(form, bed_prefix);
	form.dispatchEvent(new Event('analysisform'));
});

const getVariants = async (bed_prefix, variants) => {
	const variant_index = await import('./assets.js').then(assets => assets.loadTable(bed_prefix, 'bim')).then(variants => variants.map((variant, i) => [i, variant[1], +(variant[0].replace('chr', '')), +(variant[3])]));
	return Object.fromEntries(variants.map(variant => {
		switch(variant.type) {
			case 'rsid':
				const indice = variant_index.findIndex(index_variant => index_variant[1] === variant.rsid);
				return [[indice, variant.rsid]];
			case 'range':
				const parts = variant.range.split(':');
				if (parts.length < 2)
					return;
				const chr = +(parts[0].replace('chr', '')); 
				const pos = parts[1].split('-').map(v => +(v));
				return variant_index.filter(variant => variant[2] === chr && variant[3] >= pos[0] && variant[3] <= pos[1]).map(variant => [variant[0], variant[1]]);
		}
	}).flat());
};

const getSampleIndex = (bed_prefix) => {
	return import('./assets.js').then(assets => assets.loadTable(bed_prefix, 'fam')).then(samples => Object.fromEntries(samples.map((sample, i) => [sample[1], i])));
};

const toCsv = (subsets) => {
	const cols = ['region', 'year'].concat(Object.keys(subsets[0].samples[0]));
	const values = subsets.map(subset => subset.samples.map(sample => [subset['region'], subset['year']].concat(Object.values(sample)))).flat();
	return cols.join(',')+'\n'+values.map(row => row.join(',')).join('\n')+'\n';
};

export const list = (search='') => {
	return import('/assets.js').then(module => module.localAssets('\/analysis\/.*?\.json')).then(assets => Promise.all(assets.map(asset => fetch(asset).then(res => res.json())))).then(list => list.reverse());
};

export const exportSubsets = async (container, defaults={}) => {
	const { loadedAssets, loadedSamples } = await import('./assets.js');
	const { regionSamples } = await import('./layers/samples.js');
	const form_data = await analysisForm(container, defaults);
	if (!form_data)
		return;
	const year_range = form_data.years.split('-').map(v => +(v));
	const loaded_samples = await loadedSamples(true);
	const regions = Array.from(document.querySelectorAll('.map [data-region]')).map((region) => {
		const coords = region.getAttribute('points').split(' ').map(v => coordsFromPos(v.split(',').map(v => +(v)), JSON.parse(document.querySelector('.map').dataset.origin)));
		const samples = regionSamples(coords, loaded_samples);
		return {region_index: region.dataset.region_i, region: region.dataset.region, label: region.dataset.label, color: region.dataset.color, samples};
	});
	const subsets = regions.map(region => {
		return range(...year_range, +(form_data.step)).map(year => {
			const samples = region.samples.filter(sample => sample.date >= year && sample.date < year + +(form_data.step));
			return {region: region.label, year, samples};
		});
	}, []);
	return toCsv(subsets.flat());
};

export const run = async (container, defaults={}) => {
	const { loadedAssets, loadedSamples } = await import('./assets.js');
	const { regionSamples } = await import('./layers/samples.js');
	const genotype_prefixes = await loadedAssets('bed').then(assets => assets.map(asset => asset.file_name.replace('.bed', '')));
	if (genotype_prefixes.length === 0)
		throw 'No genotypes available';
	if (document.querySelectorAll('.map [data-region]').length === 0)
		throw 'Please select regions before running analyses';
	const sample_index = await Promise.all(genotype_prefixes.map(genotype_prefix => getSampleIndex(genotype_prefix)));
	const form_data = await analysisForm(container, defaults, genotype_prefixes[0]);
	if (!form_data)
		return false;
	const variant_regions = form_data.rsid ? [{type: 'rsid', rsid: form_data.rsid}] : (getOptions().variants || []);
	const variants = await Promise.all(genotype_prefixes.map(genotype_prefix => getVariants(genotype_prefix, variant_regions)));
	const year_range = form_data.years.split('-').map(v => +(v));
	const temporal_windows = range(...year_range, +(form_data.step));
	const metadata_filters = !form_data.metadata_filters || form_data.metadata_filters === '' ? [] : form_data.metadata_filters.split(',').map(filter => filter.split('='));
	const loaded_samples = await loadedSamples(true);
	const regions = Object.values(getOptions().regions).map(region => {
		const coords = region.corners; // .map(corner => coordsFromPos(corner, JSON.parse(document.querySelector('.map').dataset.origin)));
		const samples = regionSamples(coords, loaded_samples).filter(sample => {
			return (sample.date >= year_range[0] && sample.date < year_range[1] + +(form_data.step)) &&
				(metadata_filters.length === 0 || metadata_filters.reduce((a, [property, value]) => a && sample[property] == value, true)) &&
				(!region.excluded || !region.excluded.includes(sample.bed_id));
		});
		return {region_index: region.region_i, region: region.region_id, label: region.label, color: region.color, samples};
	});
	const jobs = await Promise.all(genotype_prefixes.map(async (genotype_prefix, genotype_i) => {
		const subsets = regions.map(region => {
			return temporal_windows.map(year => {
				const samples = region.samples.filter(sample => sample.date >= year && sample.date < year + +(form_data.step));
				const samples_with_genotypes = samples.filter(sample => sample_index[genotype_i][sample.bed_id] !== undefined);
				return {region_index: region.region_index, region: region.region, year, samples: samples_with_genotypes, sample_indices: samples_with_genotypes.map(sample => sample_index[genotype_i][sample.bed_id])};
			});
		});
		const job = Object.assign({}, form_data, {bed_prefix: genotype_prefix, variant_indices: Object.keys(variants[genotype_i]).map(v => +(v)), subsets: subsets.flat().map(subset => subset.sample_indices)});
		if (job.pgs) { // Move into PGS module
			job.pgs = await fetch(job.pgs).then(res => res.text())
				.then(text => import('/pako.js').then(module => module.pako.gzip(text)))
				.then(compressed => btoa(Array.from(new Uint8Array(compressed)).map(byte => String.fromCharCode(byte)).join('')));
		}
		return [job, subsets.flat().map(subset => subset.samples)];
	}));
	if (jobs.reduce((total, job) => total + job[1].flat(Infinity).length, 0) === 0)
		throw 'No samples in selected regions and temporal windows';
	const result = await import('/jobs.js').then(module => module.distribute(jobs.map(job => job[0])));
	await import('/assets.js').then(module => module.saveAsset(`/analysis/${result.result_id}.json`, JSON.stringify(Object.assign({genotypes: genotype_prefixes, temporal_windows, regions, subsets: jobs.map(job => job[1]), variant_regions, variants: variants.map(Object.values)}, result, form_data))));
	return Object.assign({}, form_data, result);
};

export const display = async (analysis_id, pyodide = {lib: null}) => {
	const box = errorBox('Loading results', 'Please wait while your results are loaded...');
	const analysis = await fetch(`/analysis/${analysis_id}.json`).then(res => res.json());
	try {
		const collected_results = await import('/jobs.js').then(module => module.collect(analysis));
		const code = await fetch(`/analyses/${analysis.type}.py`).then(res => res.text());
		import('/plot.js').then(module => module.addPythonPlot(pyodide, code, analysis, collected_results));
	} catch (e) {
		errorBox('Error loading results', 'Analysis failed to generate results. If your analysis included a large proportion of variants in the dataset, it may have failed due to memory limits. Try to run your analysis again with less variants.');
	}
	box.remove();
};
