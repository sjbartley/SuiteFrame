/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope Public
 */

/*
----------------------------------------------------------------------------------------------------------
Script Information
----------------------------------------------------------------------------------------------------------

Name:
Employee Directory

ID:
_uh_emp_dir

Description
Employee list/detail forms based on TypeScript/WebPack refactor of To, Dietrich's SuiteFrame framework.

Dependencies
• employee-directory.css
• employee-directory.ui-list-view.html
• employee-directory.ui-detail-view.html

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
2022-06-01 	| Tim Dietrich		| Initial version.
2022-07-25	| Simeon Bartley	| Refactor using TypeScript and WebPack.
			|					|

*/

import { EntryPoints } from "N/types";
import * as log from "N/log";
import * as record from "N/record";
import * as listView from "./employee-directory.ui-list-view.module";
import * as detailView from "./employee-directory.ui-detail-view.module";

const
	appName = 'Employee Directory',
	appVersion = '1.0.0',
	hideNavBar = false,
	enableDatatables = true
	;

export const onRequest: EntryPoints.Suitelet.onRequest = async (context: EntryPoints.Suitelet.onRequestContext): Promise<void> => {
	try {
		if (context.request.method === "POST") {
			await postRequestHandle(context);
		}
		else {
			await getRequestHandle(context);
		}
	}
	catch (e: unknown) {
		log.error({ title: `Failed`, details: `Error: ${(e as Error).message}.` });
	}
}

async function getRequestHandle(context: EntryPoints.Suitelet.onRequestContext): Promise<void> {
	if (typeof context.request.parameters.employeeId === "undefined") {
		await listView.generate(context, { appName, appVersion, hideNavBar, enableDatatables });
	}
	else {
		await detailView.generate(context, { appName, appVersion, hideNavBar });
	}
}

async function postRequestHandle(context: EntryPoints.Suitelet.onRequestContext): Promise<void> {

	log.debug({ title: "postRequestHandle - context", details: context });

	const requestPayload = JSON.parse(context.request.body);

	context.response.setHeader({ name: "Content-Type", value: "application/json" });

	if (typeof requestPayload["function"] === "undefined" || requestPayload["function"] === null) {
		context.response.write(JSON.stringify({ error: "No function was specified." }));
		return;
	}

	switch (requestPayload["function"]) {
		case "employeeNotesUpdate":
			await employeeNotesUpdate(context);
			break;

		default:
			context.response.write(JSON.stringify({ error: "An unsupported function was specified." }));
	}
}

async function employeeNotesUpdate(context: EntryPoints.Suitelet.onRequestContext): Promise<void> {

	interface IUpdatePayload { employeeId: string, comments: string };

	let responsePayload = { "status": "success" };
	let requestPayload: IUpdatePayload = { employeeId: "", comments: "" };

	try {
		requestPayload = JSON.parse(context.request.body) as IUpdatePayload;

		await record.submitFields.promise({
			type: record.Type.EMPLOYEE,
			id: requestPayload.employeeId,
			//enableSourcing: false,
			//ignoreMandatoryFields: true,
			values: {
				"comments": requestPayload.comments
			}
		});
	}
	catch (e: unknown) {
		log.error("Update Error", { "requestPayload": requestPayload, "error": (e as Error).message });
		responsePayload = { "status": "error" };
	}

	log.debug("employeeNotesUpdate - responsePayload", responsePayload);

	context.response.write(JSON.stringify(responsePayload, null, 5));
}
