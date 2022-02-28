// SPDX-License-Identifier: GPL-3.0-or-later

import * as net from "net";
import * as fs from "fs-extra";
import * as path from "path";
import * as child_process from "child_process";
import * as util from "../Util";
import * as encoding from "../Encoding";
import * as Plugins from "./Plugins";
import { AddLibraryHandler } from "../AddLibraryHandler";
import { WorkspaceConfiguration, workspace, window, WorkspaceFolder, OutputChannel, Disposable } from "vscode";
import { ServerOptions } from "vscode-languageclient/node";
import { getExtensionPath } from "../util/ExtensionUtil";
import { ServerLog } from "./ServerLog";

export class ServerFactory implements Disposable {
    private _jarPath: string;
    private _jarPath_vdmj: string;
    private _jarPath_vdmj_hp: string;
    private _javaPath: string;

    constructor(private _log: ServerLog) {
        // Setup jar paths
        this._jarPath = path.resolve(getExtensionPath(), "resources", "jars");
        this._jarPath_vdmj = path.resolve(this._jarPath, "vdmj");
        this._jarPath_vdmj_hp = path.resolve(this._jarPath, "vdmj_hp");

        // Make sure that there is a java executable
        this._javaPath = util.findJavaExecutable("java");
        if (!this._javaPath) {
            let m = "Java runtime environment not found!";
            console.error("[ServerFactory] " + m);
            throw new Error(m);
        }

        // Make sure that the VDMJ and LSP jars are present
        if (!util.recursivePathSearch(this._jarPath_vdmj, /vdmj.*jar/i) || !util.recursivePathSearch(this._jarPath_vdmj, /lsp.*jar/i)) {
            let m = "Server jars not found!";
            console.error("[ServerFactory] " + m);
            throw new Error(m);
        }
    }

    dispose() {
        this._log.dispose();
    }

    createServerOptions(wsFolder: WorkspaceFolder, dialect: string): ServerOptions {
        // Setup server options
        const serverOptions: ServerOptions = () => {
            return new Promise((resolve, reject) => {
                // If using experimental server
                const devConfig: WorkspaceConfiguration = this.getServerConfig(wsFolder).development;
                if (devConfig.experimentalServer) {
                    const lspPort = devConfig.lspPort;
                    window.showInformationMessage(`Connecting to experimental server on LSP port ${lspPort}`);
                    const socket = net.connect(lspPort);
                    resolve({ writer: socket, reader: socket });
                } else {
                    // Create socket connection
                    const server = net.createServer((socket) => {
                        // Resolve when connection is established
                        resolve({ writer: socket, reader: socket });
                    });

                    // Select a random port
                    server.listen(0, "localhost", null, () => {
                        let address = server.address();
                        if (address && typeof address != "string") this.launchServer(wsFolder, dialect, address.port);
                        else reject("Could not get port");
                    });
                }
            });
        };
        return serverOptions;
    }

    private getServerConfig(wsFolder: WorkspaceFolder): WorkspaceConfiguration {
        return workspace.getConfiguration("vdm-vscode.server", wsFolder);
    }

