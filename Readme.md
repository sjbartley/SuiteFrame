
# NetSuite Script WorkFlow

This environment allows scripts in folder 'src' to be copied, built or packed to folder 'dist'.

All files in folder 'dist' should be synchronised to a folder in the NetSuite file cabinet.

Example scripts bundled:

1) A version of NetSuite Upload is copied to folder /dist/native.
2) A TypeScript refactor of Tim Dietrich's SuiteQL API Restlet is transpiled to folder /dist/lib.
3) A Typescript refactor of Tim Dietrich's example SuiteFrame utility is packed to folder /dist/pack/sf.

## VS Code

The VS Code 'netsuite-upload' extension allows deplyment files to be synchronised to NetSuite (<https://github.com/netsuite-upload-org/netsuite-upload>).

## Installation

1) `npm i` to install node modules.
2) `npm run build` or `npm run watch` to create files in 'dist'.
3) If using VS Code, install the 'netsuite-upload' extension. Manually upload and deploy /dist/native/vscodeExtensionRestlet.js in NetSuite.

## Deployed Files

| Type | Destination Folder | Handling |
| --- | --- | --- |
| Ready-to-go files - expect .js, but could be .html, .css, etc... | 'dist/native' | Files in 'src/native' are copied. A Webpack plugin copies files as required. |
| Typescript files to be transpiled. One of these scripts may rely on other local modules, e.g. `define(["N/query", "N/record", "./throwError"], function (query, record, throwError) { ... }` will need the file 'throwError.js' to exist. | 'dist/lib' | Files in 'src/lib' are handled via tsc as per tsconfig.json. Webpack executes 'tsc' or 'tsc --watch' as required. |
| Files to be transpiled (if necessary) and packed; i.e. these scripts have NO local module dependencies. | 'dist/pack' | Files configured as entry points in webpack.comon.js. |

## Building/Packing

WebPack has been configured to handle watch and build processes, but each subfolder of 'dist' is generated differently:

- /dist/lib files are generated using tsc as per tsconfig.json; source files are in /src/lib.
- /dist/native files are simply copied from /src/native.
- /dist/pack files are packed as per the webpack configuration; various types of files can be expected.

To build once:
`>npm run build`

To build continuously (watching for changes):
`>npm run watch`

### Development vs. Production Configurations

It's really up to you whether you want readable or minimised code in your NetSuite file cabinet. Different WebPack configurations have been allowed for, but the scripts configured in package.json do not allow for all permutations.

## SuiteFrame Suitelets

I've adapted Tim Dietrich's SuiteFrame so each SuiteLet is packed, although .css and .html file dependencies remain.

### Acknowledgements

- Thanks to Tim Dietrich for explaining the SuiteFrame approach and making other utilities available <https://timdietrich.me/blog/netsuite-suiteframe>.
- Thanks to Michoel Chaikin for the example Webpack and tsconfig configurations <https://github.com/michoelchaikin/netsuite-webpack>
