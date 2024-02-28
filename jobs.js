
const generateID = (k=16) => Array(k).fill(0).map(() => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.charAt(Math.floor(Math.random() * 62))).join('');

const pollResult = async (url, init_time=Math.round(new Date().getTime() / 1000), timeout=300, increment=5) => {
	const time_offset = Math.round(new Date().getTime() / 1000) - init_time;
	let retries = -1;
	while ((retries === -1 ? 0 : time_offset) + (++retries * (retries * increment) / 2) <= timeout) {
		await new Promise(resolve => setTimeout(resolve, increment * retries * 1000));
		try {
			const response = await fetch(url, {cache: 'no-cache', headers: {'Cache-Control': 'no-cache'}});
			if (!response.ok)
				throw 'Request failed';
			return response.json();
		} catch (e) {
			// Depending on fetch error, maybe stop polling
		}
	}
	throw 'Failed to load S3 object';
};

const deployToAWS = async (job) => { // Compression on payload
	const request = await fetch(`https://d.modelrxiv.org/adna`, {method: 'post', body: JSON.stringify(job)}).then(res => res.json());
	return {job_id: request.job_uid};
};

const deployToWorker = (workers, job, job_id = generateID()) => {
	const worker = new Worker('/worker.js');
	workers.push(worker);
	worker.postMessage({job_id, job});
	const handle_response = e => {
		const message = e.data;
		if (message.type === 'error') {
			console.log('worker error', message);
			worker.terminate();
		}
	};
	worker.addEventListener('message', handle_response);
	return {job_id};
};

export const collect = async (result) => {
	// Try to download parts of job, stop once one fails
	const parts = [];
	for (const job of result.jobs) {
		const result_part = job.job_id ? await pollResult(`/results/${job.job_id}.json`, result.time) : [];
		if (result_part === null)
			throw 'Empty result received';
		parts.push(result_part);
	}
	return parts;
};

export const distribute = async (jobs, workers = [], result_id = generateID()) => {
	const requests = await Promise.all(jobs.map(job => {
		if (job.subsets !== undefined && job.subsets.flat(Infinity).length === 0)
			return {job_id: false};
		switch(true) {
			case job.bed_prefix.startsWith('/public/'):
				return deployToAWS(job);
			default:
				return deployToWorker(workers, job);
		}
	}));
	return {result_id, jobs: requests, time: Math.round(new Date().getTime() / 1000)};
};