    private launchServer(wsFolder: WorkspaceFolder, dialect: string, lspPort: number) {
        // Get server configurations
        const serverConfig: WorkspaceConfiguration = this.getServerConfig(wsFolder);
        const stdioConfig: WorkspaceConfiguration = serverConfig.get("stdio");

        // Setup server arguments
        let args: string[] = [];
        let JVMArguments: string = serverConfig.JVMArguments;
        if (JVMArguments != "") {
            let split = JVMArguments.split(" ").filter((v) => v != "");
            let i = 0;
            while (i < split.length - 1) {
                if (split[i].includes('"')) {
                    split[i] = split[i] + " " + split[i + 1];
                    split.splice(i + 1, 1);
                }
                i++;
            }
            args.push(...split);
        }

        // Add Plugin related JVM args
        const pluginArgs = Plugins.getJvmAdditions(wsFolder, dialect);
        if (pluginArgs) args.push(pluginArgs);

        // Activate server log
        const logLevel = serverConfig.get("logLevel", "off");
        if (logLevel != "off") {
            // Ensure logging path exists
            const languageServerLoggingPath = path.resolve(this._log.uri.fsPath, wsFolder.name.toString() + "_lang_server.log");
            util.ensureDirectoryExistence(languageServerLoggingPath);
            args.push(`-Dlsp.log.filename=${languageServerLoggingPath}`);
            args.push(`-Dlsp.log.level=${logLevel}`);
        }

        // Set encoding
        const encodingSetting = workspace.getConfiguration("files", wsFolder).get("encoding", "utf8");
        const javaEncoding = encoding.toJavaName(encodingSetting);
        if (javaEncoding) args.push(`-Dlsp.encoding=${javaEncoding}`);
        else
            console.warn(
                `[Extension] Could not recognize encoding (files.encoding: ${encodingSetting}) the -Dlsp.encoding server argument is NOT set`
            );

        // Construct class path.
        let classPath: string = "";
        // Start by adding user defined library jar paths
        AddLibraryHandler.getUserDefinedLibraryJars(wsFolder).forEach((libPath) => (classPath += libPath + path.delimiter));

        // Add default library jars folder path
        if (workspace.getConfiguration("vdm-vscode.server.libraries", wsFolder).includeDefaultLibraries) {
            const libPath: string = AddLibraryHandler.getIncludedLibrariesFolderPath(getExtensionPath(), wsFolder);
            if (libPath) {
                classPath += path.resolve(libPath, "*") + path.delimiter;
            }
        }

        // Add plugin jars
        Plugins.getClasspathAdditions(wsFolder, dialect).forEach((cp) => (classPath += cp + path.delimiter));

        // Add user defined paths
        (serverConfig.classPathAdditions as string[]).forEach((cp) => {
            const pathToCheck: string = cp.endsWith(path.sep + "*") ? cp.substr(0, cp.length - 2) : cp;
            if (!fs.existsSync(pathToCheck)) {
                const msg: string = "Invalid path in class path additions: " + cp;
                window.showWarningMessage(msg);
                console.warn("[Extension] " + msg);
            } else {
                classPath += cp + path.delimiter;
            }
        });

        // Add vdmj jars folders
        // Note: Added in the end to allow overriding annotations in user defined annotations, such as overriding "@printf" *(see issue #69)
        classPath += path.resolve(serverConfig?.highPrecision === true ? this._jarPath_vdmj_hp : this._jarPath_vdmj, "*") + path.delimiter;

        // Construct java launch arguments
        args.push(...["-cp", classPath, "lsp.LSPServerSocket", "-" + dialect, "-lsp", lspPort.toString(), "-dap", "0"]);

        // TODO add -strict flag

        // Start the LSP server
        let server = child_process.spawn(this._javaPath, args, { cwd: wsFolder.uri.fsPath });

        // Create output channel for server stdout
        let stdoutLogPath = stdioConfig.stdioLogPath;
        if (stdioConfig.activateStdoutLogging) {
            // Log to file
            if (stdoutLogPath != "") {
                util.ensureDirectoryExistence(stdoutLogPath + path.sep + wsFolder.name.toString());
                server.stdout.addListener("data", (chunk) =>
                    util.writeToLog(stdoutLogPath + path.sep + wsFolder.name.toString() + "_stdout.log", chunk)
                );
                server.stderr.addListener("data", (chunk) =>
                    util.writeToLog(stdoutLogPath + path.sep + wsFolder.name.toString() + "_stderr.log", chunk)
                );
            }
            // Log to terminal
            else {
                let outputChannel: OutputChannel = window.createOutputChannel("VDM: " + wsFolder.name.toString());
                server.stdout.addListener("data", (chunk) => {
                    outputChannel.show(true);
                    outputChannel.appendLine(chunk);
                });
                server.stderr.addListener("data", (chunk) => {
                    outputChannel.show(true);
                    outputChannel.appendLine(chunk);
                });
            }
        } else {
            //Discard stdout messages
            server.stdout.addListener("data", (_chunk) => {});
            server.stderr.addListener("data", (_chunk) => {});
        }
    }
}
