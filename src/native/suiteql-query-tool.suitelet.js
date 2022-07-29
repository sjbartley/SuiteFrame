/**
* @NApiVersion 2.1
* @NScriptType Suitelet
* @NModuleScope Public
*/

/*

------------------------------------------------------------------------------------------
Script Information
------------------------------------------------------------------------------------------

Name:
SuiteQL Query Tool

ID:
_suiteql_query_tool

Description
A utility for running SuiteQL queries in a NetSuite instance.


------------------------------------------------------------------------------------------
MIT License
------------------------------------------------------------------------------------------

Copyright (c) 2021 Timothy Dietrich.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


------------------------------------------------------------------------------------------
Developer(s)
------------------------------------------------------------------------------------------

Tim Dietrich
* timdietrich@me.com
* https://timdietrich.me


------------------------------------------------------------------------------------------
History
------------------------------------------------------------------------------------------

20210714 - Tim Dietrich
* First public beta of v2021.2.

20210725 - Tim Dietrich
* Second public beta of v2021.2.

20211027 - Tim Dietrich
* Production release of v2021.2.
* Adds support for "virtual views" and option to suppress "total rows count."
* Adds support for running queries based on the selected text in the query textarea.
* The Tables Reference now opens in its own tab.
* Removed upgrade functionality.

*/

var
	datatablesEnabled = true,
	remoteLibraryEnabled = true,
	rowsReturnedDefault = 25,
	queryFolderID = null,
	toolUpgradesEnabled = true,
	workbooksEnabled = false;

var
	file,
	https,
	log,
	page,
	query,
	record,
	render,
	runtime,
	scriptURL,
	url,
	version = '2021.2';


define( [ 'N/file', 'N/https', 'N/log', 'N/ui/message', 'N/query', 'N/record', 'N/render', 'N/runtime', 'N/ui/serverWidget', 'N/url' ], main );


function main( fileModule, httpsModule, logModule, messageModule, queryModule, recordModule, renderModule, runtimeModule, serverWidgetModule, urlModule ) {

	file = fileModule;
	https = httpsModule;
	log = logModule;
	message = messageModule;
	query= queryModule;
	record = recordModule;
	render = renderModule;
	runtime = runtimeModule;
	serverWidget = serverWidgetModule;
	url = urlModule;

    return {

    	onRequest: function( context ) {

			scriptURL = url.resolveScript( { scriptId: runtime.getCurrentScript().id, deploymentId: runtime.getCurrentScript().deploymentId, returnExternalURL: false } );

    		if ( context.request.method == 'POST' ) {
    			postRequestHandle( context );
    		} else {
    			getRequestHandle( context );
			}

        }

    }

}


function documentGenerate( context ) {

	try {

		var sessionScope = runtime.getCurrentSession();

		var docInfo = JSON.parse( sessionScope.get( { name: 'suiteQLDocumentInfo' } ) );

		var moreRecords = true;

		var paginatedRowBegin = docInfo.rowBegin;

		var paginatedRowEnd = docInfo.rowEnd;

		var queryParams = new Array();

		var records = new Array();

		do {

			var paginatedSQL = 'SELECT * FROM ( SELECT ROWNUM AS ROWNUMBER, * FROM (' + docInfo.query + ' ) ) WHERE ( ROWNUMBER BETWEEN ' + paginatedRowBegin + ' AND ' + paginatedRowEnd + ')';

			var queryResults = query.runSuiteQL( { query: paginatedSQL, params: queryParams } ).asMappedResults();

			records = records.concat( queryResults );

			if ( queryResults.length < 5000 ) { moreRecords = false; }

			paginatedRowBegin = paginatedRowBegin + 5000;

		} while ( moreRecords );

		var recordsDataSource = { 'records': records };

		var renderer = render.create();
		renderer.addCustomDataSource( { alias: 'results', format: render.DataSource.OBJECT, data: recordsDataSource } );
		renderer.templateContent = docInfo.template;

		if ( docInfo.docType == 'pdf' ) {
			let renderObj = renderer.renderAsPdf();
			let pdfString = renderObj.getContents();
			context.response.setHeader( 'Content-Type', 'application/pdf' );
			context.response.write( pdfString );
		} else {
			let htmlString = renderer.renderAsString();
			context.response.setHeader( 'Content-Type', 'text/html' );
			context.response.write( htmlString );
		}

	} catch( e ) {

		log.error( { title: 'documentGenerate Error', details: e } );

		context.response.write( 'Error: ' + e );

	}

}


function documentSubmit( context, requestPayload ) {

	try {

		var responsePayload;

		var sessionScope = runtime.getCurrentSession();

		sessionScope.set( { name: 'suiteQLDocumentInfo', value: JSON.stringify( requestPayload ) } );

		responsePayload = { 'submitted': true }

	} catch( e ) {

		log.error( { title: 'queryExecute Error', details: e } );

		responsePayload = { 'error': e }

	}

	context.response.write( JSON.stringify( responsePayload, null, 5 ) );

}


function getRequestHandle( context ) {

	if ( context.request.parameters.hasOwnProperty( 'function' ) ) {

		if ( context.request.parameters['function'] == 'tablesReference' ) { htmlGenerateTablesReference( context ); }

		if ( context.request.parameters['function'] == 'documentGenerate' ) { documentGenerate( context ); }

	} else {

		var form = serverWidget.createForm( { title: `SuiteQL Query Tool`, hideNavBar: false } );

		var htmlField = form.addField(
			{
				id: 'custpage_field_html',
				type: serverWidget.FieldType.INLINEHTML,
				label: 'HTML'
			}
		);

		htmlField.defaultValue = htmlGenerateTool();

		context.response.writePage( form );

	}

}


function htmlDataTablesFormatOption() {

	if ( datatablesEnabled === true ) {

		return `
			<div class="form-check-inline">
				<label class="form-check-label" style="font-size: 10pt;">
					<input type="radio" class="form-check-input" name="resultsFormat" value="datatable" onChange="responseGenerate();">DataTable
				</label>
			</div>
 		`

	} else {

		return ``

	}

}


function htmlEnableViewsOption() {

	if ( queryFolderID !== null ) {

		return `
			<div style="margin-top: 12px; border-top: 1px solid #eee; padding-top: 12px;">
				<div class="form-check" style="margin-top: 6px;">
					<label class="form-check-label" style="font-size: 10pt;">
						<input type="checkbox" class="form-check-input" id="enableViews" checked>Enable Virtual Views
					</label>
				</div>
			</div>
		`;

	} else {
		return ``
	}

}


function htmlGenerateTablesReference( context ) {

	var form = serverWidget.createForm( { title: 'SuiteQL Tables Reference', hideNavBar: false } );

	var htmlField = form.addField(
		{
			id: 'custpage_field_html',
			type: serverWidget.FieldType.INLINEHTML,
			label: 'HTML'
		}
	);

	htmlField.defaultValue = `

		<link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/bootstrap/4.5.2/css/bootstrap.min.css">
		<script src="/ui/jquery/jquery-3.5.1.min.js"></script>
		<script src="https://maxcdn.bootstrapcdn.com/bootstrap/4.5.2/js/bootstrap.min.js"></script>
		${jsFunctionDataTablesExternals()}

		<style type = "text/css">

			input[type="text"], input[type="search"], textarea, button {
				outline: none;
				box-shadow:none !important;
				border: 1px solid #ccc !important;
			}

			p, pre {
				font-size: 10pt;
			}

			td, th {
				font-size: 10pt;
				border: 3px;
			}

			th {
				font-weight: bold;
			}

		</style>

		<table style="table-layout: fixed; width: 100%; border-spacing: 6px; border-collapse: separate;">
			<tr>
				<td width="30%" valign="top">
					<p style="color: #4d5f79; font-weight: 600;">Select a table to view its details.</p>
					<divstyle="margin-top: 3px;" id="tablesColumn">Loading Tables Index...</div>
				</td>
				<td id="tableInfoColumn" valign="top">&nbsp;</td>
			</tr>
		</table>

		<script>

			window.jQuery = window.$ = jQuery;

			${jsFunctionTableDetailsGet()}
			${jsFunctionTableNamesGet()}
			${jsFunctionTableQueryCopy()}

			tableNamesGet();

		</script>

	`;

	context.response.writePage( form );

}


