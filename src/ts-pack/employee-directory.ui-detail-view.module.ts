import { EntryPoints } from 'N/types';
import * as record from 'N/record';
import * as serverWidget from 'N/ui/serverWidget';
import * as url from 'N/url';
import { scriptUrl, queryExecute, fileLoad } from './employee-directory.library.module';
//import * as log from 'N/log';

export async function generate(context: EntryPoints.Suitelet.onRequestContext, { appName = '', hideNavBar = false, appVersion = '1.0.0' }: { appName?: string; hideNavBar?: boolean; enableDatatables?: boolean; appVersion?: string; }): Promise<void> {
	let employeeId = context.request.parameters.employeeId;
	let employeeRaw = await employeeGet(employeeId);

	if (employeeRaw === null) {
		context.response.write('Error: An error occurred while executing the SuiteQL query.');
		return;
	}

	const employee = { ...employeeRaw, imageurl: await employeeImageUrlGet(employeeId), logins: await employeeLoginsGet(employeeId) };

	//log.debug({ title: 'employee', details: employee });

	if (typeof context.request.parameters.json !== 'undefined') {
		//Request is for raw entity JSON only:
		context.response.write('<pre>' + JSON.stringify(employee, null, 5) + '</pre>');
		return;
	}

	const css = await fileLoad('employee-directory.css');

	let html = await fileLoad('employee-directory.ui-detail-view.template.html');

	let searchRegExp = new RegExp('{{scriptUrl}}', 'g');
	html = html.replace(searchRegExp, scriptUrl());

	searchRegExp = new RegExp('{{appName}}', 'g');
	html = html.replace(searchRegExp, appName);

	searchRegExp = new RegExp('{{appVersion}}', 'g');
	html = html.replace(searchRegExp, appVersion);

	searchRegExp = new RegExp('{{css}}', 'g');
	html = html.replace(searchRegExp, css);

	searchRegExp = new RegExp('{{employeeJson}}', 'g');
	html = html.replace(searchRegExp, JSON.stringify(employee, null, 5));

	if (hideNavBar) {
		html = `<div style="margin:16px">${html}</div>`;
		context.response.write(html);
	}
	else {
		const form = serverWidget.createForm({ title: 'Employee Details', hideNavBar: hideNavBar });
		const htmlField = form.addField({ id: 'custpage_field_html', type: serverWidget.FieldType.INLINEHTML, label: 'HTML' });
		htmlField.defaultValue = html;
		context.response.writePage(form);
	}
}

export interface IEmployeeDetail {
	id: number;
	entityid: string;
	firstname: string;
	lastname: string;
	departmentname: string;
	title: string;
	supervistorid: null | number;
	supervisorname: string;
	phone: string;
	mobilephone: string;
	officephone: string;
	email: string;
	hiredate: string;
	subsidiaryname: string;
	comments: string;
	isinactive: 'T' | 'F';
}

export async function employeeGet(employeeId: number): Promise<null | IEmployeeDetail> {

	//SuiteQL queries return all fields lowercase - this cannot be changed by '... AS camelCase' etc...
	const sql = `
		SELECT
			emp.ID AS id
		,	emp.EntityID AS entityid
		,	emp.FirstName AS firstname
		,	emp.LastName AS lastname
		,	COALESCE(BUILTIN.DF(emp.Department), 'Unknown') AS departmentname
		,	COALESCE(emp.Title, 'Unknown') AS title
		,	emp.Supervisor AS supervisorid
		,	COALESCE(BUILTIN.DF(emp.Supervisor), 'None') AS supervisorname
		,	COALESCE(emp.Phone, '') AS phone
		,	COALESCE(emp.MobilePhone, '') AS mobilephone
		,	COALESCE(emp.OfficePhone, '') AS officephone
		,	emp.Email AS email
		,	emp.HireDate AS hiredate
		,	BUILTIN.DF(emp.Subsidiary) AS subsidiaryname
		,	COALESCE(emp.Comments, '') AS comments
		,	emp.IsInactive AS isinactive
		FROM Employee emp
		WHERE
			emp.id = ${employeeId}
	`;

	const records = (await queryExecute(sql) as unknown) as null | IEmployeeDetail[];
	return records !== null ? records[0] : null;
}


async function employeeImageUrlGet(employeeId: number): Promise<string> {
	const employeeRecord = await record.load.promise({ type: 'employee', id: employeeId, isDynamic: false });
	const imageFileIdValObj = employeeRecord.getValue({ fieldId: 'image' });

	let imageUrl = '';
	if (imageFileIdValObj !== null && imageFileIdValObj.toString() !== '') {
		const sql = `SELECT url FROM File WHERE id = ${imageFileIdValObj.toString()}`;
		const files = await queryExecute(sql) as null | { url: string }[];

		if (files !== null && files.length === 1) {
			const imageFile = files[0];
			const appDomainUrl = url.resolveDomain({ hostType: url.HostType.APPLICATION });
			imageUrl = `https://${appDomainUrl}${imageFile.url}`;
		}
	}

	return imageUrl;
}

export interface IEmployeeLoginAudit {
	datetime: string;
	status: string;
	roleused: string;
}

async function employeeLoginsGet(employeeId: number): Promise<IEmployeeLoginAudit[]> {
	//SuiteQL queries return all fields lowercase - this cannot be changed by '... AS camelCase' etc...
	const sql = `
		SELECT TOP 5
			TO_CHAR(lga.Date, 'YYYY-MM-DD hh:mi:ss') AS datetime
		,	lga.Status AS status
		,	BUILTIN.DF(lga.Role) AS roleused
		FROM LoginAudit lga
		WHERE
			lga.User = ${employeeId}
		ORDER BY
			lga.Date DESC
	`;

	const logins = (await queryExecute(sql) as unknown) as IEmployeeLoginAudit[];
	return logins;
}
