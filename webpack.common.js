/*jshint esversion:9*/
import path from "path";
import TerserPlugin from "terser-webpack-plugin";
import CopyPlugin from "copy-webpack-plugin";
import WebpackShellPluginNext from "webpack-shell-plugin-next";

export default {
	entry: {
		//Files to be fully packed:
		"pack/sf/employee-directory.suitelet.js": "./src/ts-pack/employee-directory.core.suitelet.ts",
	},
	output: {
		path: path.resolve(__dirname, "dist"),
		filename: "[name]",
		clean: true,
		libraryTarget: "umd",
		globalObject: "this",
	},
	resolve: {
		extensions: ['.ts', '.js']
	},
	module: {
		rules: [
			{
				test: /\.[jt]s$/,
				use: { loader: "babel-loader" }
			},
		]
	},
	optimization: {
		// Do not remove the SuiteScript JSDoc when minifying
		minimize: true,
		minimizer: [
			new TerserPlugin({
				exclude: /native\/.*/,
				extractComments: false, //Prevent creation of .LICENSE.txt files.
				terserOptions: {
					output: {
						comments: /@NApiVersion/i,
					},
				},
			}),
		],
	},
	plugins: [
		new CopyPlugin({
			patterns: [
				//Copy off-the-shelf JS apps and modules:
				{ from: "src/native", to: path.resolve(__dirname, "dist/native") }, //Note: ensure any minimizer excludes JS files from here.

				//Copy Handlebars template and CSS files for SuiteFramework apps:
				{ from: "src/ts-pack/*.*", filter: resourcePath => /\.(css|html)$/ig.test(resourcePath), to: path.resolve(__dirname, "dist/pack/sf", "[name][ext]") },
			],
		}),

		new WebpackShellPluginNext({
			//Files in /src/lib are built (NOT packed) using tsc:
			onWatchRun: {
				scripts: ["tsc -p tsconfig.json --rootDir src/lib --outDir dist/lib --watch"],	//Note: 'tsc --watch' is sufficient if src/dest parameters are set in tsconfig.json.
				blocking: false,
				parallel: true
			},
			onAfterDone: {
				scripts: ["tsc -p tsconfig.json --rootDir src/lib --outDir dist/lib"],	//Note: 'tsc' is sufficient if src/dest parameters are set in tsconfig.json.
				blocking: true
			},
		}),
	],
	externals: [/^N\//]
};