function htmlGenerateTool() {

	return `

		<link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/bootstrap/4.5.2/css/bootstrap.min.css">
		<script src="/ui/jquery/jquery-3.5.1.min.js"></script>
		<script src="https://maxcdn.bootstrapcdn.com/bootstrap/4.5.2/js/bootstrap.min.js"></script>
		${jsFunctionDataTablesExternals()}
		<style type = "text/css">

			input[type="text"], input[type="search"], textarea, button {
				outline: none;
				box-shadow:none !important;
				border: 1px solid #ccc !important;
			}

			p, pre {
				font-size: 10pt;
			}

			td, th {
				font-size: 10pt;
				border: 3px;
			}

			th {
				text-transform: lowercase;
				font-weight: bold;
			}

		</style>

		${htmlLocalLoadModal()}

		${htmlRemoteLoadModal()}

		${htmlSaveModal()}

		${htmlWorkbooksModal()}

		${htmlQueryUI()}

		<script>

			var
				activeSQLFile = {},
				queryResponsePayload,
				fileLoadResponsePayload;

			window.jQuery = window.$ = jQuery;

			$('#queryUI').show();
			$('#templateHeaderRow').hide();
			$('#templateFormRow').hide();

			${jqueryKeydownHandler()}
			${jqueryModalHandlers()}
			${jsFunctionDefaultQuerySet()}
			${jsFunctionDocumentGenerate()}
			${jsFunctionEnablePaginationToggle()}
			${jsFunctionFileInfoRefresh()}
			${jsFunctionHideRowNumbersToggle()}
			${jsFunctionLocalLibraryFilesGet()}
			${jsFunctionLocalSQLFileLoad()}
			${jsFunctionLocalSQLFileSave()}
			${jsFunctionQueryFormRowToggle()}
			${jsFunctionQuerySubmit()}
			${jsFunctionQueryTextAreaResize()}
			${jsFunctionRadioFieldValueGet()}
			${jsFunctionRemoteLibraryIndexGet()}
			${jsFunctionRemoteSQLFileLoad()}
			${jsFunctionResponseDataCopy()}
			${jsFunctionResponseGenerate()}
			${jsFunctionResponseGenerateCSV()}
			${jsFunctionResponseGenerateJSON()}
			${jsFunctionResponseGenerateTable()}
			${jsFunctionReturnAllToggle()}
			${jsFunctiontablesReferenceOpen()}
			${jsFunctionWorkbookLoad()}
			${jsFunctionWorkbooksListGet()}

		</script>

	`

}


function htmlLocalLoadModal() {

	return `
		<div class="modal fade" id="localLoadModal">
			<div class="modal-dialog modal-lg">
				<div class="modal-content">

					<div class="modal-header">
						<h4 class="modal-title">Local Query Library</h4>
						<button type="button" class="close" data-dismiss="modal">&times;</button>
					</div>

					<div class="modal-body" id="localSQLFilesList">
					</div>

				</div>
			</div>
		</div>
	`;

}


function htmlQueryUI() {

	return `

		<div class="collapse" id="queryUI" style="text-align: left;">

			<table style="table-layout: fixed; width: 100%; border-spacing: 6px; border-collapse: separate;">

				<tr>
					<td width="20%">
						<h5 id="queryHeader" style="margin-bottom: 0px; color: #4d5f79; font-weight: 600;"><a href="#" onClick="javascript:defaultQuerySet();" title="Click to load a sample query." style="color: #4d5f79;">Query Editor</a></h5>
					</td>
					<td width="55%" style="text-align: right;">
						<div id="buttonsDiv">
							<button type="button" class="btn btn-sm btn-light" onClick="javascript:tablesReferenceOpen();">Tables Reference</button>
							${jsFunctionWorkbooksButton()}
							${jsFunctionRemoteLibraryButton()}
							${jsFunctionLocalLibraryButtons()}
							<button type="button" class="btn btn-sm btn-success" onclick="querySubmit();" accesskey="r">Run Query</button>
						</div>
					</td>
					<td width="25%" style="text-align: right;">
						<button id="btnQueryFormRowToggle" type="button" class="btn btn-sm btn-light" onclick="queryFormRowToggle();">Hide Query Editor</button>
					</td>
				</tr>

				<tr id="queryFormRow">
					<td colspan="2" style="vertical-align: top;">
						<textarea
							class="form-control small"
							id="query"
							style="
								font-size: 10pt;
								background-color: #FFFFFF;
								x-font-family: 'Courier New', monospace;
								color: #000000;
								line-height: 1.3;
								padding: 12px;
								"
							rows="22"
							placeholder="Enter a SuiteQL query here. Click &quot;Query Editor&quot; (above) to load a sample query."
							autofocus
							></textarea>
						<div id="fileInfo"></div>
					</td>
					<td style="vertical-align: top;">

						<div style="margin-left: 6px; padding: 12px; border: 1px solid #ccc; border-radius: 5px; background-color: #FAFAFA;">

							<div>

								<div class="form-check" style="margin-top: 6px;">
									<label class="form-check-label" style="font-size: 10pt;">
										<input type="checkbox" class="form-check-input" id="enablePagination" onChange="enablePaginationToggle();">Enable Pagination Options
									</label>
								</div>

								<p style="font-size: 10pt; margin-bottom: 3px; display: none;" id="returnRowsP">Return Rows:</p>
								<div class="form-inline" id="rowRangeDiv" style="display: none;">
									<input type="number" class="form-control-sm" name="rowBegin" id="rowBegin" style="max-width: 100px;" value="1" required>
									&nbsp;thru&nbsp;
									<input type="number" class="form-control-sm" name="rowEnd" id="rowEnd" style="max-width: 100px;" value="${rowsReturnedDefault}" required>
								</div>

								<div class="form-check" style="margin-top: 6px; display: none;" id="rowAllRowsDiv">
									<label class="form-check-label" style="font-size: 10pt;">
										<input type="checkbox" class="form-check-input" id="returnAll" onChange="returnAllToggle();">Return All Rows
									</label>
								</div>

								<div class="form-check" style="margin-top: 6px;  display: none;" id="rowTotalRowsDiv">
									<label class="form-check-label" style="font-size: 10pt;">
										<input type="checkbox" class="form-check-input" id="returnTotals" onChange="returnAllToggle();">Return Total Rows Count
									</label>
								</div>

								<div class="form-check" style="margin-top: 6px;  display: none;" id="hideRowNumbersDiv">
									<label class="form-check-label" style="font-size: 10pt;">
										<input type="checkbox" class="form-check-input" id="hideRowNumbers" onChange="hideRowNumbersToggle();" checked>Hide Row Numbers
									</label>
								</div>

							</div>

							${htmlEnableViewsOption()}

							<div style="margin-top: 12px; border-top: 1px solid #eee; padding-top: 12px;">
								<p style="font-size: 10pt; margin-bottom: 3px;">Format Results As:</p>
								<div class="form-check-inline">
									<label class="form-check-label" style="font-size: 10pt;">
										<input type="radio" class="form-check-input" name="resultsFormat" value="table" checked onChange="responseGenerate();">Table
									</label>
								</div>
								${htmlDataTablesFormatOption()}
								<div class="form-check-inline">
									<label class="form-check-label" style="font-size: 10pt;">
										<input type="radio" class="form-check-input" name="resultsFormat" value="csv" onChange="responseGenerate();">CSV
									</label>
								</div>
								<div class="form-check-inline">
									<label class="form-check-label" style="font-size: 10pt;">
										<input type="radio" class="form-check-input" name="resultsFormat" value="json" onChange="responseGenerate();">JSON
									</label>
								</div>
								<div class="form-check-inline">
									<label class="form-check-label" style="font-size: 10pt;">
										<input type="radio" class="form-check-input" name="resultsFormat" value="pdf" onChange="responseGenerate();">PDF
									</label>
								</div>
								<div class="form-check-inline">
									<label class="form-check-label" style="font-size: 10pt;">
										<input type="radio" class="form-check-input" name="resultsFormat" value="html" onChange="responseGenerate();">HTML
									</label>
								</div>
							</div>

							<div style="margin-top: 12px; border-top: 1px solid #eee; padding-top: 12px;" id="nullFormatDiv">
								<p style="font-size: 10pt; margin-bottom: 3px;">Display NULL Values As:</p>
								<div class="form-check-inline">
									<label class="form-check-label" style="font-size: 10pt;">
										<input type="radio" class="form-check-input" name="nullFormat" value="dimmed" checked onChange="responseGenerate();">Dimmed
									</label>
								</div>
								<div class="form-check-inline">
									<label class="form-check-label" style="font-size: 10pt;">
										<input type="radio" class="form-check-input" name="nullFormat" value="blank" onChange="responseGenerate();">Blank
									</label>
								</div>
								<div class="form-check-inline">
									<label class="form-check-label" style="font-size: 10pt;">
										<input type="radio" class="form-check-input" name="nullFormat" value="null" onChange="responseGenerate();">null
									</label>
								</div>
							</div>

						</div>

					</td>
				</tr>

				<tr id="templateHeaderRow">
					<td>
						<h5 style="margin-top: 12px; margin-bottom: 0px; color: #4d5f79; font-weight: 600;"><a href="#" onClick="javascript:defaultQuerySet();" title="Click to load a sample query." style="color: #4d5f79;">Template Editor</a></h5>
					</td>
					<td colspan="2" style="text-align: right; vertical-align: top;">
						<div id="templateButtonsDiv">
							<button type="button" class="btn btn-sm btn-light" onClick="window.open( 'https://bfo.com/products/report/docs/userguide.pdf' );">BFO Reference</button>
							<button type="button" class="btn btn-sm btn-light" onClick="window.open( 'https://freemarker.apache.org/docs/index.html' );">FreeMarker Reference</button>
							<button type="button" class="btn btn-sm btn-success" onclick="documentGenerate();" accesskey="g">Generate Document</button>
						</div>
					</td>
				</tr>

				<tr id="templateFormRow">
					<td colspan="3" style="vertical-align: top;">
						<textarea
							class="form-control small"
							id="template"
							style="
								font-size: 10pt;
								background-color: #FFFFFF;
								x-font-family: 'Courier New', monospace;
								color: #000000;
								line-height: 1.3;
								padding: 12px;
								"
							rows="20"
							placeholder="Enter your template here."
							autofocus
							></textarea>
						<div id="templateFileInfo"></div>
					</td>
				</tr>

				<tr>
					<td colspan="3">
						<div id="resultsDiv" style="max-width: 100%; margin-top: 12px; display: none; overflow: auto; overflow-y: hidden;">
						<!-- RESULTS -->
						</div>
					</td>
				</tr>

				<tr>
					<td colspan="3">
						<div style="margin-top: 12px; padding: 12px; border: 0px solid #ccc; border-radius: 5px; background-color: #FFFFFF; font-size: 10pt; color: #848484;">
							<p style="text-align: center; margin-bottom: 0px;">
								SuiteQL Query Tool Version ${version}.
								Developed by <a href="https://timdietrich.me/" target="_tim" style="color: #4d5f79;">Tim Dietrich</a>.
							</p>
						</div>
					</td>
				</tr>

			</table>

		</div>

	`;

}


