import * as path from 'path'
import * as net from 'net';
import * as child_process from 'child_process';
import * as portfinder from 'portfinder';
import {
    workspace as Workspace, window as Window, ExtensionContext, TextDocument, WorkspaceFolder, Uri
} from 'vscode';
import {
    LanguageClientOptions, ServerOptions
} from 'vscode-languageclient';
import { SpecificationLanguageClient } from "./SpecificationLanguageClient"
import * as Util from "./Util"
import {VdmDapSupport as dapSupport} from "./VdmDapSupport"

globalThis.clients = new Map();

let _sortedWorkspaceFolders: string[] | undefined;
function sortedWorkspaceFolders(): string[] {
    if (_sortedWorkspaceFolders === void 0) {
        _sortedWorkspaceFolders = Workspace.workspaceFolders ? Workspace.workspaceFolders.map(folder => {
            let result = folder.uri.toString();
            if (result.charAt(result.length - 1) !== '/') {
                result = result + '/';
            }
            return result;
        }).sort(
            (a, b) => {
                return a.length - b.length;
            }
        ) : [];
    }
    return _sortedWorkspaceFolders;
}
Workspace.onDidChangeWorkspaceFolders(() => _sortedWorkspaceFolders = undefined);

function getOuterMostWorkspaceFolder(folder: WorkspaceFolder): WorkspaceFolder {
    const sorted = sortedWorkspaceFolders();
    for (const element of sorted) {
        let uri = folder.uri.toString();
        if (uri.charAt(uri.length - 1) !== '/') {
            uri = uri + '/';
        }
        if (uri.startsWith(element)) {
            return Workspace.getWorkspaceFolder(Uri.parse(element))!;
        }
    }
    return folder;
}

function getDialect(document: TextDocument): string{
    return document.languageId;
}

