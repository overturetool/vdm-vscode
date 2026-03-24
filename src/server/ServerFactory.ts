/* eslint-disable eqeqeq */
// SPDX-License-Identifier: GPL-3.0-or-later

import * as net from "net";
import * as fs from "fs-extra";
import * as path from "path";
import * as child_process from "child_process";
import * as util from "../util/Util";
import * as encoding from "../Encoding";
import { WorkspaceConfiguration, workspace, window, WorkspaceFolder, OutputChannel, Disposable } from "vscode";
import { ServerOptions } from "vscode-languageclient/node";
import { getExtensionPath } from "../util/ExtensionUtil";
import { ServerLog } from "./ServerLog";
import { ensureDirectoryExistence, recursivePathSearch } from "../util/DirectoriesUtil";
import { ManagePluginsHandler } from "../handlers/ManagePluginsHandler";
import { VdmDialect } from "../util/DialectUtil";
import { VDMJExtensionsHandler } from "../handlers/VDMJExtensionsHandler";
import { ManageAnnotationsHandler } from "../handlers/ManageAnnotationsHandler";

export class ServerFactory implements Disposable {
    private _jarPath: string;
    private _jarPathVdmj: string;
    private _jarPathVdmjHp: string;
    private _javaPath: string;

    constructor(private _log: ServerLog) {
        // Setup jar paths
        this._jarPath = path.resolve(getExtensionPath(), "resources", "jars");
        this._jarPathVdmj = path.resolve(this._jarPath, "vdmj");
        this._jarPathVdmjHp = path.resolve(this._jarPath, "vdmj_hp");

        // Make sure that there is a java executable
        this._javaPath = util.findJavaExecutable("java");
        if (!this._javaPath) {
            let m = "Java runtime environment not found!";
            console.error("[ServerFactory] " + m);
            throw new Error(m);
        }

        // Make sure that the VDMJ and LSP jars are present
        if (!recursivePathSearch(this._jarPathVdmj, /vdmj.*jar/i) || !recursivePathSearch(this._jarPathVdmj, /lsp.*jar/i)) {
            let m = "Server jars not found!";
            console.error("[ServerFactory] " + m);
            throw new Error(m);
        }
    }

    dispose() {
        this._log.dispose();
    }

