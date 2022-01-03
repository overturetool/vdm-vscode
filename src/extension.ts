// SPDX-License-Identifier: GPL-3.0-or-later

import * as fs from 'fs';
import * as path from 'path'
import * as net from 'net';
import * as child_process from 'child_process';
import * as LanguageId from './LanguageId'
import * as util from "./Util"
import {
    ExtensionContext, TextDocument, WorkspaceFolder, Uri, window, workspace, commands, ConfigurationChangeEvent, OutputChannel, debug, WorkspaceConfiguration
} from 'vscode';
import {
    LanguageClientOptions, ServerOptions
} from 'vscode-languageclient';
import { SpecificationLanguageClient } from "./SpecificationLanguageClient"
import { VdmDapSupport as dapSupport } from "./VdmDapSupport"
import { CTHandler } from './CTHandler';
import { VdmjCTFilterHandler } from './VdmjCTFilterHandler';
import { VdmjCTInterpreterHandler } from './VdmjCTInterpreterHandler';
import { TranslateHandler } from './TranslateHandler';
import { AddLibraryHandler } from './AddLibrary';
import { AddRunConfigurationHandler } from './AddRunConfiguration';
import { AddExampleHandler } from './ImportExample';
import { JavaCodeGenHandler } from './JavaCodeGenHandler';
import { AddToClassPathHandler } from './AddToClassPath';
import * as encoding from './Encoding';

globalThis.clients = new Map();


