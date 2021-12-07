// SPDX-License-Identifier: GPL-3.0-or-later

import * as vscode from "vscode";
import { WorkspaceFolder } from "vscode";

export namespace VdmDapSupport {
    let initialized: boolean = false;
    let factory: VdmDebugAdapterDescriptorFactory;
    let sessions : string[] = new Array(); // Array of running sessions

    export function initDebugConfig(context: vscode.ExtensionContext, folder: vscode.WorkspaceFolder, port: number) {
        if (!initialized){
            initialized = true;
            // register a configuration provider for 'vdm' debug type
            const provider = new VdmConfigurationProvider();
            context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider("vdm", provider));

            // run the debug adapter as a server inside the extension and communicating via a socket
            factory = new VdmDebugAdapterDescriptorFactory(folder, port);

            context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory("vdm", factory));
        } else {
            factory.addPort(folder, port);
        }
    }

    export class VdmConfigurationProvider implements vscode.DebugConfigurationProvider {
        
        constructor() { 
            // When a session is started, add it to the array of running sessions
            vscode.debug.onDidStartDebugSession((session: vscode.DebugSession) => {
                if (session.type === 'vdm'){
                    sessions.push(session.workspaceFolder.uri.toString())
                }
            })

            // When a session terminates, remove it from the array of running sessions
            vscode.debug.registerDebugAdapterTrackerFactory('vdm', {
                createDebugAdapterTracker(session: vscode.DebugSession) {
                    return {
                        onError: m => {
                            if (m.message = 'connection closed')
                                sessions = sessions.filter(value => value != session.workspaceFolder.uri.toString())
                        },
                    }
                }
            });
        }
        /**
         * Massage a debug configuration just before a debug session is being launched,
         * e.g. add all missing attributes to the debug configuration.
         */
        resolveDebugConfiguration(folder: vscode.WorkspaceFolder | undefined, config: vscode.DebugConfiguration, token?: vscode.CancellationToken): vscode.ProviderResult<vscode.DebugConfiguration> {
            let uri = folder.uri.toString();

            // Check for remote control violation
            if(config.remoteControl && config.command){
                vscode.window.showInformationMessage("Run aborted - Command and remoteControl are mutually exclusive");
                return undefined;
            }
            // Check if there is a debug session running and if one of those sessions are for the specification
            if (vscode.debug.activeDebugSession && sessions.includes(uri)){
                vscode.window.showInformationMessage("Debug session already running, cannot launch multiple sessions for the same specification");
                return undefined; // Abort launch
            }

            // if launch.json is missing or empty
            if (!config.type && !config.request && !config.name) {
                config.type = 'vdm';
                config.name = 'Launch VDM Debug';
                config.request = 'launch';
                config.stopOnEntry = true;
                config.noDebug = false;
            }

            return config;
        }
    }

    export class VdmDebugAdapterDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {
        private dapPorts: Map<string, number> = new Map();

        constructor(
            folder: vscode.WorkspaceFolder,
            dapPort: number
        ) { 
            this.dapPorts.set(folder.uri.toString(), dapPort);
        }

        addPort(folder: vscode.WorkspaceFolder, dapPort: number){
            this.dapPorts.set(folder.uri.toString(), dapPort);
        }

        createDebugAdapterDescriptor(session: vscode.DebugSession, executable: vscode.DebugAdapterExecutable | undefined): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
            // Check if server has been launched
            let uri = session.workspaceFolder.uri;
            if (!this.dapPorts.get(uri.toString())){
                // Open a file in the workspace folder to force the client to start for the folder
                let pattern = new vscode.RelativePattern(uri.fsPath, "*.vdm*");
                vscode.workspace.findFiles(pattern,null,1).then( async (res) => {
                    if (res.length > 0)
                        vscode.workspace.openTextDocument(res[0])
                })

                // Remove sessions from active sessions
                let elems = sessions.filter(value => value != uri.toString());
                sessions = elems;
                throw new Error(`Unable to find server for workspace folder ${session.workspaceFolder.name}`);
            }
            
            // make VS Code connect to debug server
            return new vscode.DebugAdapterServer(this.dapPorts.get(uri.toString()));
        }
    }

    export function startDebuggerWithCommand(command: string, folder: WorkspaceFolder | undefined, stopOnEntry?:boolean) {
        var debugConfiguration: vscode.DebugConfiguration = {
            type: "vdm",               // The type of the debug session.
            name: "Launch command",    // The name of the debug session.
            request: "launch",         // The request type of the debug session.
            // Additional debug type specific properties.
            command: command
        }
        if (stopOnEntry != undefined)
            debugConfiguration.stopOnEntry = stopOnEntry;

        // Start debug session with custom debug configurations
        vscode.debug.startDebugging(folder, debugConfiguration)
    }

}