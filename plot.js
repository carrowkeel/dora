
const posFromCoords = (coords, corners) => {
	const map = document.querySelector('.map');
	const map_dims = [+(map.offsetWidth), +(map.offsetHeight)];
	const map_corners = corners || JSON.parse(map.dataset.corners);
	return [
		((coords[0] - map_corners[0][0]) / (map_corners[1][0] - map_corners[0][0])) * map_dims[0],
		((coords[1] - map_corners[0][1]) / (map_corners[1][1] - map_corners[0][1])) * map_dims[1]
	];
};

const withinBounds = (coords) => {
	const map = document.querySelector('.map');
	const map_dims = [+(map.offsetWidth), +(map.offsetHeight)];
	const map_corners = JSON.parse(map.dataset.corners);
	return coords[0] >= map_corners[0][0] && coords[0] <= map_corners[1][0] && coords[1] >= map_corners[0][1] && coords[1] <= map_corners[1][1];
};

const functionsFromCode = (code) => {
	return Array.from(code.matchAll(/(?:async\s+)?def\s+(\w+)\s*\(.*?\):[\s\S]*?(?=(?:\n\S)|(?:$))/g))
		.filter(f => f[1] !== 'run_analysis').map(f => [f[1], f[1].replace(/_/g, ' '), f[0]]);
};

const toggleLoader = (elem, remove=false) => {
	if (elem.querySelector('.loader') && remove)
		return elem.querySelector('.loader').remove();
	else if (remove)
		return;
	const loader = document.createElement('div');
	loader.classList.add('loader');
	loader.style.width = elem.offsetWidth + 'px';
	loader.style.height = elem.offsetHeight + 'px';
	loader.innerHTML = `<svg width="50" height="50" viewBox="0 0 50 50"><circle cx="25" cy="25" r="20" fill="none" stroke="#aaaaaa" stroke-width="6" stroke-dasharray="40 60"></circle><circle cx="25" cy="25" r="20" fill="none" stroke="#cccccc" stroke-width="6" stroke-dasharray="50 60"></circle></svg>`;
	elem.appendChild(loader);
};

const addPythonPlot = async (pyodide, code, options, results) => {
	const plot_elem = document.createElement('div');
	plot_elem.classList.add('plot', 'moveable');
	const function_list = functionsFromCode(code);
	plot_elem.innerHTML = `<div class="header"><a data-icon="x" data-action="close" class="right"></a>${options.title || 'Results'}</div><div class="img-content"></div><div class="tabbed-content"><div class="tabs">${function_list.map(f => `<a data-tab="${f[0]}">${f[1]}</a>`).join('')}</div>${function_list.map((f, i) => `<div class="code${i === 0 ? ' selected' : ''}" data-tab-content="${f[0]}"><textarea name="code">${f[2]}</textarea></div>`).join('')}</div><div class="sub"><a class="right button" data-action="update">Update</a><a class="right button" data-action="save">Save</a><a class="right button" data-action="export-data">Export</a></div>`;
	document.querySelector('.map-container').appendChild(plot_elem);
	const container = loadDrawingArea(plot_elem.querySelector('.img-content'), 'python', 2);
	plot_elem.addEventListener('click', async e => {
		switch(true) {
			case e.target.matches('[data-action="update"]'): {
				toggleLoader(plot_elem.querySelector('.img-content'));
				const code = plot_elem.querySelector('.code.selected [name="code"]').value;
				const function_name = plot_elem.querySelector('.code.selected').dataset.tabContent;
				draw.python.clear(container);
				try {
					await draw.python.matplotlib(container, `${code}\n${function_name}(options, results)`, {options, results}, pyodide).then(lib => pyodide.lib = lib);
				} catch (e) {
					console.log(e);
				}
				toggleLoader(plot_elem.querySelector('.img-content'), true);
				break;
			}
			case e.target.matches('[data-action="export-data"]'): {
				toggleLoader(plot_elem.querySelector('.img-content'));
				const code = plot_elem.querySelector('.code.selected [name="code"]').value;
				const function_name = plot_elem.querySelector('.code.selected').dataset.tabContent;
				try {
					const csv_url = await draw.python.export(container, `${code}\ntable_data=${function_name}(options, results)\n`, {options, results}, pyodide);
					const response = await fetch(csv_url);
					const data = await response.blob();
					const url = window.URL.createObjectURL(data);
					const link_elem = document.createElement('a');
					link_elem.href = url;
					link_elem.download = 'plot_data.csv';
					document.body.appendChild(link_elem);
					link_elem.click();
					window.URL.revokeObjectURL(url);
					document.body.removeChild(link_elem);
				} catch (e) {
					console.log(e);
				}
				toggleLoader(plot_elem.querySelector('.img-content'), true);
				break;
			}
			case e.target.matches('[data-action="save"]'): {
				const image_url = plot_elem.querySelector('.img-content img').getAttribute('src');
				if (!image_url)
					return;
				const response = await fetch(image_url);
				const data = await response.blob();
				const url = window.URL.createObjectURL(data);
				const link_elem = document.createElement('a');
				link_elem.href = url;
				link_elem.download = 'plot.png';
				document.body.appendChild(link_elem);
				link_elem.click();
				window.URL.revokeObjectURL(url);
				document.body.removeChild(link_elem);
				break;
			}
		}
	});
	plot_elem.querySelector('[data-action="update"]').click();
};