let _sortedWorkspaceFolders: string[] | undefined;
function sortedWorkspaceFolders(): string[] {
    if (_sortedWorkspaceFolders === void 0) {
        _sortedWorkspaceFolders = workspace.workspaceFolders ? workspace.workspaceFolders.map(folder => {
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
workspace.onDidChangeWorkspaceFolders(() => _sortedWorkspaceFolders = undefined);

function getOuterMostWorkspaceFolder(folder: WorkspaceFolder): WorkspaceFolder {
    const sorted = sortedWorkspaceFolders();
    for (const element of sorted) {
        let uri = folder.uri.toString();
        if (uri.charAt(uri.length - 1) !== '/') {
            uri = uri + '/';
        }
        if (uri.startsWith(element)) {
            return workspace.getWorkspaceFolder(Uri.parse(element))!;
        }
    }
    return folder;
}

function getDialect(document: TextDocument): string {
    return document.languageId;
}

function didChangeConfiguration(event: ConfigurationChangeEvent, wsFolder: WorkspaceFolder) {
    // Restart the extension if changes has been made to the server settings
    if (event.affectsConfiguration("vdm-vscode.server", wsFolder) || event.affectsConfiguration("files.encoding")) {
        // Ask the user to restart the extension if setting requires a restart
        window.showInformationMessage("Configurations changed. Please reload VS Code to enable it.", "Reload Now").then(res => {
            if (res == "Reload Now")
                commands.executeCommand("workbench.action.reloadWindow");
        })
    }
}

export function activate(context: ExtensionContext) {
    const extensionLogPath = path.resolve(context.logUri.fsPath, "vdm-vscode.log");
    const jarPath = path.resolve(context.extensionPath, "resources", "jars");
    const jarPath_vdmj = path.resolve(jarPath, "vdmj");
    const jarPath_vdmj_hp = path.resolve(jarPath, "vdmj_hp");

    // Make sure that the VDMJ and LSP jars are present
    if (!util.recursivePathSearch(jarPath_vdmj, /vdmj.*jar/i) ||
        !util.recursivePathSearch(jarPath_vdmj, /lsp.*jar/i)
    ) {
        return;
    }

    // Show VDM VS Code buttons
    commands.executeCommand('setContext', 'vdm-submenus-show', true);

    // Ensure logging path exists
    util.ensureDirectoryExistence(extensionLogPath);

    // Initialise handlers
    const ctHandler = new CTHandler(globalThis.clients, context, new VdmjCTFilterHandler(), new VdmjCTInterpreterHandler(), true)
    const translateHandlerLatex = new TranslateHandler(globalThis.clients, context, LanguageId.latex, "vdm-vscode.translateToLatex");
    const translateHandlerWord = new TranslateHandler(globalThis.clients, context, LanguageId.word, "vdm-vscode.translateToWord");
    const translateHandlerCov = new TranslateHandler(globalThis.clients, context, LanguageId.coverage, "vdm-vscode.translateCov");
    const translateHandlerGraphviz = new TranslateHandler(globalThis.clients, context, LanguageId.graphviz, "vdm-vscode.translateGraphviz");
    const translateHandlerIsabelle = new TranslateHandler(globalThis.clients, context, LanguageId.isabelle, "vdm-vscode.translateIsabelle");

    const addLibraryHandler = new AddLibraryHandler(globalThis.clients, context);
    const addRunConfigurationHandler = new AddRunConfigurationHandler(globalThis.clients, context);
    const addExampleHandler = new AddExampleHandler(globalThis.clients, context);
    const javaCodeGenHandler = new JavaCodeGenHandler(globalThis.clients, context);
    const addToClassPathHandler = new AddToClassPathHandler(context);

    workspace.onDidOpenTextDocument(didOpenTextDocument);
    workspace.textDocuments.forEach(didOpenTextDocument);
    workspace.onDidChangeWorkspaceFolders((event) => {
        for (const folder of event.removed) {
            const client = globalThis.clients.get(folder.uri.toString());
            if (client) {
                globalThis.clients.delete(folder.uri.toString());
                client.stop();
            }
        }
    });
    debug.onDidStartDebugSession(async (session) => {
        // Launch client if this has not been done
        if (!globalThis.clients.has(session.workspaceFolder.uri.toString())) {

            // FIXME the retry should be done automatically, but right now I can't find a reliable way to know if the client is ready....
            window.showErrorMessage(`Unable to find server for workspace folder ${session.workspaceFolder.name}, please retry`, "Retry", "Close").then(res => {
                if (res == "Retry")
                    debug.startDebugging(session.workspaceFolder, session.configuration)
            })

            let dialect = await util.guessDialect(session.workspaceFolder);
            if (dialect)
                // await launchClient(session.workspaceFolder, dialect);
                launchClient(session.workspaceFolder, dialect);
        }
    })

    function didOpenTextDocument(document: TextDocument): void {
        // We are only interested in vdm text
        if (document.languageId !== 'vdmsl' && document.languageId !== 'vdmpp' && document.languageId !== 'vdmrt') {
            return;
        }

        // Check that the document encoding matches the encoding setting
        encoding.checkEncodingMatch(document, extensionLogPath)

        const uri = document.uri;
        let folder = workspace.getWorkspaceFolder(uri);
        // Files outside a folder can't be handled. 
        if (!folder) { // TODO remove if we get support for single file workspace
            return;
        }
        // If we have nested workspace folders we only start a server on the outer most workspace folder.
        folder = getOuterMostWorkspaceFolder(folder);

        // Start client for the folder
        launchClient(folder, getDialect(document));
    }



    async function launchClient(wsFolder: WorkspaceFolder, dialect: string) {
        const clientKey = wsFolder.uri.toString();

        // Abort if client already exists
        if (globalThis.clients.has(clientKey)) {
            return;
        }

        // Add client to list
        globalThis.clients.set(clientKey, null);

        // Add settings watch for workspace folder
        workspace.onDidChangeConfiguration(e => didChangeConfiguration(e, wsFolder));

        // Setup client options
        const clientOptions: LanguageClientOptions = {
            // Document selector defines which files from the workspace, that is also open in the client, to monitor.
            documentSelector: [{ scheme: 'file', language: dialect, pattern: `${wsFolder.uri.fsPath}/**/*` }],
            diagnosticCollectionName: "vdm-vscode",
            workspaceFolder: wsFolder
        }

        // Setup server options
        const serverOptions: ServerOptions = () => {
            return new Promise((resolve, reject) => {
                // If using experimental server
                const devConfig: WorkspaceConfiguration = workspace.getConfiguration('vdm-vscode.server.development', wsFolder);
                if (devConfig.experimentalServer) {
                    const lspPort = devConfig.lspPort;
                    window.showInformationMessage(`Connecting to experimental server on LSP port ${lspPort}`);
                    const socket = net.connect(lspPort)
                    resolve({ writer: socket, reader: socket })
                }
                else {
                    // Create socket connection
                    const server = net.createServer((socket) => {
                        resolve({ writer: socket, reader: socket })
                    });
                    // Select a random port
                    server.listen(0, 'localhost', null, () => {
                        let address = server.address();
                        if (address && typeof address != "string")
                            launchServer(wsFolder, dialect, address.port)
                        else
                            reject("Could not get port")
                    })
                }
            })
        };

        // Create the language client with the defined client options and the function to create and setup the server.
        let client = new SpecificationLanguageClient(
            `vdm-vscode_${wsFolder.name}_client`,
            `${wsFolder.name}_client`,
            dialect,
            serverOptions,
            clientOptions,
            context,
            util.joinUriPath(wsFolder.uri, ".generated")
        );

        // Setup DAP
        client.onReady().then(() => {
            let port = (client?.initializeResult?.capabilities?.experimental?.dapServer?.port);
            if (!port)
                port = workspace.getConfiguration('vdm-vscode.server.development', wsFolder).get("dapPort", 8001)
            dapSupport.initDebugConfig(context, wsFolder, port)
        })

        // Start the and launch the client
        let disposable = client.start();

        // Push the disposable to the context's subscriptions so that the client can be deactivated on extension deactivation
        context.subscriptions.push(disposable);

        // Save client
        globalThis.clients.set(clientKey, client);
    }

    function launchServer(wsFolder: WorkspaceFolder, dialect: string, lspPort: number) {
        // Get server configurations
        const serverConfig: WorkspaceConfiguration = workspace.getConfiguration('vdm-vscode.server', wsFolder);
        const developmentConfig: WorkspaceConfiguration = serverConfig.get("development")
        const stdioConfig: WorkspaceConfiguration = serverConfig.get("stdio")

        // Setup server arguments
        let args: string[] = [];
        let JVMArguments: string = serverConfig.JVMArguments;
        if (JVMArguments != "") {
            let split = JVMArguments.split(" ").filter(v => v != "")
            let i = 0;
            while (i < split.length - 1) {
                if (split[i].includes("\"")) {
                    split[i] = split[i] + " " + split[i + 1]
                    split.splice(i + 1, 1)
                }
                i++;
            }
            args.push(...split);
        }

        // Activate server log
        if (developmentConfig.activateServerLog) {
            // Ensure logging path exists
            const languageServerLoggingPath = path.resolve(context.logUri.fsPath, wsFolder.name.toString() + '_lang_server.log');
            util.ensureDirectoryExistence(languageServerLoggingPath);
            args.push(`-Dlsp.log.filename=${languageServerLoggingPath}`);
        }

        // Set encoding
        const encodingSetting = workspace.getConfiguration('files', wsFolder).get('encoding', 'utf8');
        const javaEncoding = encoding.toJavaName(encodingSetting)
        if (javaEncoding)
            args.push(`-Dlsp.encoding=${javaEncoding}`)

        // Construct class path
        let classPath = "";

        // Add user defined paths to class path
        if (serverConfig.classPathAdditions) {
            serverConfig.classPathAdditions.forEach(p => {
                let pathToCheck = (p.endsWith(path.sep + '*') ? p.substr(0, p.length - 2) : p)
                if (!fs.existsSync(pathToCheck)) {
                    let m = "Invalid path in class path additions: " + p;
                    window.showWarningMessage(m)
                    util.writeToLog(extensionLogPath, m);
                    return;
                }
                classPath += p + path.delimiter;
            })
        }

        // Add jars folders to class path
        // Note: Added in the end to allow overriding annotations in user defined annotations, such as overriding "@printf" *(see issue #69)
        classPath += path.resolve((serverConfig?.highPrecision === true ? jarPath_vdmj_hp : jarPath_vdmj), "*");

        // Construct java launch arguments
        args.push(...[
            '-cp', classPath,
            'lsp.LSPServerSocket',
            '-' + dialect,
            '-lsp', lspPort.toString(), '-dap', '0'
        ]);

        // Start the LSP server
        let javaPath = util.findJavaExecutable('java');
        if (!javaPath) {
            window.showErrorMessage("Java runtime environment not found!")
            util.writeToLog(extensionLogPath, "Java runtime environment not found!");
            globalThis.clients.delete(wsFolder.uri.toString());
            return;
        }
        let server = child_process.spawn(javaPath, args, { cwd: wsFolder.uri.fsPath });

        // Create output channel for server stdout
        let stdoutLogPath = stdioConfig.stdioLogPath;
        if (stdioConfig.activateStdoutLogging) {
            // Log to file
            if (stdoutLogPath != "") {
                util.ensureDirectoryExistence(stdoutLogPath + path.sep + wsFolder.name.toString())
                server.stdout.addListener("data", chunk => util.writeToLog(stdoutLogPath + path.sep + wsFolder.name.toString() + "_stdout.log", chunk));
                server.stderr.addListener("data", chunk => util.writeToLog(stdoutLogPath + path.sep + wsFolder.name.toString() + "_stderr.log", chunk));
            }
            // Log to terminal
            else {
                let outputChannel: OutputChannel = window.createOutputChannel("VDM: " + wsFolder.name.toString());
                server.stdout.addListener("data", chunk => {
                    outputChannel.show(true);
                    outputChannel.appendLine(chunk)
                })
                server.stderr.addListener("data", chunk => {
                    outputChannel.show(true);
                    outputChannel.appendLine(chunk)
                })
            }
        }
        else { //Discard stdout messages
            server.stdout.addListener("data", chunk => { });
            server.stderr.addListener("data", chunk => { });
        }
    }
}

export function deactivate(): Thenable<void> | undefined {
    let promises: Thenable<void>[] = [];
    for (let client of globalThis.clients.values()) {
        promises.push(client.stop());
    }
    return Promise.all(promises).then(() => undefined);
}
