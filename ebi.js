
const findFiles = (id, filter='.') => {
	return fetch(`https://www.ebi.ac.uk/ena/portal/api/filereport?accession=${id}&result=read_run&fields=submitted_ftp&format=json`).then(res => {
		return res.json().then(files => files.map(file => file.submitted_ftp.split(';')).flat().filter(file => file.match(new RegExp(filter))));
	}).catch(e => {
		console.log('Failed to fetch files from accession');
	});
};

export const findSampleFiles = (search, type='bam') => {
	return fetch(`https://www.ebi.ac.uk/ebisearch/ws/rest/sra-sample?query=${search}&format=json`).then(res => {
		return res.json().then(json_data => Promise.all(json_data.entries.map(entry => findFiles(entry.id, `\.${type}$`)))).then(results => results.flat());
	}).catch(e => {
		console.log('Failed to search for term');
	});
};