    createServerOptions(wsFolder: WorkspaceFolder, dialect: VdmDialect): ServerOptions {
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
                    server.listen(0, "localhost", null, async () => {
                        let address = server.address();
                        if (address && typeof address != "string") {
                            await this.launchServer(wsFolder, dialect, address.port);
                        } else {
                            reject("Could not get port");
                        }
                    });
                }
            });
        };
        return serverOptions;
    }

    private getServerConfig(wsFolder: WorkspaceFolder): WorkspaceConfiguration {
        return workspace.getConfiguration("vdm-vscode.server", wsFolder);
    }

    private async launchServer(wsFolder: WorkspaceFolder, dialect: VdmDialect, lspPort: number) {
        // Get server configurations
        const serverConfig: WorkspaceConfiguration = this.getServerConfig(wsFolder);
        const stdioConfig: WorkspaceConfiguration = serverConfig.get("stdio");

        // Setup server arguments
        let args: string[] = [];
        let JVM_ARGS: string = serverConfig.JVMArguments;
        if (JVM_ARGS != "") {
            let split = JVM_ARGS.split(" ").filter((v) => v != "");
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

        // Activate server log
        const logLevel = serverConfig.get("logLevel", "off");
        if (logLevel != "off") {
            // Ensure logging path exists
            const languageServerLoggingPath = path.resolve(this._log.uri.fsPath, wsFolder.name.toString() + "_lang_server.log");
            ensureDirectoryExistence(languageServerLoggingPath);
            args.push(`-Dlsp.log.filename=${languageServerLoggingPath}`);
            args.push(`-Dlsp.log.level=${logLevel}`);
        }

        // Set encoding
        const encodingSetting = workspace.getConfiguration("files", wsFolder).get("encoding", "utf8");
        const javaEncoding = encoding.toJavaName(encodingSetting);
        if (javaEncoding) {
            args.push(`-Dlsp.encoding=${javaEncoding}`);
        } else {
            console.warn(
                `[Extension] Could not recognize encoding (files.encoding: ${encodingSetting}) the -Dlsp.encoding server argument is NOT set`,
            );
        }

        // Construct class path.
        let classPath: string = "";
        // Start by adding user defined library jar paths
        (await VDMJExtensionsHandler.getAllLibrarySources(wsFolder)).forEach((libPath) => (classPath += libPath.jarPath + path.delimiter));

        // Add plugin jars
        const pluginClassPathAdditions = await ManagePluginsHandler.getClasspathAdditions(
            wsFolder,
            dialect,
            serverConfig.get("highPrecision", false) ? "high" : "standard",
        );

        pluginClassPathAdditions.forEach((jarPath) => (classPath += jarPath + path.delimiter));

        // Add annotation jars
        const annotationClassPathAdditions = await ManageAnnotationsHandler.getClasspathAdditions(
            wsFolder,
            dialect,
            serverConfig.get("highPrecision", false) ? "high" : "standard",
        );

        annotationClassPathAdditions.forEach((jarPath) => (classPath += jarPath + path.delimiter));

        // Add all jars from add-on extensions (support jars with no metadata)
        VDMJExtensionsHandler.getExtensionClasspathSources().forEach((jarPath) => (classPath += jarPath + path.delimiter));

        // Add user defined paths
        (serverConfig.classPathAdditions as string[]).forEach((cp) => {
            const resolvedCp: string = cp.replace("${workspaceFolder}", wsFolder.uri.fsPath);
            const pathToCheck: string = resolvedCp.endsWith(path.sep + "*") ? resolvedCp.substr(0, resolvedCp.length - 2) : resolvedCp;
            if (!fs.existsSync(pathToCheck)) {
                const msg: string = "Invalid path in class path additions: " + cp;
                window.showWarningMessage(msg);
                console.warn("[Extension] " + msg);
            } else {
                classPath += resolvedCp + path.delimiter;
            }
        });

        // Add vdmj jars folders
        // Note: Added in the end to allow overriding annotations in user defined annotations, such as overriding "@printf" *(see issue #69)
        classPath +=
            path.resolve((serverConfig?.highPrecision === true ?? false) ? this._jarPathVdmjHp : this._jarPathVdmj, "*") + path.delimiter;

        // Set strict
        const setStrict = serverConfig.get("strict", false);
        if (setStrict) {
            args.push(`-Dvdmj.strict=true`);
        }

        // Set verbose
        const setVerbose = serverConfig.get("verbose", false);
        if (setVerbose) {
            args.push(`-Dvdmj.verbose=true`);
        }

        // Set classic release mode
        const vdmjRelease = serverConfig.get("release", "vdm10");
        if (vdmjRelease) {
            args.push(`-Dvdmj.release=${vdmjRelease}`);
        }

        // Construct java launch arguments
        args.push(...["-cp", classPath, "lsp.LSPServerSocket", "-" + dialect, "-lsp", lspPort.toString(), "-dap", "0"]);

        // Start the LSP server
        let server = child_process.spawn(this._javaPath, args, { cwd: wsFolder.uri.fsPath });

        // Create output channel for server stdout
        let stdoutLogPath = stdioConfig.stdioLogPath;
        if (stdioConfig.activateStdoutLogging) {
            // Log to file
            if (stdoutLogPath != "") {
                ensureDirectoryExistence(stdoutLogPath + path.sep + wsFolder.name.toString());
                server.stdout.addListener("data", (chunk) =>
                    util.writeToLog(stdoutLogPath + path.sep + wsFolder.name.toString() + "_stdout.log", chunk),
                );
                server.stderr.addListener("data", (chunk) =>
                    util.writeToLog(stdoutLogPath + path.sep + wsFolder.name.toString() + "_stderr.log", chunk),
                );
            }
            // Log to terminal
            else {
                let outputChannel: OutputChannel = window.createOutputChannel("VDM: " + wsFolder.name.toString());
                console.log("Creating output channel for server.");
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
