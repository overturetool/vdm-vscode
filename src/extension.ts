// SPDX-License-Identifier: GPL-3.0-or-later

import * as fs from 'fs-extra';
import * as path from 'path'
import * as net from 'net';
import * as child_process from 'child_process';
import * as util from "./Util"
import {
    ExtensionContext, TextDocument, WorkspaceFolder, Uri, window, workspace, commands, ConfigurationChangeEvent, OutputChannel, WorkspaceConfiguration
} from 'vscode';
import {
    LanguageClientOptions, ServerOptions
} from 'vscode-languageclient/node';
import { SpecificationLanguageClient } from "./SpecificationLanguageClient"
import { VdmDapSupport as dapSupport } from "./VdmDapSupport"
import { CTHandler } from './slsp/features/CTHandler';
import { VdmjCTFilterHandler } from './VdmjCTFilterHandler';
import { VdmjCTInterpreterHandler } from './VdmjCTInterpreterHandler';
import { AddLibraryHandler } from './AddLibrary';
import { AddRunConfigurationHandler } from './AddRunConfiguration';
import { AddExampleHandler } from './ImportExample';
import { JavaCodeGenHandler } from './JavaCodeGenHandler';
import { AddToClassPathHandler } from './AddToClassPath';
import * as encoding from './Encoding';
import { } from './slsp/events/SLSPEvents';
import { ProofObligationPanel } from './slsp/views/ProofObligationPanel';