function htmlRemoteLoadModal() {

	return `
		<div class="modal fade" id="remoteLoadModal">
			<div class="modal-dialog modal-lg">
				<div class="modal-content">

					<div class="modal-header">
						<h4 class="modal-title">Remote Query Library</h4>
						<button type="button" class="close" data-dismiss="modal">&times;</button>
					</div>

					<div class="modal-body" id="remoteSQLFilesList">
					</div>

				</div>
			</div>
		</div>
	`;

}


function htmlSaveModal() {

	return `
		<div class="modal fade" id="saveModal">
			<div class="modal-dialog modal-lg">
				<div class="modal-content">

					<div class="modal-header">
						<h4 class="modal-title">Save Query</h4>
						<button type="button" class="close" data-dismiss="modal">&times;</button>
					</div>

					<div class="modal-body" id="saveQueryMessage" style="display: none;">
						ERROR
					</div>

					<div class="modal-body" id="saveQueryForm" style="display: none;">
						<form class="row" style="margin-bottom: 24px;">
							<div class="col-12" style="margin-top: 12px;">
								<p style="font-size: 10pt; margin-bottom: 3px;">File Name:</p>
								<input type="text" class="form-control" name="saveQueryFormFileName" id="saveQueryFormFileName" style="width: 200px; padding: 3px;" value="">
							</div>
							<div class="col-12" style="margin-top: 12px;">
								<p style="font-size: 10pt; margin-bottom: 3px;">Description:</p>
								<input type="text" class="form-control" name="saveQueryFormDescription" id="saveQueryFormDescription" style="width: 400px; padding: 3px;" value="">
							</div>
							<div class="col-12" style="margin-top: 12px;">
								<button type="button" class="btn btn-sm btn-success" onclick="javascript:localSQLFileSave();">Save The Query &gt;</button>
							</div>
						</form>
					</div>

				</div>
			</div>
		</div>
	`;

}


function htmlWorkbooksModal() {

	return `
		<div class="modal fade" id="workbooksModal">
			<div class="modal-dialog modal-lg">
				<div class="modal-content">

					<div class="modal-header">
						<h4 class="modal-title">Workbooks</h4>
						<button type="button" class="close" data-dismiss="modal">&times;</button>
					</div>

					<div class="modal-body" id="workbooksList">
					</div>

				</div>
			</div>
		</div>
	`;

}


function jqueryKeydownHandler() {

	return `

		$('textarea').keydown(

			function(e) {

				if ( e.keyCode === 9 ) {
					var start = this.selectionStart;
					var end = this.selectionEnd;
					var $this = $(this);
					var value = $this.val();
					$this.val(value.substring(0, start) + "\t" + value.substring(end));
					this.selectionStart = this.selectionEnd = start + 1;
					e.preventDefault();
					return;
				}

				if ( e.keyCode === 190 ) {

					var queryField = document.getElementById('query');

					var pos = queryField.selectionStart;

					if ( pos > 1 ) {

						if ( queryField.value.charAt( pos - 1 ) == '.' ) {

							var tableStart = -2;

							for ( i = pos - 2; i > 0; i--) {
								var c = queryField.value.charAt(i);
								if ( ( c == '\\t' )  || ( c == ' ' )  || ( c == '\\n' )  || ( c == '\\r' ) ) {
									i = i + 1;
									break;
								}
							}

							var tableName = queryField.value.substring( i, pos - 1 );

							// alert( tableName );

							tablesReferenceOpen();

							tableDetailsGet( tableName );

							return false;

						}

					}

					return;

				}

				fileInfoRefresh();

			}

		);

	`

}


function jqueryModalHandlers() {

	return `

		$('#localLoadModal').on('shown.bs.modal',

			function (e) {
				localLibraryFilesGet();
			}

		);

		$('#remoteLoadModal').on('shown.bs.modal',

			function (e) {
				remoteLibraryIndexGet();
			}

		);

		$('#saveModal').on('shown.bs.modal',

			function (e) {

				document.getElementById('saveQueryMessage').style.display = "none";
				document.getElementById('saveQueryForm').style.display = "none";

				if ( document.getElementById('query').value == '' ) {

					document.getElementById('saveQueryMessage').innerHTML = '<p>Please enter a query.</p>';
					document.getElementById('saveQueryMessage').style.display = "block";
					return;

				} else {

					document.getElementById('saveQueryForm').style.display = "block";

					if ( activeSQLFile.hasOwnProperty( 'fileName' ) ) {
						document.getElementById('saveQueryFormFileName').value = activeSQLFile.fileName;
					}

					if ( activeSQLFile.hasOwnProperty( 'description' ) ) {
						document.getElementById('saveQueryFormDescription').value = activeSQLFile.description;
					}

					document.getElementById('saveQueryFormFileName').focus();


				}

			}

		);

		$('#workbooksModal').on('shown.bs.modal',

			function (e) {
				workbooksListGet();
			}

		);

	`

}


function jsFunctionDataTablesExternals() {

	if ( datatablesEnabled === true ) {

		return `
			<link rel="stylesheet" type="text/css" href="https://cdn.datatables.net/1.10.25/css/jquery.dataTables.css">
 			<script type="text/javascript" charset="utf8" src="https://cdn.datatables.net/1.10.25/js/jquery.dataTables.js"></script>
 		`

	} else {

		return ``

	}

}


function jsFunctionDefaultQuerySet() {

	return `
		function defaultQuerySet() {
			document.getElementById('query').value = \`SELECT\n\tID,\n\tLastName,\n\tFirstName,\n\tPhone,\n\tEmail\nFROM\n\tEmployee\nWHERE\n\tEmail LIKE '%@test.com'\nORDER BY\n\tLastName,\n\tFirstName\`;
			return false;
		}
	`

}


