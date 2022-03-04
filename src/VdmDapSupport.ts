// SPDX-License-Identifier: GPL-3.0-or-later

import * as vscode from "vscode";
import { DebugAdapter, workspace, WorkspaceFolder } from "vscode";
import { Clients } from "./Clients";

export interface VdmDebugConfiguration extends vscode.DebugConfiguration {
    noDebug?: boolean;
    dynamicTypeChecks?: boolean;
    invariantsChecks?: boolean;
    preConditionChecks?: boolean;
    postConditionChecks?: boolean;
    measureChecks?: boolean;
    defaultName?: string | null;
    command?: string | null;
    remoteControl?: string | null;
}

export namespace VdmDapSupport {
    let initialized: boolean = false;
    let factory: VdmDebugAdapterDescriptorFactory;
    let sessions: string[] = new Array(); // Array of running sessions

    export function initDebugConfig(context: vscode.ExtensionContext, clients: Clients) {
        if (!initialized) {
            initialized = true;
            // register a configuration provider for 'vdm' debug type
            const provider = new VdmConfigurationProvider();
            context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider("vdm", provider));

            // run the debug adapter as a server inside the extension and communicating via a socket
            factory = new VdmDebugAdapterDescriptorFactory(clients);

            context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory("vdm", factory));
        }
    }

    export function addPort(folder: vscode.WorkspaceFolder, port: number) {
        if (factory) factory.addPort(folder, port);
    }

    export class VdmConfigurationProvider implements vscode.DebugConfigurationProvider {
        constructor() {
            // When a session is started, add it to the array of running sessions
            vscode.debug.onDidStartDebugSession((session: vscode.DebugSession) => {
                if (session.type === "vdm") {
                    sessions.push(session.workspaceFolder.uri.toString());
                }
            });

            // When a session terminates, remove it from the array of running sessions
            vscode.debug.registerDebugAdapterTrackerFactory("vdm", {
                createDebugAdapterTracker(session: vscode.DebugSession) {
                    return {
                        onError: (m) => {
                            if ((m.message = "connection closed"))
                                sessions = sessions.filter((value) => value != session.workspaceFolder.uri.toString());
                        },
                    };
                },
            });
        }
        /**
         * Massage a debug configuration just before a debug session is being launched,
         * e.g. add all missing attributes to the debug configuration.
         */
        resolveDebugConfiguration(
            folder: vscode.WorkspaceFolder | undefined,
            inConfig: vscode.DebugConfiguration,
            _token?: vscode.CancellationToken
        ): vscode.ProviderResult<vscode.DebugConfiguration> {
            let uri = folder.uri.toString();
            let config: VdmDebugConfiguration = inConfig;

            // Check for remote control violation
            if (config.remoteControl && config.command) {
                vscode.window.showInformationMessage("Run aborted - Command and remoteControl are mutually exclusive");
                return undefined;
            }
            // Check if there is a debug session running and if one of those sessions are for the specification
            if (vscode.debug.activeDebugSession && sessions.includes(uri)) {
                vscode.window.showInformationMessage(
                    "Debug session already running, cannot launch multiple sessions for the same specification"
                );
                return undefined; // Abort launch
            }

            // if launch.json is missing or empty
            if (!config.type && !config.request && !config.name) {
                config.type = "vdm";
                config.name = "Launch VDM Debug";
                config.request = "launch";
                config.stopOnEntry = true;
                config.noDebug = false;
            }

            return config;
        }
    }

    export class VdmDebugAdapterDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {
        private dapPorts: Map<vscode.Uri, number> = new Map();

        constructor(private _clients: Clients) {}

        addPort(folder: vscode.WorkspaceFolder, dapPort: number) {
            this.dapPorts.set(folder.uri, dapPort);
        }

        async createDebugAdapterDescriptor(
            session: vscode.DebugSession,
            _executable: vscode.DebugAdapterExecutable | undefined
        ): Promise<vscode.ProviderResult<vscode.DebugAdapterDescriptor>> {
            // Check if server has not been launched
            let uri = session.workspaceFolder.uri;
            if (!this.dapPorts.get(uri)) {
                // Locate any VDM file in the project.
                await vscode.workspace.findFiles(new vscode.RelativePattern(uri.fsPath, "*.vdm*"), null, 1).then(async (res) => {
                    let errMsg: string = `Unable to launch a debug session for the workspace folder ${session.workspaceFolder.name} without any VDM files, please retry`;
                    if (res.length > 0) {
                        // Open a file in the workspace folder to force the client to start for the folder.
                        const docuUri: vscode.Uri = (await vscode.workspace.openTextDocument(res[0]))?.uri;

                        const wsFolder: vscode.WorkspaceFolder = workspace.getWorkspaceFolder(docuUri);

                        // Wait for the client to be started - this should ensure that there is a DAP port.
                        await this._clients.get(wsFolder).onReady();
                        const dapPort: number = this.dapPorts.get(wsFolder.uri);
                        if (dapPort) {
                            // Give time for the server to be fully up an running before initialising the debug session
                            await new Promise((f) => setTimeout(f, 500));
                            return new vscode.DebugAdapterServer(dapPort);
                        }
                        // The client did not receive a dap port so the server probably does not support DAP.
                        errMsg = `[${this._clients.name}] Did not receive a DAP port on start up, debugging is not activated`;
                    }
                    // Warn the user of the error.
                    vscode.window.showWarningMessage(errMsg);

                    // Remove sessions from active sessions
                    sessions = sessions.filter((value) => value != uri.toString());
                    return new vscode.DebugAdapterInlineImplementation(new StoppingDebugAdapter(session));
                });
            }

            // make VS Code connect to debug server
            return new vscode.DebugAdapterServer(this.dapPorts.get(uri));
        }
    }

    export function startDebuggerWithCommand(command: string, folder: WorkspaceFolder | undefined, stopOnEntry?: boolean) {
        var debugConfiguration: VdmDebugConfiguration = {
            type: "vdm", // The type of the debug session.
            name: "Launch command", // The name of the debug session.
            request: "launch", // The request type of the debug session.
            noDebug: false, // Start debugger
            stopOnEntry: stopOnEntry,
            // Additional debug type specific properties.
            command: command,
        };

        // Start debug session with custom debug configurations
        vscode.debug.startDebugging(folder, debugConfiguration);
    }

    // Used to kill debug session silently
    // TODO Remove when auto restart is implemented
    class StoppingDebugAdapter implements DebugAdapter {
        private _onDidSendMessage: vscode.EventEmitter<vscode.DebugProtocolMessage> =
            new vscode.EventEmitter<vscode.DebugProtocolMessage>();
        private _session;
        constructor(session: vscode.DebugSession) {
            this.onDidSendMessage = this._onDidSendMessage.event;
            this._session = session;
        }

        onDidSendMessage: vscode.Event<vscode.DebugProtocolMessage>;
        handleMessage(_message: vscode.DebugProtocolMessage): void {
            vscode.debug.stopDebugging(this._session);
            return;
        }
        dispose() {}
    }
}
