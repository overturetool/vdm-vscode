/* eslint-disable eqeqeq */
// SPDX-License-Identifier: GPL-3.0-or-later

import * as vscode from "vscode";
import { ClientManager } from "../ClientManager";
import { CompletedParsingParams, CompletedParsingNotification } from "../server/ServerNotifications";
import { SpecificationLanguageClient } from "../slsp/SpecificationLanguageClient";
import AutoDisposable from "../helper/AutoDisposable";
import * as Util from "../util/Util";
import * as Path from "path";
import * as Fs from "fs-extra";
import { vdmFileExtensions } from "../util/DialectUtil";

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
    enableLogging?: boolean | null;
}

export namespace VdmDapSupport {
    let initialized: boolean = false;
    let factory: VdmDebugAdapterDescriptorFactory;
    let sessions: string[] = new Array(); // Array of running sessions
    let debugSessions: vscode.DebugSession[] = [];
    let outputChannel: any;

    export function initDebugConfig(context: vscode.ExtensionContext, clientManager: ClientManager) {
        if (!initialized) {
            initialized = true;
            // Register a configuration provider for 'vdm' debug type
            const provider = new VdmConfigurationProvider();
            context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider("vdm", provider));

            // Run the debug adapter as a server inside the extension and communicating via a socket
            factory = new VdmDebugAdapterDescriptorFactory(clientManager);

            context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory("vdm", factory));

            // Register evaluatable expression provider to handle cases where the user hovers over variables with characters in their names that are allowed in VDM. E.g.: y'
            vscode.languages.registerEvaluatableExpressionProvider([...vdmFileExtensions], {
                provideEvaluatableExpression(
                    document: vscode.TextDocument,
                    position: vscode.Position
                ): vscode.ProviderResult<vscode.EvaluatableExpression> {
                    // This regex captures anything until: a whitespace, ';', ',' '=' or ':'. This works as VDMJ will show an error if the variable name is not valid.
                    const wordRange = document.getWordRangeAtPosition(position, /[^ ;,:=]+/);
                    return wordRange ? new vscode.EvaluatableExpression(wordRange) : undefined;
                },
            });
        }
    }

    export function addPort(folder: vscode.WorkspaceFolder, port: number) {
        if (factory) {
            factory.addPort(folder, port);
        }
    }

    export class VdmConfigurationProvider implements vscode.DebugConfigurationProvider {
        constructor() {
            // When a session is started, add it to the array of running sessions
            vscode.debug.onDidStartDebugSession((session: vscode.DebugSession) => {
                if (session.type === "vdm") {
                    sessions.push(session.workspaceFolder.uri.toString());
                    debugSessions.push(session);
                }
            });

            vscode.debug.registerDebugAdapterTrackerFactory("vdm", {
                createDebugAdapterTracker(session: vscode.DebugSession) {
                    const debugAdapterTracker: vscode.ProviderResult<vscode.DebugAdapterTracker> = {
                        // When a session terminates, remove it from the array of running sessions
                        onError: (m) => {
                            if ((m.message = "connection closed")) {
                                sessions = sessions.filter((value) => value != session.workspaceFolder.uri.toString());
                                debugSessions = debugSessions.filter(
                                    (value) => value.workspaceFolder.uri.toString() != session.workspaceFolder.uri.toString()
                                );
                            }
                        },
                    };

                    if (vscode.workspace.getConfiguration("vdm-vscode.trace", session.workspaceFolder)?.debug ?? false) {
                        // If tracing is enabled create a new output channel and log to it
                        if (outputChannel) {
                            outputChannel.dispose();
                        }
                        outputChannel = vscode.window.createOutputChannel(`vdm-vscode DAP: ${session.name}`);
                        debugAdapterTracker.onWillReceiveMessage = (m) =>
                            outputChannel.appendLine(`[${new Date().toLocaleTimeString()}]:\n${JSON.stringify(m, undefined, 2)}\n`);
                        debugAdapterTracker.onDidSendMessage = (m) =>
                            outputChannel.appendLine(`[${new Date().toLocaleTimeString()}]:\n${JSON.stringify(m, undefined, 2)}\n`);
                    }

                    return debugAdapterTracker;
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

            if (config?.enableLogging == true) {
                // If logging of RT events is enabled then make sure the logging path exists and
                // set the "logging" property on the configuration that is to be passed to the server.
                const logPath: string = Path.join(Util.generatedDataPath(folder).fsPath, "rtlogs");
                Fs.ensureDirSync(logPath);
                const date = new Date();
                config.logging = Path.join(
                    logPath,
                    `${config.name.replace(/\W+/g, "_")}_${`${date.toLocaleDateString()}_${date.toLocaleTimeString()}`.replace(
                        /[: \\/]/g,
                        "_"
                    )}.rtlog`
                );
            }

            return config;
        }
    }

    export class VdmDebugAdapterDescriptorFactory extends AutoDisposable implements vscode.DebugAdapterDescriptorFactory {
        private dapPorts: Map<vscode.Uri, number> = new Map();
        constructor(private _clientManager: ClientManager) {
            super();
        }

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
                                        debugSessions = debugSessions.filter(
                                            (value) => value.workspaceFolder.uri.toString() != session.workspaceFolder.uri.toString()
                                        );
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
                    debugSessions = debugSessions.filter(
                        (value) => value.workspaceFolder.uri.toString() != session.workspaceFolder.uri.toString()
                    );
                    return new vscode.DebugAdapterInlineImplementation(new StoppingDebugAdapter(session));
                }
            } else {
                // make VS Code connect to debug server
                return new vscode.DebugAdapterServer(dapPort);
            }
        }
    }

    export function getAdHocVdmDebugger(folder: vscode.WorkspaceFolder): Thenable<vscode.DebugSession | undefined> {
        if (debugSessions.length > 0) {
            return new Promise((resolve) => resolve(debugSessions[0]));
        }

        return startDebuggerWithCommand(undefined, folder, false, true).then(
            (success) => {
                if (success) {
                    return debugSessions[0];
                }

                return undefined;
            },
            () => undefined
        );
    }

    export function startDebuggerWithCommand(
        command: string | undefined,
        folder: vscode.WorkspaceFolder | undefined,
        stopOnEntry?: boolean,
        adHoc: boolean = false
    ): Thenable<boolean> {
        var debugConfiguration: VdmDebugConfiguration = {
            type: "vdm", // The type of the debug session.
            name: "Launch command", // The name of the debug session.
            request: "launch", // The request type of the debug session.
            noDebug: false, // Start debugger
            stopOnEntry: stopOnEntry,
            // Additional debug type specific properties.
            command: command,
        };

        let sessionOptions: vscode.DebugSessionOptions = {};

        if (adHoc) {
            sessionOptions = {
                suppressDebugToolbar: true,
                suppressDebugStatusbar: true,
                suppressDebugView: true,
            };
        }

        // Start debug session with custom debug configurations
        return vscode.debug.startDebugging(folder, debugConfiguration, sessionOptions);
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
