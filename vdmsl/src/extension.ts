/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as dialect from "./dialect"
import * as dapSupport from "./dapSupport"
import * as path from 'path';
import * as fs from 'fs'
import * as net from 'net';
import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as portfinder from 'portfinder';

import { 
	workspace, 
	ExtensionContext} from 'vscode';

import {
	LanguageClientOptions,
	ServerOptions,
	StreamInfo} from 'vscode-languageclient';
import { SpecificationLanguageClient } from "./SpecificationLanguageClient";
import { POGController } from "./POGController";

var SERVERNAME = "lsp-0.0.1-SNAPSHOT.jar"
var VDMJNAME = "vdmj-4.3.0.jar"

let client: SpecificationLanguageClient;

export async function activate(context: ExtensionContext) {
	let clientLogFile = path.resolve(context.extensionPath, dialect.vdmDialect+'_lang_client.log');
	let serverLogFile = path.resolve(context.extensionPath, dialect.vdmDialect+'_lang_server.log');
	let serverMainClass = 'lsp.LSPServerStdio'
	let vdmjPath = path.resolve(context.extensionPath,'resources', VDMJNAME);
	let lspServerPath = path.resolve(context.extensionPath,'resources', SERVERNAME);

	function createServer(): Promise<StreamInfo> {
		return new Promise(async (resolve, reject) => {
			portfinder.getPortPromise()
				.then((dapPort) => {
					let args = [
						'-Dlog.filename='+serverLogFile, 
						'-cp', vdmjPath+path.delimiter+lspServerPath,
						serverMainClass, 
						'-'+dialect.vdmDialect,
						'-dap', dapPort.toString()
					]
					
					// Start the LSP server
					let server = child_process.spawn(findJavaExecutable('java'), args);
	
					resolve({
						reader: server.stdout,
						writer: server.stdin
					});

					dapSupport.initDebugConfig(context, dapPort)
				})
				.catch((err) => {
					writeToLog(clientLogFile, "Error in finding free dap port: " + err);
					return reject(err)
				});	
		})
	}

	let serverOptions: ServerOptions
	let debug = vscode.workspace.getConfiguration(dialect.vdmDialect+'-lsp').debugServer;
	if (debug) {
		let defaultLspPort = vscode.workspace.getConfiguration(dialect.vdmDialect+'-lsp').lspPort;
		let defaultDapPort = vscode.workspace.getConfiguration(dialect.vdmDialect+'-lsp').dapPort;

		serverOptions = () => {
			// Connect to language server via socket
			let socket = net.connect({port: defaultLspPort});
			let result: StreamInfo = {
				writer: socket,
				reader: socket
			};
			return Promise.resolve(result);
		};

		dapSupport.initDebugConfig(context, defaultDapPort)
	}
	else {
		serverOptions = createServer
	}

	// Setup client options
	let clientOptions: LanguageClientOptions = {
		// Document selector defines which files from the workspace, that is also open in the client, to monitor.
		documentSelector: [{ language: dialect.vdmDialect}],
		synchronize: {
			// Setup filesystem watcher for changes in vdm files
			fileEvents: workspace.createFileSystemWatcher('**/.'+dialect.vdmDialect)
		}
	}
	
	// Create the language client with the defined client options and the function to create and setup the server.
	client = new SpecificationLanguageClient(
		dialect.vdmDialect+'-lsp', 
		dialect.vdmDialect.toUpperCase()+' Language Server', 
		serverOptions, 
		clientOptions);
		
	// Start the and launch the client
	let disposable = client.start();

	// Push the disposable to the context's subscriptions so that the client can be deactivated on extension deactivation
	context.subscriptions.push(disposable);
	
	let clientPromise = new Promise<SpecificationLanguageClient>((resolve, reject) => {
		client.onReady().then(() => {
			resolve(client);
		}, (error) => {
			reject(error);
		});
	});
	
	let pogController = new POGController.POGCommandsHandler(clientPromise, Uri.file(context.extensionPath))

	////////////////////////////////////////////// Register commands //////////////////////////////////////////////////
	const registerCommand = (command: string, callback: (...args: any[]) => any) => {
		context.subscriptions.push(vscode.commands.registerCommand(command, callback));
	};

	registerCommand('extension.runPOG', (inputUri:Uri) => pogController.runPOG(inputUri));

	registerCommand('extension.runPOGSelection', (inputUri:Uri) => pogController.runPOGSelection(inputUri));

	registerCommand('extension.retrievePOs', () => pogController.retrievePOs());
}


function writeToLog(path:string, msg:string){
	let logStream = fs.createWriteStream(path, { flags: 'w' });
	logStream.write(msg);
	logStream.close();
}

// MIT Licensed code from: https://github.com/georgewfraser/vscode-javac
function findJavaExecutable(binname: string) {
	if (process.platform === 'win32')
		binname = binname + '.exe';

	// First search each JAVA_HOME bin folder
	if (process.env['JAVA_HOME']) {
		let workspaces = process.env['JAVA_HOME'].split(path.delimiter);
		for (let i = 0; i < workspaces.length; i++) {
			let binpath = path.join(workspaces[i], 'bin', binname);
			if (fs.existsSync(binpath)) {
				return binpath;
			}
		}
	}

	// Then search PATH parts
	if (process.env['PATH']) {
		let pathparts = process.env['PATH'].split(path.delimiter);
		for (let i = 0; i < pathparts.length; i++) {
			let binpath = path.join(pathparts[i], binname);
			if (fs.existsSync(binpath)) {
				return binpath;
			}
		}
	}

	// Else return the binary name directly (this will likely always fail downstream) 
	return null;
}
