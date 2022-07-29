import { EntryPoints } from "N/types";
import * as serverWidget from "N/ui/serverWidget";
import { scriptUrl, queryExecute, recordsTableGenerate, fileLoad } from "./employee-directory.library.module";

/**
 * Server page generation - writes to context.response.
 *
 * 1) Loads text from css file and writes to head style element.
 * 2) Loads html handlebars template file and manually replaces certain placeholders. This template also links style/script files from CDNJS.
 *
 */
export async function generate(context: EntryPoints.Suitelet.onRequestContext, { appName = '', hideNavBar = false, enableDatatables = true, appVersion = '1.0.0' }: { appName?: string; hideNavBar?: boolean; enableDatatables?: boolean; appVersion?: string; }): Promise<void> {

	let html = 'List View';

	//SuiteQL queries return all fields lowercase - this cannot be changed by '... AS camelCase' etc...
	const sql = `
		SELECT
			'<a href="${scriptUrl()}&employeeId=' || emp.ID || '">Details</a>' AS link
		,	emp.LastName || ', ' || emp.FirstName AS name
		,	emp.ID AS id
		,	BUILTIN.DF(emp.Department) AS departmentname
		,	emp.Title AS title
		,	BUILTIN.DF(emp.Supervisor) AS supervisorname
		,	'<a href="tel:' || emp.Phone || '">' || emp.Phone || '</a>' AS phone
		,	'<a href="mailto:' || emp.Email || '">' || emp.Email || '</a>' AS email
		FROM Employee emp
		ORDER BY
			emp.LastName
		,	emp.FirstName
	`;

	const records = await queryExecute(sql);

	if (records !== null) {
		if (typeof context.request.parameters.json !== 'undefined') {
			html = '<pre>' + JSON.stringify(records, null, 5) + '</pre>';
		}
		else {
			const tableID = 'employeesTable';

			const table = recordsTableGenerate(records, tableID, true);

			const css = await fileLoad('employee-directory.css');

			html = await fileLoad('employee-directory.ui-list-view.template.html');

			let searchRegExp = new RegExp('{{scriptUrl}}', 'g');
			html = html.replace(searchRegExp, scriptUrl());

			searchRegExp = new RegExp('{{appName}}', 'g');
			html = html.replace(searchRegExp, appName);

			searchRegExp = new RegExp('{{appVersion}}', 'g');
			html = html.replace(searchRegExp, appVersion);

			searchRegExp = new RegExp('{{css}}', 'g');
			html = html.replace(searchRegExp, css);

			searchRegExp = new RegExp('{{table}}', 'g');
			html = html.replace(searchRegExp, table);

			searchRegExp = new RegExp('{{tableID}}', 'g');
			html = html.replace(searchRegExp, tableID);

			searchRegExp = new RegExp('{{enableDatatables}}', 'g');
			html = html.replace(searchRegExp, enableDatatables ? 'true' : 'false');

			if (hideNavBar) {
				html = `<div style="margin:16px">${html}</div>`;
			}
		}
	}
	else {
		html = 'Error: An error occurred while executing the SuiteQL query.';
	}

	const form = serverWidget.createForm({ title: appName, hideNavBar: hideNavBar });
	const htmlField = form.addField({ id: 'custpage_field_html', type: serverWidget.FieldType.INLINEHTML, label: 'HTML' });
	htmlField.defaultValue = html;
	context.response.writePage(form);
}