function jsFunctionDocumentGenerate() {

	return `

		function documentGenerate() {

			if ( document.getElementById('query').value == '' ) {
				alert( 'Please enter a query.' );
				return;
			}

			if ( document.getElementById('returnAll').checked ) {

				rowBegin = 1;
				rowEnd = 999999;

			} else {

				rowBegin = parseInt( document.getElementById('rowBegin').value );

				if ( Number.isInteger( rowBegin ) === false ) {
					alert( 'Enter an integer for the beginning row.' );
					document.getElementById('rowBegin').focus();
					return;
				}

				rowEnd = parseInt( document.getElementById('rowEnd').value );

				if ( Number.isInteger( rowEnd ) === false ) {
					alert( 'Enter an integer for the ending row.' );
					document.getElementById('rowEnd').focus();
					return;
				}

			}

			if ( document.getElementById('template').value == '' ) {
				alert( 'Please enter a template.' );
				return;
			}

			var viewsEnabled = false;

			if ( document.getElementById('enableViews') ) {
				viewsEnabled = document.getElementById('enableViews').checked;
			}

			var requestPayload = {
				'function': 'documentSubmit',
				'query': document.getElementById('query').value,
				'rowBegin': rowBegin,
				'rowEnd': rowEnd,
				'viewsEnabled': viewsEnabled,
				'returnTotals': document.getElementById('returnTotals').checked,
				'template': document.getElementById('template').value,
				'docType': radioFieldValueGet( 'resultsFormat' )
			}

			var xhr = new XMLHttpRequest();

			xhr.open( 'POST', '${scriptURL}', true );

			xhr.setRequestHeader( 'Accept', 'application/json' );

			xhr.send( JSON.stringify( requestPayload ) );

			xhr.onload = function() {

				if( xhr.status === 200 ) {

					try {
						queryResponsePayload = JSON.parse( xhr.response );
					} catch( e ) {
						alert( 'Unable to parse the response.' );
						return;
					}

					if ( queryResponsePayload['error'] == undefined ) {
						window.open( '${scriptURL}&function=documentGenerate' );
					} else {
						alert( 'Error: ' + queryResponsePayload.error.message );
					}

				} else {
					alert( 'Error: ' + xhr.status );
				}

			}

		}


	`

}


function jsFunctionEnablePaginationToggle() {

	return `

		function enablePaginationToggle() {

			if ( document.getElementById('enablePagination').checked ) {
				document.getElementById('returnRowsP').style.display = "block";
				if ( document.getElementById('returnAll').checked ) {
					document.getElementById('rowRangeDiv').style.display = "none";
					document.getElementById('returnRowsP').style.display = "none";
				} else {
					document.getElementById('rowRangeDiv').style.display = "block";
					document.getElementById('returnRowsP').style.display = "block";
				}
				document.getElementById('rowAllRowsDiv').style.display = "block";
				document.getElementById('rowTotalRowsDiv').style.display = "block";
				document.getElementById('hideRowNumbersDiv').style.display = "block";
			} else {
				document.getElementById('returnRowsP').style.display = "none";
				document.getElementById('rowRangeDiv').style.display = "none";
				document.getElementById('rowAllRowsDiv').style.display = "none";
				document.getElementById('rowTotalRowsDiv').style.display = "none";
				document.getElementById('returnRowsP').style.display = "none";
				document.getElementById('hideRowNumbersDiv').style.display = "none";
			}

		}

	`

}


function jsFunctionFileInfoRefresh() {

	return `

		function fileInfoRefresh() {

			var content = '';
			var status = '';

			if ( activeSQLFile.source == undefined ) {

				if ( document.getElementById('query').value != '' ) {
					content = '<span class="text-danger">unsaved</span>';
				}

			} else {

				status = 'Unchanged';
				if ( document.getElementById('query').value != activeSQLFile.sql ) {
					status = 'Changed / Unsaved';
				} else {
					status = 'Unchanged';
				}

				var tooltip = 'Source: ' + activeSQLFile.source + '\\n';
				tooltip += 'Status: ' + status;

				content = '<span title="' + tooltip + '">' + activeSQLFile.fileName + '</span>';

				if ( document.getElementById('query').value != activeSQLFile.sql ) {
					content = '<span class="text-danger">' + content + '</span>';
				}

			}

			content = '<p style="margin-top: 3px;">' + content + '</p>';

			document.getElementById('fileInfo').innerHTML = content;

		}

	`

}


function jsFunctionHideRowNumbersToggle() {

	return `

		function hideRowNumbersToggle() {
			responseGenerateTable();
		}

	`

}


function jsFunctionLocalLibraryButtons() {

	if ( queryFolderID !== null ) {
		return `<button type="button" class="btn btn-sm btn-light" data-toggle="modal" data-target="#localLoadModal">Local Library</button>
		<button type="button" class="btn btn-sm btn-light" data-toggle="modal" data-target="#saveModal">Save Query</i></button>`
	} else {
		return ``
	}

}


function jsFunctionLocalLibraryFilesGet() {

	return `

		function localLibraryFilesGet() {

			document.getElementById('localSQLFilesList').innerHTML = '<h5 style="color: green;">Getting the list of SQL files...</h5>';

			var requestPayload = {
				'function': 'localLibraryFilesGet'
			}

			var xhr = new XMLHttpRequest();

			xhr.open( 'POST', '${scriptURL}', true );

			xhr.send( JSON.stringify( requestPayload ) );

			xhr.onload = function() {

				var content = '';

				if( xhr.status === 200 ) {

					payload = JSON.parse( xhr.response );

					if ( payload.error == undefined ) {

						content = '<div class="table-responsive">';
							content += '<table id="localFilesTable" class="table table-sm table-bordered table-hover table-responsive-sm">';
								content += '<thead class="thead-light">';
									content += '<tr>';
										content += '<th>Name</th>';
										content += '<th>Description</th>';
										content += '<th></th>';
									content += '</tr>';
								content += '</thead>';
								content += '<tbody>';
								for ( r = 0; r < payload.records.length; r++ ) {

									var description = payload.records[r].description;

									if( description === null ) { description = ''; }

									content += '<tr>';
										content += '<td style="vertical-align: middle;">' + payload.records[r].name + '</td>';
										content += '<td style="vertical-align: middle;">' + description + '</td>';
										content += '<td style="text-align: center;"><button type="button" class="btn btn-sm  btn-primary" onclick="localSQLFileLoad(' + payload.records[r].id + ');">Load</button></td>';
									content += '</tr>';

								}
								content += '</tbody>';
							content += '</table>';
						content += '</div>';

						document.getElementById('localSQLFilesList').innerHTML = content;

						if ( ${datatablesEnabled} ) {
							$('#localFilesTable').DataTable();
						}

					} else {

						if ( payload.error == 'No SQL Files' ) {

							content += '<p class="text-danger">No query files were found in the local folder.</p>';

							document.getElementById('localSQLFilesList').innerHTML = content;

						} else {

							content = '<h5 class="text-danger">Error</h5>';
							content += '<pre>';
							content += payload.error;
							content += '</pre>';

							document.getElementById('localSQLFilesList').innerHTML = content;

						}

					}

				} else {

					var content = '<h5 class="text-danger">Error</h5>';
					content += '<pre>';
					content += 'XHR Error: Status ' + xhr.status;

					document.getElementById('localSQLFilesList').innerHTML = content;

				}

			}

		}

	`

}


function jsFunctionLocalSQLFileLoad() {

	return `

		function localSQLFileLoad( fileID ) {

			var requestPayload = {
				'function': 'sqlFileLoad',
				'fileID': fileID
			}

			var xhr = new XMLHttpRequest();

			xhr.open( 'POST', '${scriptURL}', true );

			xhr.send( JSON.stringify( requestPayload ) );

			xhr.onload = function() {

				if( xhr.status === 200 ) {

					fileLoadResponsePayload = JSON.parse( xhr.response );

					if ( fileLoadResponsePayload.error == undefined ) {

						document.getElementById('query').value = fileLoadResponsePayload.sql;

						queryTextAreaResize();

						$('#localLoadModal').modal('toggle');

						document.getElementById('resultsDiv').style.display = "none";

						activeSQLFile.source = 'Local SQL Library';
						activeSQLFile.fileName = fileLoadResponsePayload.file.name;
						activeSQLFile.description = fileLoadResponsePayload.file.description;
						activeSQLFile.fileID = fileLoadResponsePayload.file.id;
						activeSQLFile.sql = fileLoadResponsePayload.sql;
						fileInfoRefresh();

					} else {

						alert( 'Error: ' + payload.error );
					}

				} else {

					alert( 'Error: ' + xhr.status );

				}

			}

		}

	`

}