const draw = {
	svg:  {
		create: (parentElement, dims) => {
			const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
			svg.setAttribute('width', dims[0]);
			svg.setAttribute('height', dims[1]);
			svg.setAttribute('viewBox', `0 0 ${dims[0]} ${dims[1]}`);
			svg.setAttribute('preserveAspectRatio', 'none');
			svg.dataset.width = dims[0];
			svg.dataset.height = dims[1];
			parentElement.appendChild(svg);
			return svg; // {element: svg, type: 'svg', draw: draw.svg};
		},
		load: (svg) => {
			return svg; // {element: svg, type: 'svg', draw: draw.svg};
		},
		element: (svg, type, props) => {
			const element = document.createElementNS('http://www.w3.org/2000/svg', type);
			for (const prop in props)
				element.setAttribute(prop, props[prop]);
			svg.appendChild(element);
			return element;
		},
		clear: (svg, selector='*', exclude='[data-region]') => {
			svg.querySelectorAll(`${selector}:not(${exclude})`).forEach(item => svg.removeChild(item));
		},
		fill: (svg, fill, opacity=1, data={}) => {
			draw.svg.rect(svg, 0, 0, +(svg.dataset.width), +(svg.dataset.height), fill, opacity, data);
		},
		bar: (svg, data_x, data_y, data_width, bounds, fill=[0, 0, 0], opacity=1, data={}) => {
			const dims = [+(svg.dataset.width), +(svg.dataset.height)];
			const x = dims[0] * data_x / (bounds[0][1] - bounds[0][0]) - bounds[0][0];
			const y = dims[1] * data_y / (bounds[1][1] - bounds[1][0]) - bounds[1][0];
			const width = dims[0] * data_width / (bounds[0][1] - bounds[0][0]);
			draw.svg.element(svg, 'rect', {x, y: dims[1] - y, width, height: y, fill: `rgb(${fill.join(',')})`, opacity, ...data});
		},
		plot: (svg, x, y, xlim, ylim, stroke=[0, 0, 0], opacity=1, data={}) => {
			const dims = [+(svg.dataset.width), +(svg.dataset.height)];
			const points = range(0, x.length).map(i => [((x[i] - xlim[0]) / (xlim[1] - xlim[0])) * (dims[0]), (1 - (y[i] - ylim[0]) / (ylim[1] - ylim[0])) * dims[1]]);
			draw.svg.polyline(svg, points, stroke, opacity, data);
		},
		point: (svg, x, y, xlim, ylim, r=3, fill=[0, 0, 0], opacity=1, data={}) => {
			const dims = [+(svg.dataset.width), +(svg.dataset.height)];
			const point = [((x - xlim[0]) / (xlim[1] - xlim[0])) * (dims[0]), (1 - (y - ylim[0]) / (ylim[1] - ylim[0])) * dims[1]];
			draw.svg.circle(svg, point[0], point[1], r, fill, opacity, data);
		},
		rect: (svg, x, y, width, height, fill=[0, 0, 0], opacity=1, data={}) => {
			draw.svg.element(svg, 'rect', {x, y, width, height, fill: `rgb(${fill.join(',')})`, opacity, ...data});
		},
		circle: (svg, x, y, r=3, fill=[0, 0, 0], opacity=1, data={}) => {
			draw.svg.element(svg, 'circle', {cx: x, cy: y, r, fill: `rgb(${fill.join(',')})`, opacity, ...data});
		},
		polygon: (svg, points, fill=[0, 0, 0], opacity=1, data={}) => {
			draw.svg.element(svg, 'polygon', {points: points.map(v => v.join(',')).join(' '), fill: `rgba(${fill.join(',')})`, opacity, ...data});
		},
		polyline: (svg, points, stroke=[0, 0, 0], opacity=1, data={}) => {
			draw.svg.element(svg, 'polyline', {points: points.map(v => v.join(',')).join(' '), stroke: `rgba(${stroke.join(',')})`, fill: 'none', opacity, ...data});
		},
		text: (svg, x, y, text, data={}) => {
			const elem = draw.svg.element(svg, 'text', {x, y, ...data});
			elem.innerHTML = text;
		},
	},
	python: {
		create: (parentElement, dims) => {
			const container = document.createElement('div');
			container.setAttribute('width', dims[0]);
			container.setAttribute('height', dims[1]);
			container.dataset.width = dims[0];
			container.dataset.height = dims[1];
			parentElement.appendChild(container);
			return container;
		},
		clear: (container) => {
			container.querySelectorAll('img').forEach(elem => elem.remove());
		},
		export: async (container, code, data, _pyodide) => {
			await new Promise(resolve => {
				if ('loadPyodide' in window)
					return resolve();
				const script = document.createElement("script");
				script.src = '/pyodide/dist/pyodide.js';
				script.onload = resolve;
				document.head.appendChild(script);
			});
			const pyodide = _pyodide.lib || await loadPyodide({stderr: () => {}});
			if (!_pyodide.lib)
				await pyodide.loadPackage(['numpy', 'matplotlib', 'scipy'], {messageCallback: () => {}, errorCallback: () => {}});

			for (const prop in data)
				pyodide.globals.set(prop, pyodide.toPy(data[prop]));

			const python_code = `import numpy as np
import matplotlib.pyplot as plt

fig = plt.figure()

${code}

`;

			try {
				container.querySelectorAll('.error').forEach(elem => elem.remove());
				await pyodide.runPythonAsync(python_code);
				const csv_data = pyodide.globals.get('table_data');
				const id = Math.round(Math.random() * 1e8);
				await caches.open('mdx_cache_adna').then(async (cache) => {
					const response = new Response(new Blob([csv_data.map(row => row.join(',')).join('\n')+'\n'], {type: 'text/csv;charset=utf-8'}), {
						headers: {'Content-Type': 'text/plain'}
					});
					return cache.put(new Request(`/images/plot_${id}.csv`), response);
				});
				return `/images/plot_${id}.csv`;
			} catch (e) {
				const error_box = document.createElement('div');
				error_box.classList.add('error');
				error_box.innerHTML = `<pre>${e}</pre>`;
				container.appendChild(error_box);
			}
			return pyodide;
		},
		matplotlib: async (container, code, data, _pyodide) => {
			await new Promise(resolve => {
				if ('loadPyodide' in window)
					return resolve();
				const script = document.createElement("script");
				script.src = '/pyodide/dist/pyodide.js';
				script.onload = resolve;
				document.head.appendChild(script);
			});
			const pyodide = _pyodide.lib || await loadPyodide({stderr: () => {}});
			if (!_pyodide.lib)
				await pyodide.loadPackage(['numpy', 'matplotlib', 'scipy'], {messageCallback: () => {}, errorCallback: () => {}});

			const ratio = +(container.dataset.width) / +(container.dataset.height);
			const dims = [10, 10 / ratio];

			for (const prop in data)
				pyodide.globals.set(prop, pyodide.toPy(data[prop]));

			const python_code = `import numpy as np
import matplotlib.pyplot as plt
import io
import base64

fig = plt.figure(figsize=(${dims.join(',')}))

${code}

bytes_image = io.BytesIO()
plt.savefig(bytes_image, format='png')
bytes_image.seek(0)
base64_bytes = base64.b64encode(bytes_image.read())
base64_image = base64_bytes.decode()

bytes_image_svg = io.BytesIO()
plt.savefig(bytes_image_svg, format='svg')
bytes_image_svg.seek(0)
base64_bytes_svg = base64.b64encode(bytes_image_svg.read())
base64_image_svg = base64_bytes_svg.decode()
`;

			try {
				container.querySelectorAll('.error').forEach(elem => elem.remove());
				await pyodide.runPythonAsync(python_code);
				const base64Image = pyodide.globals.get('base64_image');
				const base64ImageSVG = pyodide.globals.get('base64_image_svg');
				const id = Math.round(Math.random() * 1e8);
				await caches.open('mdx_cache_adna').then(async (cache) => {
					const blob = await fetch(`data:image/png;base64,${base64Image}`).then(r => r.blob());
					const response = new Response(blob, {
						headers: {'Content-Type': 'image/png'}
					});
					return cache.put(new Request(`/images/plot_${id}.png`), response);
				});
				await caches.open('mdx_cache_adna').then(async (cache) => {
					const blob = await fetch(`data:image/svg;base64,${base64ImageSVG}`).then(r => r.blob());
					const response = new Response(blob, {
						headers: {'Content-Type': 'image/svg'}
					});
					return cache.put(new Request(`/images/plot_${id}.svg`), response);
				});
				const img = document.createElement('img');
				img.src = `/images/plot_${id}.png`;
				container.appendChild(img);
			} catch (e) {
				const error_box = document.createElement('div');
				error_box.classList.add('error');
				error_box.innerHTML = `<pre>${e}</pre>`;
				container.appendChild(error_box);
			}
			return pyodide;
		}
	}
};

const drawIndividualMap = (draw_area, position, origin, color=[0, 0, 0], opacity, json='', sample_id='') => {
	const point = posFromCoords(position, origin);
	draw.svg.circle(draw_area, point[0], point[1], 4, color, opacity, {class: 'individual', 'data-info': json, 'data-id': sample_id});
};

const loadDrawingArea = (parentElement, type='svg', ratio=2) => {
	if (parentElement.dataset.dims) {
		return draw[type].create(parentElement, JSON.parse(parentElement.dataset.dims));
	} else {
		const dims = [parentElement.offsetWidth, parentElement.offsetWidth / ratio];
		parentElement.dataset.dims = JSON.stringify(dims);
		parentElement.dataset.offset = JSON.stringify([0, 0]);
		parentElement.dataset.zoom = 1;
		parentElement.dataset.ratio = ratio;
		parentElement.style.width = dims[0];
		parentElement.style.height = dims[1];
		return draw[type].create(parentElement, dims);
	}
	
};

export { loadDrawingArea, drawIndividualMap, draw, addPythonPlot }
