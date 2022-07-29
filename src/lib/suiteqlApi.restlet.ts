/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @NModuleScope SameAccount
 */

/*
------------------------------------------------------------------------------------------
Script Information
------------------------------------------------------------------------------------------

Name
SuiteQL API

ID
_suiteql_api_restlet

Description
A RESTlet that serves as an RPC-style API for SuiteQL.

Non-Explicit Dependencies
[None]

Build Options
• Simply transpile -> dependency files must also be uploaded.
• Pack -> no local dependencies need be uploaded.

----------------------------------------------------------------------------------------------------------
Developer(s)
----------------------------------------------------------------------------------------------------------

• Tim Dietrich
• Simeon Bartley

----------------------------------------------------------------------------------------------------------
History
----------------------------------------------------------------------------------------------------------

Date		| Author			| Notes
------------|-------------------|-------------------------------------------------------------------------
2022-07-22 	| Simeon Bartley	| Documentation header updated.
			|					|
*/

import { EntryPoints } from "N/types";
import * as query from "N/query";
import * as search from "N/search";
import { throwError } from "./throwError";

interface IRouteBaseParameters {
	function?: string
}

interface ISuiteQLRunUnpagedParameters {
	sql?: string;
}

interface ISavedSearchRunUnpagedParameters {
	searchId?: string;
}

interface ISuiteQLRunPagedParameters {
	sql?: string;
	pageSize?: number;
	pageNumber?: number;
}

interface ISuiteQlUnpagedResultJson {
	items: unknown[];
}

interface ISuiteQlPagedResultJson {
	totalResults: number;
	count: number;
	offset: number;
	hasMore: boolean;
	pageSize: number,
	pageNumber: number,
	items: unknown[];
}

type IAllRequestParameters = IRouteBaseParameters & ISuiteQLRunUnpagedParameters & ISuiteQLRunPagedParameters & ISavedSearchRunUnpagedParameters;

export const post: EntryPoints.RESTlet.post = async (requestParameters: IAllRequestParameters): Promise<string> => {
	try {
		if (typeof requestParameters.function === "undefined" || requestParameters.function === "") {
			throwError("No function was specified.");
		}

		switch (requestParameters.function) {
			case "sqlRunUnpaged":
				return JSON.stringify(await sqlRunUnpaged(requestParameters));
			case "sqlRunPaged":
				return JSON.stringify(await sqlRunPaged(requestParameters));
			case "savedSearchRunUnpaged":
				return JSON.stringify(await savedSearchRunUnpaged(requestParameters));
			default:
				throwError("Unsupported function.");
		}
	}
	catch (e: unknown) {
		return JSON.stringify({ "error": (e as Error).message });
	}
}

/** Unpaged queries use .run() which will return up to 4000 records. */
async function savedSearchRunUnpaged(requestParameters: ISavedSearchRunUnpagedParameters): Promise<ISuiteQlUnpagedResultJson> {
	if (typeof requestParameters.searchId === "undefined" || requestParameters.searchId === "") {
		throwError("No saved search specified.");
	}

	try {
		const searchObj = await search.load.promise({ id: requestParameters.searchId });
		const response = { items: [] };
		const resultSet = searchObj.run();
		let start = 0;
		let results = [];

		do {
			results = await resultSet.getRange.promise({ start: start, end: start + 1000 });
			start += 1000;
			response.items = response.items.concat(results);
		}
		while (results.length > 0);
		return response;
	}
	catch (e: unknown) {
		throwError((e as Error).message);
	}
}

/** Unpaged queries will return up to 5000 records. */
async function sqlRunUnpaged(requestParameters: ISuiteQLRunUnpagedParameters): Promise<ISuiteQlUnpagedResultJson> {
	if (typeof requestParameters.sql === "undefined" || requestParameters.sql === "") {
		throwError("No SQL specified.");
	}

	try {
		const res = await query.runSuiteQL.promise({ query: requestParameters.sql });
		const records = res.asMappedResults();
		return {
			"items": records
		};
	}
	catch (e: unknown) {
		throwError((e as Error).message);
	}
}

/** Paged query handler - useful where > 5000 records may be required, or subsets are desirable. */
async function sqlRunPaged(requestParameters: ISuiteQLRunPagedParameters): Promise<ISuiteQlPagedResultJson> {
	if (typeof requestParameters.sql === "undefined" || requestParameters.sql === "") {
		throwError("No SQL specified.");
	}

	const maxPageSize = 5000;

	let pageSize = typeof requestParameters.pageSize === "undefined" ? maxPageSize : Number.parseInt(requestParameters.pageSize.toString());
	if (pageSize < 0) {
		pageSize = maxPageSize;
	}

	let pageNumber = typeof requestParameters.pageNumber === "undefined" ? 1 : Number.parseInt(requestParameters.pageNumber.toString());
	if (pageNumber < 1) {
		pageNumber = 1;
	}

	try {
		const res = await query.runSuiteQLPaged.promise({ query: requestParameters.sql, pageSize: pageSize });
		let items: unknown[] = [];
		let hasMore = false;
		if (res.pageRanges.length > 0) {
			pageNumber = pageNumber <= res.pageRanges.length ? pageNumber : 1;
			const page = res.fetch(pageNumber - 1);
			items = page.data.asMappedResults();
			hasMore = !page.isLast;
		}

		return {
			"totalResults": res.count,
			"count": items.length,
			"offset": (pageNumber - 1) * res.pageSize,
			"hasMore": hasMore,
			"pageSize": res.pageSize,
			"pageNumber": pageNumber,
			"items": items
		};
	}
	catch (e: unknown) {
		throwError((e as Error).message);
	}
}