function jsFunctionLocalSQLFileSave() {

	return `

		function localSQLFileSave() {

			var filename = document.getElementById('saveQueryFormFileName').value;

			if ( filename == '' ) {
				alert( 'Please enter a name for the file.' );
				return;
			}

			var requestPayload = {
				'function': 'sqlFileExists',
				'filename': filename
			}

			var xhr = new XMLHttpRequest();

			xhr.open( 'POST', '${scriptURL}', false );

			xhr.send( JSON.stringify( requestPayload ) );

			if( xhr.status === 200 ) {

				fileExistsResponsePayload = JSON.parse( xhr.response );

				if ( fileExistsResponsePayload.exists == true ) {

   					var confirmResponse = confirm( "A file named \\"" + filename + "\\" already exists. Do you want to replace it?");

   					if ( confirmResponse == false ) {
   						return;
   					}

				}

			} else {

				alert( 'Error: ' + xhr.status );
				return;

			}

			var requestPayload = {
				'function': 'sqlFileSave',
				'filename': filename,
				'contents': document.getElementById('query').value,
				'description': document.getElementById('saveQueryFormDescription').value
			}

			var xhr = new XMLHttpRequest();

			xhr.open( 'POST', '${scriptURL}', true );

			xhr.send( JSON.stringify( requestPayload ) );

			xhr.onload = function() {

				if( xhr.status === 200 ) {

					fileSaveResponsePayload = JSON.parse( xhr.response );

					if ( fileSaveResponsePayload.error == undefined ) {

						activeSQLFile.source = 'Local SQL Library';
						activeSQLFile.fileName = filename;
						activeSQLFile.description = document.getElementById('saveQueryFormDescription').value;
						activeSQLFile.fileID = fileSaveResponsePayload.fileID;
						activeSQLFile.sql = document.getElementById('query').value;
						fileInfoRefresh();

						alert( 'The file has been saved.' );

					} else {

						alert( 'Error: ' + payload.error );
					}

				} else {

					alert( 'Error: ' + xhr.status );

				}

			}

			$('#saveModal').modal('toggle');

			return;


		}


	`

}


function jsFunctionQueryFormRowToggle() {
	return `

		function queryFormRowToggle() {

			if ( $('#queryFormRow').is(":visible") ) {
				$('#queryFormRow').hide();
				$('#queryHeader').hide();
				$('#buttonsDiv').hide();
				$('#btnQueryFormRowToggle').html('Show Query Editor');
			} else {
				$('#queryFormRow').show();
				$('#queryHeader').show();
				$('#buttonsDiv').show();
				$('#btnQueryFormRowToggle').html('Hide Query Editor');
			}

		}

	`

}


function jsFunctionQuerySubmit() {

	return `

		function querySubmit() {

			if ( document.getElementById('query').value == '' ) {
				alert( 'Please enter a query.' );
				return;
			}

			var theQuery;

			var textArea = document.getElementById('query');

			// Source: https://stackoverflow.com/questions/275761/how-to-get-selected-text-from-textbox-control-with-javascript
			if ( textArea.selectionStart !== undefined ) {
				// Standards-Compliant Version
				var startPos = textArea.selectionStart;
				var endPos = textArea.selectionEnd;
				theQuery = textArea.value.substring( startPos, endPos );
			} else if ( document.selection !== undefined ) {
				// IE-Version
				textArea.focus();
				var sel = document.selection.createRange();
				theQuery = sel.text;
			}

			if ( theQuery == '' ) { theQuery = document.getElementById('query').value; }

			if ( document.getElementById('returnAll').checked ) {

				rowBegin = 1;
				rowEnd = 999999;

			} else {

				rowBegin = parseInt( document.getElementById('rowBegin').value );

				if ( Number.isInteger( rowBegin ) === false ) {
					alert( 'Enter an integer for the beginning row.' );
					document.getElementById('rowBegin').focus();
					return;
				}

				rowEnd = parseInt( document.getElementById('rowEnd').value );

				if ( Number.isInteger( rowEnd ) === false ) {
					alert( 'Enter an integer for the ending row.' );
					document.getElementById('rowEnd').focus();
					return;
				}

			}

			var viewsEnabled = false;

			if ( document.getElementById('enableViews') ) {
				viewsEnabled = document.getElementById('enableViews').checked;
			}

			var paginationEnabled = document.getElementById('enablePagination').checked;

			document.getElementById('resultsDiv').style.display = "block";

			document.getElementById('resultsDiv').innerHTML = '<h5 style="color: green;">Running query...</h5>';

			var requestPayload = {
				'function': 'queryExecute',
				'query': theQuery,
				'rowBegin': rowBegin,
				'rowEnd': rowEnd,
				'paginationEnabled': paginationEnabled,
				'viewsEnabled': viewsEnabled,
				'returnTotals': document.getElementById('returnTotals').checked
			}

			var xhr = new XMLHttpRequest();

			xhr.open( 'POST', '${scriptURL}', true );

			xhr.setRequestHeader( 'Accept', 'application/json' );

			xhr.send( JSON.stringify( requestPayload ) );

			xhr.onload = function() {

				if( xhr.status === 200 ) {

					try {

						queryResponsePayload = JSON.parse( xhr.response );

					} catch( e ) {
						alert( 'Unable to parse the response.' );
						return;
					}

					if ( queryResponsePayload['error'] == undefined ) {

						responseGenerate();

					} else {

						var content = '<h5 class="text-danger">Error</h5>';
						content += '<pre>';
						content += queryResponsePayload.error.message;
						content += '</pre>';

						document.getElementById('resultsDiv').innerHTML = content;

					}

				} else {

					var content = '<h5 class="text-danger">Error</h5>';
					content += '<pre>';
					content += 'XHR Error: Status ' + xhr.status;
					content += '</pre>';

					document.getElementById('resultsDiv').innerHTML = content;

				}

			}

		}


	`


}


function jsFunctionQueryTextAreaResize() {

	return `

		function queryTextAreaResize() {
			var lines = document.getElementById('query').value.split(/\\r*\\n/);
			var lineCount = lines.length + 1;
			if ( lineCount < 12 ) { lineCount = 12; }
			document.getElementById('query').rows = lineCount + 1;
		}

	`

}


function jsFunctionRadioFieldValueGet() {

	return `

		function radioFieldValueGet( fieldName ) {
			var radios = document.getElementsByName( fieldName );
			for (var i = 0, length = radios.length; i < length; i++) {
			  if (radios[i].checked) {
				return( radios[i].value );
			  }
			}
			return '';
		}

	`

}


function jsFunctionRemoteLibraryButton() {

	if ( remoteLibraryEnabled === true ) {
		return `<button type="button" class="btn btn-sm btn-light" data-toggle="modal" data-target="#remoteLoadModal">Remote Library</button>`
	} else {
		return ``
	}

}


function jsFunctionRemoteLibraryIndexGet() {

	return `

		function remoteLibraryIndexGet() {

			document.getElementById('remoteSQLFilesList').innerHTML = '<h5 style="color: green;">Loading SuiteQL Query Library...</h5>';

			var xhr = new XMLHttpRequest();

			xhr.open( 'GET', 'https://suiteql.s3.us-east-1.amazonaws.com/queries/index.json?nonce=' + new Date().getTime(), true );

			xhr.send();

			xhr.onload = function() {

				var content = '';

				if( xhr.status === 200 ) {

					payload = JSON.parse( xhr.response );

					content = '<div class="table-responsive">';
						content += '<table class="table table-sm table-bordered table-hover table-responsive-sm" id="remoteFilesTable">';
							content += '<thead class="thead-light">';
								content += '<tr>';
									content += '<th>Name</th>';
									content += '<th>Description</th>';
									content += '<th></th>';
								content += '</tr>';
							content += '</thead>';
							content += '<tbody>';
							for ( r = 0; r < payload.length; r++ ) {
								content += '<tr>';
									content += '<td style="vertical-align: middle;" width="40%">' + payload[r].name + '</td>';
									content += '<td style="vertical-align: middle;">' + payload[r].description + '</td>';
									content += '<td style="text-align: center;"><button type="button" class="btn btn-sm  btn-primary" onclick="remoteSQLFileLoad(\\'' + payload[r].fileName + '\\');">Load</button></td>';
								content += '</tr>';
							}
							content += '</tbody>';
						content += '</table>';
					content += '</div>';

					document.getElementById('remoteSQLFilesList').innerHTML = content;

					if ( ${datatablesEnabled} ) {
						$('#remoteFilesTable').DataTable();
					}

				} else {

					var content = '<h5 class="text-danger">Error</h5>';
					content += '<pre>';
					content += 'XHR Error: Status ' + xhr.status;

					document.getElementById('remoteSQLFilesList').innerHTML = content;

				}

			}

		}
	`

}


