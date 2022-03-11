// SPDX-License-Identifier: GPL-3.0-or-later

import * as vscode from "vscode";
import { ClientManager } from "./ClientManager";
import { CompletedParsingParams, CompletedParsingNotification } from "./server/ServerNotifications";
import { SpecificationLanguageClient } from "./slsp/SpecificationLanguageClient";

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

    export function initDebugConfig(context: vscode.ExtensionContext, clientManager: ClientManager) {
        if (!initialized) {
            initialized = true;
            // register a configuration provider for 'vdm' debug type
            const provider = new VdmConfigurationProvider();
            context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider("vdm", provider));

            // run the debug adapter as a server inside the extension and communicating via a socket
            factory = new VdmDebugAdapterDescriptorFactory(clientManager);

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

        constructor(private _clientManager: ClientManager) {}

        addPort(folder: vscode.WorkspaceFolder, dapPort: number) {
            this.dapPorts.set(folder.uri, dapPort);
        }

        async createDebugAdapterDescriptor(
            session: vscode.DebugSession,
            _executable: vscode.DebugAdapterExecutable | undefined
        ): Promise<vscode.ProviderResult<vscode.DebugAdapterDescriptor>> {
            let dapPort: number = this.dapPorts.get(session.workspaceFolder.uri);
            // Check if server has not been launched
            if (!dapPort) {
                let errMsg: string = "";

                // Start the client which launches the server
                const client: SpecificationLanguageClient = await this._clientManager.launchClientForWorkspace(session.workspaceFolder);
                if (client) {
                    dapPort = this.dapPorts.get(session.workspaceFolder.uri);
                    if (!dapPort) {
                        // The client did not receive a dap port so the server probably does not support DAP.
                        errMsg = `[${this._clientManager.name}] Did not receive a DAP port from the language server on start up, debugging is not activated`;
                    } else {
                        return new Promise<vscode.ProviderResult<vscode.DebugAdapterDescriptor>>((resolve) => {
                            // Subscribe to the server notification indicating that the server has finished the initial parse/check of the spec.
                            // Then return the debugadapter if it succeeded or else the "stop" debugadapter.
                            let disposable: vscode.Disposable = client.onNotification(
                                CompletedParsingNotification.type,
                                (params: CompletedParsingParams) => {
                                    disposable.dispose();
                                    disposable = null;
                                    if (params.successful) {
                                        return resolve(new vscode.DebugAdapterServer(dapPort));
                                    } else {
                                        // Warn the user of the error.
                                        vscode.window.showWarningMessage(
                                            "Cannot begin debug session as the specification failed to parse/check."
                                        );

                                        // Remove sessions from active sessions
                                        sessions = sessions.filter((value) => value != session.workspaceFolder.uri.toString());
                                        return resolve(new vscode.DebugAdapterInlineImplementation(new StoppingDebugAdapter(session)));
                                    }
                                }
                            );
                            // Notify the user if the server takes longer than ~3 seconds to finish the initial parse/check.
                            const timer: NodeJS.Timeout = setTimeout(() => {
                                if (disposable) {
                                    vscode.window.showInformationMessage(
                                        "Delaying the debug session until the initial parse/check of the specification has finished.."
                                    );
                                }
                                clearTimeout(timer);
                            }, 3000);
                        });
                    }
                } else {
                    errMsg = `Unable to launch a debug session for the workspace folder ${session.workspaceFolder.name} without any VDM files`;
                }

                if (errMsg) {
                    // Warn the user of the error.
                    vscode.window.showWarningMessage(errMsg);

                    // Remove sessions from active sessions
                    sessions = sessions.filter((value) => value != session.workspaceFolder.uri.toString());
                    return new vscode.DebugAdapterInlineImplementation(new StoppingDebugAdapter(session));
                }
            } else {
                // make VS Code connect to debug server
                return new vscode.DebugAdapterServer(dapPort);
            }
        }
    }

    export function startDebuggerWithCommand(command: string, folder: vscode.WorkspaceFolder | undefined, stopOnEntry?: boolean) {
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
    class StoppingDebugAdapter implements vscode.DebugAdapter {
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
