
import * as query from 'N/query';
import * as file from 'N/file';
import * as log from 'N/log';
import * as url from "N/url";
import * as runtime from "N/runtime";

export type QueryResult = { [key: string]: string | number | boolean };

export function scriptUrl(): string {
	return url.resolveScript(
		{
			scriptId: runtime.getCurrentScript().id,
			deploymentId: runtime.getCurrentScript().deploymentId,
			returnExternalUrl: false
		}
	);
}

export async function fileLoad(fileName: string): Promise<string> {
	const queryPromise = query.runSuiteQL.promise({ query: `SELECT ID FROM File WHERE Name='${fileName}'` });
	const queryResults = (await queryPromise).asMappedResults();
	const fileId = queryResults.length === 0 ? 0 : queryResults[0].id as number;
	let contents = "";
	if (fileId > 0) {
		const fileObj = file.load({ id: fileId });
		contents = fileObj.getContents();
	}
	return contents;
}

export function recordsTableGenerate(records: null | QueryResult[], tableID: string, excludeRowNumber: boolean = false): string {
	if (records === null || records.length === 0) {
		return "";
	}

	const rawColumnNames = Object.keys(records[0]);
	const columnNames = excludeRowNumber ? rawColumnNames.filter(cn => cn.toLowerCase() !== 'rownumber') : rawColumnNames;

	let thead = '<thead class="thead-light">';
	thead += '<tr>';
	columnNames.forEach(cn => thead += `<th>${cn}</th>`);
	thead += '</tr>';
	thead += '</thead>';

	let tbody = '<tbody>';
	for (let r = 0; r < records.length; r++) {
		tbody += '<tr>';
		columnNames.forEach(cn => tbody += `<td>${records[r][cn] ?? ''}</td>`);
		tbody += '</tr>';
	}
	tbody += '</tbody>';

	const html = `<table id="${tableID}" class="styled-table">${thead}${tbody}</table>`;

	return html;
}

export async function queryExecute(sql: string): Promise<null | QueryResult[]> {

	let records: null | QueryResult[] = [];

	try {
		let moreRecords = true;
		let paginatedRowBegin = 1;
		let paginatedRowEnd = 5000;
		let nestedSQL = sql;
		let queryParams = [];

		do {
			const paginatedSQL = `SELECT * FROM ( SELECT ROWNUM AS ROWNUMBER, * FROM (${nestedSQL}) ) WHERE ( ROWNUMBER BETWEEN ${paginatedRowBegin} AND ${paginatedRowEnd})`;
			const queryPromise = query.runSuiteQL.promise({ query: paginatedSQL, params: queryParams });
			const queryResults = (await queryPromise).asMappedResults();
			records = records.concat(queryResults);
			if (queryResults.length < 5000) {
				moreRecords = false;
			}
			paginatedRowBegin = paginatedRowBegin + 5000;
		} while (moreRecords);
	}
	catch (e: unknown) {
		log.error({ title: 'queryExecute - Error', details: (e as Error).message });
		records = null;
	}

	return records;
}