function jsFunctionRemoteSQLFileLoad() {

	return `

		function remoteSQLFileLoad( filename ) {

			var xhr = new XMLHttpRequest();

			xhr.open( 'GET', 'https://suiteql.s3.us-east-1.amazonaws.com/queries/' + filename+ '?nonce=' + new Date().getTime(), true );

			xhr.send();

			xhr.onload = function() {

				var content = '';

				if( xhr.status === 200 ) {

					document.getElementById('query').value = xhr.response;

					queryTextAreaResize();

					$('#remoteLoadModal').modal('toggle');

					document.getElementById('resultsDiv').style.display = "none";

					activeSQLFile.source = 'Remote SQL Library';
					activeSQLFile.fileName = filename;
					activeSQLFile.sql = xhr.response;
					fileInfoRefresh();

				} else {

					alert( 'XHR Error: Status ' + xhr.status );

				}

			}

		}

	`

}


function jsFunctionResponseDataCopy() {

	return `
		function responseDataCopy() {
			var copyText = document.getElementById("responseData");
			copyText.select();
			document.execCommand("copy");
			return false;
		}
	`

}


function jsFunctionResponseGenerate() {

	return `

		function responseGenerate() {

			$('#templateHeaderRow').hide();
			$('#templateFormRow').hide();

			switch ( radioFieldValueGet( 'resultsFormat' ) ) {

				case 'csv':
					responseGenerateCSV();
					break;

				case 'json':
					responseGenerateJSON();
					break;

				case 'pdf':
					$('#templateHeaderRow').show();
					$('#templateFormRow').show();
					responseGenerateTable();
					break;

				case 'html':
					$('#templateHeaderRow').show();
					$('#templateFormRow').show();
					responseGenerateTable();
					break;

				default:
					responseGenerateTable();

			}

		}

	`

}


function jsFunctionResponseGenerateCSV() {

	return `

		function responseGenerateCSV() {

			document.getElementById('nullFormatDiv').style.display = "none";

			var columnNames = Object.keys( queryResponsePayload.records[0] );
			var row = '"' + columnNames.join( '","' ) + '"';
			var csv = row + "\\r\\n";

			for ( r = 0; r < queryResponsePayload.records.length; r++ ) {

				var record = queryResponsePayload.records[r];

				var values = [];

				for ( c = 0; c < columnNames.length; c++ ) {

					var column = columnNames[c];

					var value = record[column];

					if ( value != null ) {
						value = value.toString();
					} else {
						value = '';
					}

					values.push( '"' + value + '"' );

				}

				var row = values.join( ',' );
				csv += row + "\\r\\n";

			}

			var content = '<h5 style="margin-bottom: 3px; color: #4d5f79; font-weight: 600;">Results</h5>';
			content += 'Retrieved ' + queryResponsePayload.records.length;
			if ( document.getElementById('returnTotals').checked ) {
				content += ' of ' + queryResponsePayload.totalRecordCount;
			}
			content += ' rows in ' + queryResponsePayload.elapsedTime + 'ms.<br>';
			content += '<p>';
			content += ' <a href="#" onclick="javascript:responseDataCopy();">Click here</a> to copy the data.';
			content += '</p>';
			content += '<textarea class="form-control small" id="responseData" name="responseData" rows="25" placeholder="Enter your query here." autofocus style="font-size: 10pt;">' + csv + '</textarea>';
			content += '</div>';

			document.getElementById('resultsDiv').innerHTML = content;

		}

	`

}


function jsFunctionResponseGenerateJSON() {

	return `

		function responseGenerateJSON() {

			document.getElementById('nullFormatDiv').style.display = "none";

			var content = '<h5 style="margin-bottom: 3px; color: #4d5f79; font-weight: 600;">Results</h5>';
			content += 'Retrieved ' + queryResponsePayload.records.length;
			if ( document.getElementById('returnTotals').checked ) {
				content += ' of ' + queryResponsePayload.totalRecordCount;
			}
			content += ' rows in ' + queryResponsePayload.elapsedTime + 'ms.<br>';
			content += '<p>';
			content += ' <a href="#" onclick="javascript:responseDataCopy();">Click here</a> to copy the data.';
			content += '</p>';
			content += '<textarea class="form-control small" id="responseData" name="responseData" rows="25" placeholder="Enter your query here." autofocus style="font-size: 10pt;">' + JSON.stringify( queryResponsePayload.records, null, 5 ) + '</textarea>';
			content += '</div>';

			document.getElementById('resultsDiv').innerHTML = content;

		}

	`

}


function jsFunctionResponseGenerateTable() {

	return `

		function responseGenerateTable() {

			document.getElementById('nullFormatDiv').style.display = "block";

			if ( queryResponsePayload.records.length > 0 ) {

				var columnNames = Object.keys( queryResponsePayload.records[0] );

				var firstColumnIsRowNumber = false;
				var rowNumbersHidden = false;

				if ( document.getElementById('enablePagination').checked ) {
					firstColumnIsRowNumber = true;
					if ( document.getElementById('hideRowNumbers').checked ) {
						rowNumbersHidden = true;
					}
				}

				var thead = '<thead class="thead-light">';
				thead += '<tr>';
				for ( i = 0; i < columnNames.length; i++ ) {
					if ( ( i == 0 ) && ( firstColumnIsRowNumber ) && ( rowNumbersHidden === false) ) {
						thead += '<th style="text-align: center;">&nbsp;#&nbsp;</th>';
					} else if ( ( i == 0 ) && ( firstColumnIsRowNumber ) && ( rowNumbersHidden === true) ) {
						continue;
					} else {
						thead += '<th>' + columnNames[i] + '</th>';
					}
				}
				thead += '</tr>';
				thead += '</thead>';

				var tbody = '<tbody>';
				for ( r = 0; r < queryResponsePayload.records.length; r++ ) {
					tbody += '<tr>';
					for ( i = 0; i < columnNames.length; i++ ) {
						var value = queryResponsePayload.records[r][ columnNames[i] ];
						if ( value === null ) {
							var nullFormat = radioFieldValueGet( 'nullFormat' );
							if ( nullFormat == 'dimmed' ) {
								value = '<span style="color: #ccc;">' + value + '</span>';
							} else if ( nullFormat == 'blank' ) {
								value = '';
							} else {
								value = 'null';
							}
						}
						if ( ( i == 0 ) && ( firstColumnIsRowNumber ) && ( rowNumbersHidden === false) ) {
							tbody += '<td style="text-align: center;">' + value + '</td>';
						} else if ( ( i == 0 ) && ( firstColumnIsRowNumber ) && ( rowNumbersHidden === true) ) {
							continue;
						} else {
							tbody += '<td>' + value + '</td>';
						}
					}
					tbody += '</tr>';
				}
				tbody += '</tbody>';

				var content = '<h5 style="margin-bottom: 3px; color: #4d5f79; font-weight: 600;">Results</h5>';
				content += 'Retrieved ' + queryResponsePayload.records.length;
				if ( document.getElementById('returnTotals').checked ) {
					content += ' of ' + queryResponsePayload.totalRecordCount;
				}
				content += ' rows in ' + queryResponsePayload.elapsedTime + 'ms.<br>';
				content += '<div class="table-responsive">';
				content += '<table class="table table-sm table-bordered table-hover table-responsive-sm" id="resultsTable">';
				content += thead;
				content += tbody;
				content += '</table>';
				content += '</div>';

				document.getElementById('resultsDiv').innerHTML = content;

				if ( radioFieldValueGet( 'resultsFormat' ) == 'datatable' ) {
					$('#resultsTable').DataTable();
				}

			} else {

				document.getElementById('resultsDiv').innerHTML = '<h5 class="text-warning">No Records Were Found</h5>';

			}

		}

	`

}


function jsFunctionReturnAllToggle() {

	return `

		function returnAllToggle() {

			if ( document.getElementById('returnAll').checked ) {
				document.getElementById('rowRangeDiv').style.display = "none";
				document.getElementById('returnRowsP').style.display = "none";
			} else {
				document.getElementById('rowRangeDiv').style.display = "block";
				document.getElementById('returnRowsP').style.display = "block";
			}

		}

	`

}


