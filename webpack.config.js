//@ts-check

"use strict";

const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");

/**@type {import('webpack').Configuration}*/
const webConfig = {
	target: "webworker",

	entry: "./src/webExtension.ts",
	output: {
		path: path.resolve(__dirname, "dist"),
		filename: "webExtension.js",
		libraryTarget: "commonjs2",
		devtoolModuleFilenameTemplate: "../[resource-path]",
	},
	devtool: "source-map",
	externals: {
		vscode: "commonjs vscode",
	},
	resolve: {
		extensions: [".ts", ".js"],
	},
	module: {
		rules: [
			{
				test: /\.ts$/,
				exclude: /node_modules/,
				use: [
					{
						loader: "ts-loader",
					},
				],
			},
		],
	},
	performance: {
		hints: false,
	},
};

/**@type {import('webpack').Configuration}*/
const nodeConfig = {
	target: "node", // vscode extensions run in a Node.js-context 📖 -> https://webpack.js.org/configuration/node/

	entry: "./src/extension.ts", // the entry point of this extension, 📖 -> https://webpack.js.org/configuration/entry-context/
	output: {
		// the bundle is stored in the 'dist' folder (check package.json), 📖 -> https://webpack.js.org/configuration/output/
		path: path.resolve(__dirname, "dist"),
		filename: "extension.js",
		libraryTarget: "commonjs2",
		devtoolModuleFilenameTemplate: "../[resource-path]",
	},
	devtool: "source-map",
	externals: {
		vscode: "commonjs vscode", // the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot be webpack'ed, 📖 -> https://webpack.js.org/configuration/externals/
	},
	resolve: {
		// support reading TypeScript and JavaScript files, 📖 -> https://github.com/TypeStrong/ts-loader
		extensions: [".ts", ".js"],
	},
	module: {
		rules: [
			{
				test: /\.ts$/,
				exclude: /node_modules/,
				use: [
					{
						loader: "ts-loader",
					},
				],
			},
		],
	},
};

/**@type {import('webpack').Configuration}*/
const webviewConfig = {
	target: "web", // webview runs in a chromium web-context

	entry: "./src/webviews/index.tsx", // the entry point of the webviews, 📖 -> https://webpack.js.org/configuration/entry-context/
	experiments: {
        outputModule: true
    },
    mode: "development",
    output: {
		// the bundle is stored in the 'resources/webviews' folder (check package.json), 📖 -> https://webpack.js.org/configuration/output/
		path: path.resolve(__dirname, "dist", "webviews"),
		filename: "webviews.js",
		libraryTarget: "module",
	},
	devtool: "source-map",
	resolve: {
		// support reading TypeScript and JavaScript files, 📖 -> https://github.com/TypeStrong/ts-loader
		extensions: [".ts", ".js", ".tsx", ".jsx", ".css"],
	},
	module: {
		rules: [
			{
				test: /\.(ts|tsx)$/,
				exclude: /node_modules/,
				use: [
					{
						loader: "babel-loader",
					},
				],
			},
            {
                test: /\.css$/,
                use: ["style-loader", "css-loader"],
            },
		],
	},
    optimization: {
        minimize: true,
        nodeEnv: "production"
    },
    plugins: [
        new CopyPlugin({
            // Include the codicons stylesheet in the dist directory
            patterns: [
                {"from": "node_modules/@vscode/codicons/dist/", "to": "codicons"}
            ]
        })
    ]
};
module.exports = [nodeConfig, webConfig, webviewConfig];
