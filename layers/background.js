
export const init = (layer, identifier, options) => {
	return refresh(layer, identifier, options);
};

export const refresh = async (layer, identifier, options) => {
	if (layer.children.length !== 0)
		return;
	const plot = await import('/plot.js');
	plot.draw.svg.element(layer, 'image', {href: identifier, width: layer.dataset.width, height: layer.dataset.height});
};

export const zoom = async (layer, identifier, options) => {
	return false; // Zoom to coords
};