/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import {VdmDapSupport as dapSupport} from "./VdmDapSupport"
import * as util from "./Util"
import * as path from 'path';
import * as net from 'net';
import * as child_process from 'child_process';
import * as portfinder from 'portfinder';
import * as vscode from 'vscode'
import { workspace, ExtensionContext } from 'vscode';
import {LanguageClientOptions, ServerOptions } from 'vscode-languageclient';
import { SpecificationLanguageClient } from "./SpecificationLanguageClient";

let client : SpecificationLanguageClient;

export async function activate(context: ExtensionContext, vdmDialect : string) {
    let clientLogFile = path.resolve(context.extensionPath, vdmDialect + '_lang_client.log');
    let serverLogFile = path.resolve(context.extensionPath, vdmDialect + '_lang_server.log');
    let serverMainClass =  'lsp.LSPServerSocket';
    let lspPort: number;
    let dapPort: number;

	let vdmjPath = util.recursivePathSearch(path.resolve(context.extensionPath, "resources"), /vdmj.*jar/i);
    let lspServerPath = util.recursivePathSearch(path.resolve(context.extensionPath, "resources"), /lsp.*jar/i);
    if(!vdmjPath || !lspServerPath)
        return;

    extensionLanguage = vdmDialect;

    let debug = workspace.getConfiguration(vdmDialect + '-lsp').experimentalServer;
    if (debug) {
        lspPort = workspace.getConfiguration(vdmDialect + '-lsp').lspPort;
        dapPort = workspace.getConfiguration(vdmDialect + '-lsp').dapPort;
        createClient();
    }
    else {
        // Get two available ports, start the server and create the client
        portfinder.getPorts(2, {host: undefined, startPort: undefined, port: undefined, stopPort: undefined}, (err, ports) => {
            if(err)
            {
                vscode.window.showErrorMessage("An error occured when finding free ports: " + err)
                util.writeToLog(clientLogFile, "An error occured when finding free ports: " + err);
                return;
            }
            lspPort = ports[0];
            dapPort = ports[1];

            // Setup server arguments
            let args : string[] = [];
            let JVMArguments = workspace.getConfiguration(vdmDialect + '-lsp').JVMArguments;
            if(JVMArguments != "")
                args.push(JVMArguments);
    
            let activateServerLog = workspace.getConfiguration(vdmDialect + '-lsp').activateServerLog;
            if(activateServerLog)
                args.push('-Dlog.filename=' + serverLogFile);
    
            args.push(...[
                '-cp', vdmjPath + path.delimiter + lspServerPath,
                serverMainClass,
                '-' + vdmDialect,
                '-lsp', lspPort.toString(), '-dap', dapPort.toString()
            ]);
    
            // Start the LSP server
            let javaPath = util.findJavaExecutable('java');
            if (!javaPath) {
                vscode.window.showErrorMessage("Java runtime environment not found!")
                util.writeToLog(clientLogFile, "Java runtime environment not found!");
                return;
            }
            child_process.spawn(javaPath, args);

            // Create the client and connect
            createClient();
        });
    }

    // Function for creating the client
    function createClient()
    {
        // Setup DAP
        dapSupport.initDebugConfig(context, dapPort, vdmDialect)

        // Setup server options
        let serverOptions: ServerOptions = () => {
            // Create socket connection
            let socket = net.connect({ port: lspPort });

            return Promise.resolve( {
                writer: socket,
                reader: socket
            });
        };

        // Setup client options
        let clientOptions: LanguageClientOptions = {
            // Document selector defines which files from the workspace, that is also open in the client, to monitor.
            documentSelector: [{ language: vdmDialect }],
            synchronize: {
                // Setup filesystem watcher for changes in vdm files
                fileEvents: workspace.createFileSystemWatcher('**/.' + vdmDialect)
            }
        }

        // Create the language client with the defined client options and the function to create and setup the server.
        let client = new SpecificationLanguageClient(
            vdmDialect + '-lsp',
            vdmDialect.toUpperCase() + ' Language Server',
            serverOptions,
            clientOptions,
            context
        );

        // Start the and launch the client
        let disposable = client.start();

        // Push the disposable to the context's subscriptions so that the client can be deactivated on extension deactivation
        context.subscriptions.push(disposable);
    }
}

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}

export var extensionLanguage: string;