function jsFunctionTableDetailsGet() {

	return `

		function tableDetailsGet( tableName ) {

			document.getElementById('tableInfoColumn').innerHTML = '<h5 style="color: green;">Loading information for ' + tableName + ' table...</h5>';

			var url = '/app/recordscatalog/rcendpoint.nl?action=\getRecordTypeDetail&data=' + encodeURI( JSON.stringify( { scriptId: tableName, detailType: 'SS_ANAL' } ) );

			var xhr = new XMLHttpRequest();

			xhr.open( 'GET', url, true );

			xhr.send();

			xhr.onload = function() {

				if( xhr.status === 200 ) {

					let recordDetail = JSON.parse( xhr.response ).data;

					content = '<h4 style="color: #4d5f79; font-weight: 600;">' + recordDetail.label + ' ("' + tableName + '")</h4>';

					content += '<h5 style="margin-top: 18px; margin-bottom: 6px; color: #4d5f79; font-weight: 600;">Columns</h5>';
					content += '<div class="table-responsive">';
					content += '<table class="table table-sm table-bordered table-hover table-responsive-sm" id="tableColumnsTable">';
					content += '<thead class="thead-light">';
					content += '<tr>';
					content += '<th>Label</th>';
					content += '<th>Name</th>';
					content += '<th>Type</th>';
					content += '</tr>';
					content += '</thead>';
					content += '<tbody>';
					for ( i = 0; i < recordDetail.fields.length; i++ ) {
						var field = recordDetail.fields[i];
						if ( field.isColumn ) {;
							content += '<tr>';
							content += '<td>' + field.label + '</td>';
							content += '<td>' + field.id + '</td>';
							content += '<td>' + field.dataType + '</td>';
							content += '</tr>';
						};
					}
					content += '</tbody>';
					content += '</table>';
					content += '</div>';

					if ( recordDetail.joins.length > 0 ) {
						content += '<h5 style="margin-top: 18px; margin-bottom: 6px; color: #4d5f79; font-weight: 600;">Joins</h5>';
						content += '<div class="table-responsive">';
						content += '<table class="table table-sm table-bordered table-hover table-responsive-sm" id="tableJoinsTable">';
						content += '<thead class="thead-light">';
						content += '<tr>';
						content += '<th>Label</th>';
						content += '<th>Table Name</th>';
						content += '<th>Cardinality</th>';
						content += '<th>Join Pairs</th>';
						content += '</tr>';
						content += '</thead>';
						content += '<tbody>';
						for ( i = 0; i < recordDetail.joins.length; i++ ) {
							var join = recordDetail.joins[i];
							content += '<tr>';
							content += '<td>' + join.label + '</td>';
							content += '<td><a href="#" onclick="javascript:tableDetailsGet( \\'' + join.sourceTargetType.id + '\\' );">' + join.sourceTargetType.id + '</a></td>';
							content += '<td>' + join.cardinality + '</td>';
							var joinInfo = "";
							for ( j = 0; j < join.sourceTargetType.joinPairs.length; j++ ) {
							var joinPair = join.sourceTargetType.joinPairs[j];
							joinInfo += joinPair.label + '<br>';
							}
							content += '<td>' + joinInfo + '</td>';
							content += '</tr>';
						}
						content += '</tbody>';
						content += '</table>';
						content += '</div>';
					}

					let textareaRows = recordDetail.fields.length + 5;

					content += '<h5 style="margin-top: 18px; margin-bottom: 6px; color: #4d5f79; font-weight: 600;">Sample Query</h5>';
					content += '<span style="font-size: 11pt;"><a href="#" onclick="javascript:tableQueryCopy();">Click here</a> to copy the query.</span>';
					content += '<textarea class="form-control small" id="tableQuery" name="sampleQuery" rows="' + textareaRows + '" style="font-size: 10pt;">';
					content += 'SELECT\\n';
					for ( i = 0; i < recordDetail.fields.length; i++ ) {
						var field = recordDetail.fields[i];
						if ( field.isColumn ) {
							content += '\\t' + tableName + '.' + field.id;
							if ( ( i + 1 ) < recordDetail.fields.length ) { content += ','; }
							content += '\\n';
						}
					}
					content += 'FROM\\n';
					content += '\\t' + tableName + '\\n';
					content += '</textarea>';

					document.getElementById('tableInfoColumn').innerHTML = content;

					if ( ${datatablesEnabled} ) {
						$('#tableColumnsTable').DataTable();
						$('#tableJoinsTable').DataTable();
					}

				} else {

					alert( 'Error: ' + xhr.status );
				}

			}

		}


	`

}


function jsFunctionTableNamesGet() {

	return `

		function tableNamesGet() {

			var url = '/app/recordscatalog/rcendpoint.nl?action=\getRecordTypes&data=' + encodeURI( JSON.stringify( { structureType: 'FLAT' } ) );

			var xhr = new XMLHttpRequest();

			xhr.open( 'GET', url, true );

			xhr.send();

			xhr.onload = function() {

				if( xhr.status === 200 ) {

					let recordTypes = JSON.parse( xhr.response ).data;

					content = '<div class="table-responsive">';
						content += '<table class="table table-sm table-bordered table-hover table-responsive-sm" id="tableNamesTable">';
							content += '<thead class="thead-light">';
								content += '<tr>';
									content += '<th>Table</th>';
								content += '</tr>';
							content += '</thead>';
							content += '<tbody>';
							for ( i = 0; i < recordTypes.length; i++ ) {
								content += '<tr>';
									content += '<td>';
									content += '<a href="#" onclick="javascript:tableDetailsGet( \\'' + recordTypes[i].id + '\\' );" style="font-weight: bold;">' + recordTypes[i].label + '</a><br>';
									content += recordTypes[i].id;
									content += '</td>';
								content += '</tr>';
							}
							content += '</tbody>';
						content += '</table>';
					content += '</div>';

					document.getElementById('tablesColumn').innerHTML = content;

					if ( ${datatablesEnabled} ) {
						$('#tableNamesTable').DataTable();
					}

				} else {
					alert( 'Error: ' + xhr.status );
				}

			}

		}

	`

}


function jsFunctionTableQueryCopy() {

	return `
		function tableQueryCopy() {
			var copyText = document.getElementById("tableQuery");
			copyText.select();
			document.execCommand("copy");
			return false;
		}

	`

}


function jsFunctiontablesReferenceOpen() {

	return `

		function tablesReferenceOpen() {
			window.open( "${scriptURL}&function=tablesReference", "_tablesRef" );
		}

	`

}


function jsFunctionWorkbooksButton() {

	if ( workbooksEnabled === true ) {
		return `<button type="button" class="btn btn-sm btn-light" data-toggle="modal" data-target="#workbooksModal">Workbooks</button>`
	} else {
		return ``
	}

}


function jsFunctionWorkbookLoad() {

	return `

		function workbookLoad( scriptID ) {

			var requestPayload = {
				'function': 'workbookLoad',
				'scriptID': scriptID
			}

			var xhr = new XMLHttpRequest();

			xhr.open( 'POST', '${scriptURL}', true );

			xhr.send( JSON.stringify( requestPayload ) );

			xhr.onload = function() {

				if( xhr.status === 200 ) {

					workbookLoadResponsePayload = JSON.parse( xhr.response );

					if ( workbookLoadResponsePayload.error == undefined ) {

						document.getElementById('query').value = workbookLoadResponsePayload.sql;

						queryTextAreaResize();

						$('#workbooksModal').modal('toggle');

						document.getElementById('resultsDiv').style.display = "none";

						activeSQLFile.source = 'Workbook ' + scriptID;
						activeSQLFile.fileName = '';
						activeSQLFile.description = '';
						activeSQLFile.fileID = '';
						activeSQLFile.sql = workbookLoadResponsePayload.sql;
						fileInfoRefresh();

					} else {

						alert( 'Error: ' + payload.error );
					}

				} else {

					alert( 'Error: ' + xhr.status );

				}

			}

		}

	`

}


function jsFunctionWorkbooksListGet() {

	return `

		function workbooksListGet() {

			document.getElementById('workbooksList').innerHTML = '<h5 style="color: green;">Getting the list of Workbooks...</h5>';

			var requestPayload = {
				'function': 'workbooksGet'
			}

			var xhr = new XMLHttpRequest();

			xhr.open( 'POST', '${scriptURL}', true );

			xhr.send( JSON.stringify( requestPayload ) );

			xhr.onload = function() {

				var content = '';

				if( xhr.status === 200 ) {

					payload = JSON.parse( xhr.response );

					if ( payload.error == undefined ) {

						content = '<div class="table-responsive">';
							content += '<table id="workbooksTable" class="table table-sm table-bordered table-hover table-responsive-sm">';
								content += '<thead class="thead-light">';
									content += '<tr>';
										content += '<th>Name</th>';
										content += '<th>Description</th>';
										content += '<th>Owner</th>';
										content += '<th></th>';
									content += '</tr>';
								content += '</thead>';
								content += '<tbody>';
								for ( r = 0; r < payload.records.length; r++ ) {

									var description = payload.records[r].description;

									if( description === null ) { description = ''; }

									content += '<tr>';
										content += '<td style="vertical-align: middle;">' + payload.records[r].name + '</td>';
										content += '<td style="vertical-align: middle;">' + description + '</td>';
										content += '<td style="vertical-align: middle;">' + payload.records[r].owner + '</td>';
										content += '<td style="text-align: center; vertical-align: middle;"><button type="button" class="btn btn-sm  btn-primary" onclick="workbookLoad(\\'' + payload.records[r].scriptid + '\\');" >Load</button></td>';
									content += '</tr>';

								}
								content += '</tbody>';
							content += '</table>';
						content += '</div>';

						document.getElementById('workbooksList').innerHTML = content;

						if ( ${datatablesEnabled} ) {
							$('#workbooksTable').DataTable();
						}

					} else {

						if ( payload.error == 'No Workbooks' ) {

							content += '<p class="text-danger">No workbooks were found.</p>';

							document.getElementById('workbooksList').innerHTML = content;

						} else {

							content = '<h5 class="text-danger">Error</h5>';
							content += '<pre>';
							content += payload.error;
							content += '</pre>';

							document.getElementById('workbooksList').innerHTML = content;

						}

					}

				} else {

					var content = '<h5 class="text-danger">Error</h5>';
					content += '<pre>';
					content += 'XHR Error: Status ' + xhr.status;

					document.getElementById('workbooksList').innerHTML = content;

				}

			}

		}

	`

}