let clients: Map<string, SpecificationLanguageClient>;
export function activate(context: ExtensionContext) {
    const jarPath = path.resolve(context.extensionPath, "resources", "jars");
    const jarPath_vdmj = path.resolve(jarPath, "vdmj");
    const jarPath_vdmj_hp = path.resolve(jarPath, "vdmj_hp");

    clients = new Map();
    let _sortedWorkspaceFolders: string[] | undefined;

    // Make sure that there is a java executable
    const javaPath = util.findJavaExecutable('java');
    if (!javaPath) {
        let m = "Java runtime environment not found!";
        window.showErrorMessage(m);
        console.error(m);
        return;
    }

    // Make sure that the VDMJ and LSP jars are present
    if (!util.recursivePathSearch(jarPath_vdmj, /vdmj.*jar/i) ||
        !util.recursivePathSearch(jarPath_vdmj, /lsp.*jar/i)
    ) {
        let m = "Server jars not found!";
        window.showErrorMessage(m);
        console.error(m);
        return;
    }

    // Show VDM VS Code buttons
    commands.executeCommand('setContext', 'vdm-submenus-show', true);

    // Initialise POG panel // TODO Find better place for this (perhaps create a UI class that takes care of stuff like this)
    context.subscriptions.push(new ProofObligationPanel(context));

    // Initialise handlers
    const ctHandler = new CTHandler(clients, context, new VdmjCTFilterHandler(), new VdmjCTInterpreterHandler(), true);

    const addLibraryHandler = new AddLibraryHandler(clients, context);
    const addRunConfigurationHandler = new AddRunConfigurationHandler(clients, context);
    const addExampleHandler = new AddExampleHandler(clients, context);
    const javaCodeGenHandler = new JavaCodeGenHandler(clients, context);
    const addToClassPathHandler = new AddToClassPathHandler(context);

    // Initialise debug handler
    dapSupport.initDebugConfig(context);

    // Register commands and event handlers
    context.subscriptions.push(commands.registerCommand("vdm-vscode.openServerLog", openServerLog));
    context.subscriptions.push(commands.registerCommand("vdm-vscode.openServerLogFolder", openServerLogFolder));
    context.subscriptions.push(workspace.onDidOpenTextDocument(didOpenTextDocument));
    workspace.textDocuments.forEach(didOpenTextDocument);
    context.subscriptions.push(workspace.onDidChangeWorkspaceFolders(e => stopClients(e.removed)));
    context.subscriptions.push(workspace.onDidChangeWorkspaceFolders(() => _sortedWorkspaceFolders = undefined));


    // ******************************************************************************
    // ******************** Function definitions below ******************************
    // ******************************************************************************

    function didOpenTextDocument(document: TextDocument): void {
        // We are only interested in vdm text
        if (document.languageId !== 'vdmsl' && document.languageId !== 'vdmpp' && document.languageId !== 'vdmrt') {
            return;
        }

        // Check that the document encoding matches the encoding setting
        encoding.checkEncoding(document);

        const uri = document.uri;
        let folder = workspace.getWorkspaceFolder(uri);
        // Files outside a folder can't be handled. 
        if (!folder) { // TODO remove if we get support for single file workspace
            return;
        }
        // If we have nested workspace folders we only start a server on the outer most workspace folder.
        folder = getOuterMostWorkspaceFolder(folder);

        // Start client for the folder
        launchClient(folder, document.languageId);
    }

    async function launchClient(wsFolder: WorkspaceFolder, dialect: string) {
        const clientKey = wsFolder.uri.toString();

        // Abort if client already exists
        if (clients.has(clientKey)) {
            return;
        }

        // Add client to list
        clients.set(clientKey, null);

        // Add settings watch for workspace folder
        context.subscriptions.push(workspace.onDidChangeConfiguration(e => didChangeConfiguration(e, wsFolder)));

        // Setup client options
        const clientOptions: LanguageClientOptions = {
            // Document selector defines which files from the workspace, that is also open in the client, to monitor.
            documentSelector: [{ scheme: 'file', language: dialect, pattern: `${wsFolder.uri.fsPath}/**/*` }],
            diagnosticCollectionName: "vdm-vscode",
            workspaceFolder: wsFolder,
            traceOutputChannel: window.createOutputChannel(`vdm-vscode: ${wsFolder.name}`)
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
            `vdm-vscode`,
            dialect,
            serverOptions,
            clientOptions,
            util.joinUriPath(wsFolder.uri, ".generated"),
        );

        // Setup DAP
        client.onReady().then(() => {
            let port = (client?.initializeResult?.capabilities?.experimental?.dapServer?.port);
            if (port)
                dapSupport.addPort(wsFolder, port);
            else
                console.warn("Did not receive a DAP port on start up, debugging is not activated");
        })

        // Start the and launch the client
        console.info(`Launching client for the folder ${wsFolder.name} with language ID ${dialect}`,);
        let disposable = client.start();

        // Push the disposable to the context's subscriptions so that the client can be deactivated on extension deactivation
        context.subscriptions.push(disposable);

        // Save client
        clients.set(clientKey, client);
    }

    function launchServer(wsFolder: WorkspaceFolder, dialect: string, lspPort: number) {
        // Get server configurations
        const serverConfig: WorkspaceConfiguration = workspace.getConfiguration('vdm-vscode.server', wsFolder);
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
        const logLevel = serverConfig.get("logLevel", "off");
        if (logLevel != "off") {
            // Ensure logging path exists
            const languageServerLoggingPath = path.resolve(context.logUri.fsPath, wsFolder.name.toString() + '_lang_server.log');
            util.ensureDirectoryExistence(languageServerLoggingPath);
            args.push(`-Dlsp.log.filename=${languageServerLoggingPath}`);
            args.push(`-Dlsp.log.level=${logLevel}`);
        }

        // Set encoding
        const encodingSetting = workspace.getConfiguration('files', wsFolder).get('encoding', 'utf8');
        const javaEncoding = encoding.toJavaName(encodingSetting)
        if (javaEncoding)
            args.push(`-Dlsp.encoding=${javaEncoding}`);
        else
            console.warn(`Could not recognize encoding (files.encoding: ${encodingSetting}) the -Dlsp.encoding server argument is NOT set`);

        // Construct class path
        let classPath = "";

        // Add user defined paths to class path
        if (serverConfig.classPathAdditions) {
            serverConfig.classPathAdditions.forEach((p: string) => {
                let pathToCheck = (p.endsWith(path.sep + '*') ? p.substring(0, p.length - 2) : p)
                if (!fs.existsSync(pathToCheck)) {
                    let m = "Invalid path in class path additions: " + p;
                    window.showWarningMessage(m);
                    console.warn(m);
                }
                else {
                    classPath += p + path.delimiter;
                }
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

    function openServerLog() {
        const logFolder: Uri = context.logUri;

        if (!fs.existsSync(logFolder.fsPath))
            return window.showErrorMessage("No logs found");

        const logsInFolder: string[] = fs.readdirSync(logFolder.fsPath).filter(x => x.endsWith(".log"));

        if (!logsInFolder || logsInFolder.length == 0)
            return window.showErrorMessage("No logs found");

        if (logsInFolder.length == 1) {
            let uri = Uri.joinPath(logFolder, logsInFolder[0]);
            window.showTextDocument(uri)
        }
        else {
            window.showQuickPick(logsInFolder, { title: 'select log to open', canPickMany: false }).then(log => {
                if (log) {
                    let uri = Uri.joinPath(logFolder, log);
                    window.showTextDocument(uri)
                }
            })
        }
    }

    function openServerLogFolder() {
        fs.ensureDirSync(context.logUri.fsPath);
        commands.executeCommand("revealFileInOS", context.logUri);
    }

    function stopClients(wsFolders: readonly WorkspaceFolder[]) {
        for (const folder of wsFolders) {
            const client = clients.get(folder.uri.toString());
            if (client) {
                clients.delete(folder.uri.toString());
                client.stop();
            }
        }
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
}

export function deactivate(): Thenable<void> | undefined {
    let promises: Thenable<void>[] = [];

    // Hide VDM VS Code buttons
    promises.push(commands.executeCommand('setContext', 'vdm-submenus-show', false));

    // Stop clients
    if (clients) {
        clients.forEach(client => {
            promises.push(client.stop())
        });
    }

    return Promise.all(promises).then(() => undefined);
}