export function activate(context: ExtensionContext) {
    globalThis.clientLogPath = path.resolve(context.extensionPath, 'vdm_lang_client.log');
    let vdmjPath = Util.recursivePathSearch(path.resolve(context.extensionPath, "resources"), /vdmj.*jar/i);
    let lspServerPath = Util.recursivePathSearch(path.resolve(context.extensionPath, "resources"), /lsp.*jar/i);
    if (!vdmjPath || !lspServerPath)
        return;

    function didOpenTextDocument(document: TextDocument): void {
        // We are only interested in vdm text
        if (document.languageId !== 'vdmsl' && document.languageId !== 'vdmpp'  && document.languageId !== 'vdmrt') {
            return;
        }

        const uri = document.uri;
        let folder = Workspace.getWorkspaceFolder(uri);
        // Files outside a folder can't be handled. This might depend on the language.
        // Single file languages like JSON might handle files outside the workspace folders.
        if (!folder) {
            return;
        }
        // If we have nested workspace folders we only start a server on the outer most workspace folder.
        folder = getOuterMostWorkspaceFolder(folder);

        if (!globalThis.clients.has(folder.uri.toString())) {
            
            let serverLogFile = path.resolve(context.extensionPath, folder.name.toString() + '_lang_server.log');
            
            let dialect = getDialect(document);
            launchClient(dialect, lspServerPath, vdmjPath, globalThis.clientLogPath, serverLogFile, folder);

            globalThis.clients.set(folder.uri.toString(), null);
        }
    }

    function launchClient(dialect: string, lspServerPath: string, vdmjPath: string, clientLogFile: string, serverLogFile: string, folder: WorkspaceFolder): void {
        let serverMainClass = 'lsp.LSPServerSocket';
    
        // Get two available ports, start the server and create the client
        portfinder.getPorts(2, {host: undefined, startPort: undefined, port: undefined, stopPort: undefined}, async (err, ports) => {
            if(err)
            {
                Window.showErrorMessage("An error occured when finding free ports: " + err)
                Util.writeToLog(clientLogFile, "An error occured when finding free ports: " + err);
                globalThis.clients.delete(folder.uri.toString());
                return;
            }
            let lspPort = ports[0];
            let dapPort = ports[1];
    
            // Setup server arguments
            let args : string[] = [];
            let JVMArguments = Workspace.getConfiguration('vdm-vscode').JVMArguments;
            if(JVMArguments != "")
                args.push(JVMArguments);
    
            let activateServerLog = Workspace.getConfiguration('vdm-vscode').activateServerLog;
            if(activateServerLog)
                args.push('-Dlog.filename=' + serverLogFile);
    
            args.push(...[
                '-cp', vdmjPath + path.delimiter + lspServerPath,
                serverMainClass,
                '-' + dialect,
                '-lsp', lspPort.toString(), '-dap', dapPort.toString()
            ]);
    
            // Start the LSP server
            let javaPath = Util.findJavaExecutable('java');
            if (!javaPath) {
                Window.showErrorMessage("Java runtime environment not found!")
                Util.writeToLog(clientLogFile, "Java runtime environment not found!");
                globalThis.clients.delete(folder.uri.toString());
                return;
            }
            child_process.spawn(javaPath, args);
    
            // Wait for the server to be ready
            let connected = false;
            let timeOutCounter = 0;
            while(!connected)
            {
                var sock = net.connect(lspPort, 'localhost',() => { 
                    sock.destroy();
                    connected = true;
                });
                await new Promise(resolve => sock.once("close", () => setTimeout(resolve, 25)))
                if(timeOutCounter++ == 100){
                    Window.showErrorMessage("ERROR: LSP server connection timeout");
                    Util.writeToLog(clientLogFile, "ERROR: LSP server connection timeout");
                    globalThis.clients.delete(folder.uri.toString());
                    return;
                }
            }
    
            let client = createClient(dialect, lspPort, dapPort, folder);
    
            // Save client
            globalThis.clients.set(folder.uri.toString(), client);
        });
    }

    let once = false;
    function createClient(dialect: string, lspPort: number, dapPort: number, folder: WorkspaceFolder): SpecificationLanguageClient {
        // Setup DAP
        dapSupport.initDebugConfig(context, folder, dapPort)

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
            documentSelector: [{language: dialect}],
            synchronize: {
                // Setup filesystem watcher for changes in vdm files
                fileEvents: Workspace.createFileSystemWatcher('**/.' + dialect)
            }
        }
        if (folder){
            clientOptions.documentSelector = [{ scheme: 'file', language: dialect, pattern: `${folder.uri.fsPath}/**/*`}];
            clientOptions.diagnosticCollectionName = "vdm-vscode";
            clientOptions.workspaceFolder = folder;
        }

        // Create the language client with the defined client options and the function to create and setup the server.
        let client = new SpecificationLanguageClient(
            'vdm-vscode',
            'VDM Language Server',
            serverOptions,
            clientOptions,
            context
        );

        // Start the and launch the client
        let disposable = client.start();

        // Push the disposable to the context's subscriptions so that the client can be deactivated on extension deactivation
        context.subscriptions.push(disposable);

        return client;
    }


    let debug = Workspace.getConfiguration('vdm-vscode').experimentalServer;
    if (debug) {
        let dialect = Workspace.getConfiguration('vdm-vscode').dialect;
        let lspPort = Workspace.getConfiguration('vdm-vscode').lspPort;
        let dapPort = Workspace.getConfiguration('vdm-vscode').dapPort;
        
        createClient(dialect, lspPort, dapPort, Workspace.workspaceFolders[0]);
        return;
    }

    Workspace.onDidOpenTextDocument(didOpenTextDocument);
    Workspace.textDocuments.forEach(didOpenTextDocument);
    Workspace.onDidChangeWorkspaceFolders((event) => {
        for (const folder of event.removed) {
            const client = globalThis.clients.get(folder.uri.toString());
            if (client) {
                globalThis.clients.delete(folder.uri.toString());
                client.stop();
            }
        }
    });
}

export function deactivate(): Thenable<void> | undefined {
    let promises: Thenable<void>[] = [];
    for (let client of globalThis.clients.values()) {
        promises.push(client.stop());
    }
    return Promise.all(promises).then(() => undefined);
}
