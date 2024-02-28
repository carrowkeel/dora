
export const ncbiFromTerms = async (term, retries=0, max_retries=2) => {
	const parts = term.replace(/([a-z])([A-Z0-9])/g, '$1 $2').split(' ').filter(v => v.match(/[A-Z0-9]/));
	const first_author = parts[0];
	const journal = parts.slice(1, -1).join(' ');
	const year = parts[parts.length - 1];
	try {
		const search_results = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?format=json&db=pubmed&term=${encodeURIComponent(`(${year}/01/01:${year}/12/31[Date - Publication] AND "${journal}"[Journal] AND ("dna, ancient"[MeSH Terms] OR ("dna"[All Fields] OR "ancient"[All Fields]) OR "ancient dna"[All Fields] OR ("ancient"[All Fields] AND "dna"[All Fields]))) AND (${first_author}[Author - First])`)}`).then(res => res.json()).then(res => res.esearchresult.idlist);
		if (search_results.length === 0)
			throw 'No results';
		const entries = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${search_results.join(',')}&format=json`).then(res => res.json());
		const urls = search_results.map(result_id => `https://doi.org/${entries.result[result_id].elocationid.replace('doi: ', '')}`);
		return urls;
	} catch (e) {
		if (retries < max_retries)
			return ncbiFromTerms([first_author, parts.slice(2, -1).join(''), year].join(''), retries + 1);
		return [];
	};
};