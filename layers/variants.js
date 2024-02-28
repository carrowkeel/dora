
const hooks = [
	['[data-info]', 'mouseover', e => {
		const html = e.target.dataset.info;
		const infobox = e.target.closest('.variants').querySelector('.info');
		infobox.classList.add('show');
		infobox.innerHTML = html;
		infobox.style.left = (e.offsetX + 5) + 'px';
		infobox.style.top = (e.offsetY + 5) + 'px';
	}],
	['[data-info]', 'mouseout', e => {
		e.target.closest('.variants').querySelector('.info').classList.remove('show');
	}]
];

export const init = (layer, identifier, options) => {
	addHooks(layer, hooks);
};

export const refresh = async (layer, identifier, options) => {
	const chromosome_lengths = {
		'1': 249250621,
		'2': 243199373,
		'3': 198022430,
		'4': 191154276,
		'5': 180915260,
		'6': 171115067,
		'7': 159138663,
		'8': 146364022,
		'9': 141213431,
		'10': 135534747,
		'11': 135006516,
		'12': 133851895,
		'13': 115169878,
		'14': 107349540,
		'15': 102531392,
		'16': 90354753,
		'17': 81195210,
		'18': 78077248,
		'19': 59128983,
		'20': 63025520,
		'21': 48129895,
		'22': 51304566,
		'X': 155270560,
		'Y': 59373566
	};
	const map = document.querySelector('.map'); // Put options in higher level element
	const draw = await import('/plot.js').then(plot => plot.draw);
	draw.svg.clear(layer);
	const width = +(layer.dataset.width);
	const height = +(layer.dataset.height);	
	const genome_size = Object.values(chromosome_lengths).reduce((acc, val) => acc + val, 0);
	const chromosome_count = Object.keys(chromosome_lengths).length;
	const gap_size = 10000000;
	const scale_factor = width / (genome_size + (chromosome_count + 1) * gap_size);
	const y_offset = height / 2;
	let x_pos = gap_size * scale_factor;
	const chrom_start_positions = {};
	for (const [chrom, length] of Object.entries(chromosome_lengths)) {
		chrom_start_positions[chrom] = x_pos;
		draw.svg.element(layer, 'line', {x1: x_pos, x2: x_pos + length * scale_factor, y1: y_offset, y2: y_offset, class: 'chromosome'});
		draw.svg.text(layer, x_pos, y_offset - 20, `chr${chrom}`, {class: 'chromosome-label'});
		x_pos += (length + gap_size) * scale_factor;
	}
	const variants = getOptions().variants || [];
	for (const variant of variants) {
		switch(variant.type) {
			case 'rsid': {
				variant.chr = 1;
				variant.pos = 0;
				const chrom_start = chrom_start_positions[variant.chr];
				const variant_position = chrom_start + variant.pos * scale_factor;
				draw.svg.element(layer, 'circle', {cx: variant_position, cy: y_offset, r: 5, 'class': 'variant', 'data-rsid': variant.rsid, 'data-info': `${variant.rsid} ${variant.chr}:${variant.pos}`});
				break;
			}
			case 'range': {
				const [_chr, range] = variant.range.split(':');
				if (!range)
					continue;
				const chr = _chr.replace(/^chr/, '');
				const pos = range.split('-').map(v => +(v));
				const chrom_start = chrom_start_positions[chr];
				const [x1, x2] = pos.map(pos => chrom_start + pos * scale_factor);
				draw.svg.element(layer, 'rect', {x: x1, y: y_offset - 10, width: x2 - x1, height: 20, 'class': 'variant-range', 'data-range': variant.range, 'data-info': variant.range});
				break;
			}
		}
	}
};

export const zoom = async (layer, identifier, options) => {
	return true;
};