function localLibraryFilesGet( context ) {

	var responsePayload;

	var sql = `
		SELECT
			ID,
			Name,
			Description
		FROM
			File
		WHERE
			( Folder = ? )
		ORDER BY
			Name
	`;

	var queryResults = query.runSuiteQL( { query: sql, params: [ queryFolderID ] } );

	var records = queryResults.asMappedResults();

	if ( records.length > 0 ) {
		responsePayload = { 'records': records };
	} else {
		responsePayload = { 'error': 'No SQL Files' };
	}

	context.response.write( JSON.stringify( responsePayload, null, 5 ) );

}


function postRequestHandle( context ) {

	var requestPayload = JSON.parse( context.request.body );

	context.response.setHeader( 'Content-Type', 'application/json' );

	switch ( requestPayload['function'] ) {

		case 'documentSubmit':
			return documentSubmit( context, requestPayload );
			break;

		case 'queryExecute':
			return queryExecute( context, requestPayload );
			break;

		case 'sqlFileExists':
			return sqlFileExists( context, requestPayload );
			break;

		case 'sqlFileLoad':
			return sqlFileLoad( context, requestPayload );
			break;

		case 'sqlFileSave':
			return sqlFileSave( context, requestPayload );
			break;

		case 'localLibraryFilesGet':
			return localLibraryFilesGet( context );
			break;

		case 'workbookLoad':
			return workbookLoad( context, requestPayload );
			break;

		case 'workbooksGet':
			return workbooksGet( context );
			break;

		default:
			log.error( { title: 'Payload - Unsupported Function', details: requestPayload['function'] } );

	}

}


function queryExecute( context, requestPayload ) {

	try {

		var responsePayload;

		var moreRecords = true;

		var records = new Array();

		var totalRecordCount = 0;

		var queryParams = new Array();

		var paginatedRowBegin = requestPayload.rowBegin;

		var paginatedRowEnd = requestPayload.rowEnd;

		var nestedSQL = requestPayload.query + "\n";

		if ( ( requestPayload.viewsEnabled ) && ( queryFolderID !== null ) ) {

			var pattern = /(?:^|\s)\#(\w+)\b/ig;

			var views = nestedSQL.match(pattern);

			if ( ( views !== null ) && ( views.length > 0 ) ) {

				for ( let i = 0; i < views.length; i++ ) {

					view = views[i].replace(/\s+/g, '');

					viewFileName = view.substring( 1, view.length ) + '.sql';

					var sql = 'SELECT ID FROM File WHERE ( Folder = ? ) AND ( Name = ? )';

					var queryResults = query.runSuiteQL( { query: sql, params: [ queryFolderID, viewFileName ] } );

					var files = queryResults.asMappedResults();

					if ( files.length == 1 ) {

						var fileObj = file.load( {  id: files[0].id  } );

						nestedSQL = nestedSQL.replace( view, '( ' + fileObj.getContents() + ' ) AS ' + view.substring( 1, view.length ) );

					} else {

						throw {
							'name:': 'UnresolvedViewException',
							'message': 'Unresolved View ' + viewFileName
						}

					}

				}

			}

		}

		let beginTime = new Date().getTime();

		if ( requestPayload.paginationEnabled ) {

			do {

				var paginatedSQL = 'SELECT * FROM ( SELECT ROWNUM AS ROWNUMBER, * FROM ( ' + nestedSQL + ' ) ) WHERE ( ROWNUMBER BETWEEN ' + paginatedRowBegin + ' AND ' + paginatedRowEnd + ')';

				var queryResults = query.runSuiteQL( { query: paginatedSQL, params: queryParams } ).asMappedResults();

				records = records.concat( queryResults );

				if ( queryResults.length < 5000 ) { moreRecords = false; }

				paginatedRowBegin = paginatedRowBegin + 5000;

			} while ( moreRecords );

		} else {

			log.debug( { title: 'nestedSQL', details: nestedSQL } );

			records = query.runSuiteQL( { query: nestedSQL, params: queryParams } ).asMappedResults();

			log.debug( { title: 'records', details: records } );

		}

		let elapsedTime = ( new Date().getTime() - beginTime ) ;

		responsePayload = { 'records': records, 'elapsedTime': elapsedTime }

		if ( requestPayload.returnTotals ) {

			if ( records.length > 0 ) {

				var paginatedSQL = 'SELECT COUNT(*) AS TotalRecordCount FROM ( ' + nestedSQL  + ' )';

				var queryResults = query.runSuiteQL( { query: paginatedSQL, params: queryParams } ).asMappedResults();

				responsePayload.totalRecordCount = queryResults[0].totalrecordcount;

			}

		}



	} catch( e ) {

		log.error( { title: 'queryExecute Error', details: e } );

		responsePayload = { 'error': e }

	}

	context.response.write( JSON.stringify( responsePayload, null, 5 ) );

}


function sqlFileExists( context, requestPayload ) {

	var responsePayload;

	var sql = `
		SELECT
			ID
		FROM
			File
		WHERE
			( Folder = ? ) AND ( Name = ? )
	`;

	var queryResults = query.runSuiteQL( { query: sql, params: [ queryFolderID, requestPayload.filename ] } );

	var records = queryResults.asMappedResults();

	if ( records.length > 0 ) {
		responsePayload = { 'exists': true };
	} else {
		responsePayload = { 'exists': false };
	}

	context.response.write( JSON.stringify( responsePayload, null, 5 ) );

}


function sqlFileLoad( context, requestPayload ) {

	var responsePayload;

	try {

		var fileObj = file.load( {  id: requestPayload.fileID  } );

		responsePayload = {}
		responsePayload.file = fileObj;
		responsePayload.sql = fileObj.getContents();

	} catch( e ) {

		log.error( { title: 'sqlFileLoad Error', details: e } );

		responsePayload = { 'error': e }

	}

	context.response.write( JSON.stringify( responsePayload, null, 5 ) );

}


function sqlFileSave( context, requestPayload ) {

	var responsePayload;

	try {

		var fileObj = file.create(
			{
				name: requestPayload.filename,
				contents: requestPayload.contents,
				description: requestPayload.description,
				fileType: file.Type.PLAINTEXT,
				folder: queryFolderID,
				isOnline: false
			}
		);

		var fileID = fileObj.save();

		responsePayload = {}
		responsePayload.fileID = fileID;

	} catch( e ) {

		log.error( { title: 'sqlFileSave Error', details: e } );

		responsePayload = { 'error': e }

	}

	context.response.write( JSON.stringify( responsePayload, null, 5 ) );

}


function workbookLoad( context, requestPayload ) {

	var responsePayload;

	try {

		var loadedQuery = query.load( { id: requestPayload.scriptID } );

		responsePayload = {}
		responsePayload.sql = loadedQuery.toSuiteQL().query;

	} catch( e ) {

		log.error( { title: 'workbookLoad Error', details: e } );

		responsePayload = { 'error': e }

	}

	context.response.write( JSON.stringify( responsePayload, null, 5 ) );

}


function workbooksGet( context ) {

	var responsePayload;

	var sql = `
		SELECT
			ScriptID,
			Name,
			Description,
			BUILTIN.DF( Owner ) AS Owner
		FROM
			UsrSavedSearch
		ORDER BY
			Name
	`;

	var queryResults = query.runSuiteQL( { query: sql, params: [] } );

	var records = queryResults.asMappedResults();

	if ( records.length > 0 ) {
		responsePayload = { 'records': records };
	} else {
		responsePayload = { 'error': 'No Workbooks' };
	}

	context.response.write( JSON.stringify( responsePayload, null, 5 ) );

}



