import * as vscode from "vscode";

export namespace VdmDapSupport {
    let initialized: boolean = false;
    let factory: VdmDebugAdapterDescriptorFactory;

    export function initDebugConfig(context: vscode.ExtensionContext, folder: vscode.WorkspaceFolder, port: number) {
        if (!initialized){
            initialized = true;
            // register a configuration provider for 'vdm' debug type
            const provider = new VdmConfigurationProvider();
            context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider("vdm", provider));

            // run the debug adapter as a server inside the extension and communicating via a socket
            factory = new VdmDebugAdapterDescriptorFactory(folder, port);

            context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory("vdm", factory));
            if ('dispose' in factory) {
                context.subscriptions.push(factory);
            }
        } else {
            factory.addPort(folder, port);
        }
    }

    export class VdmConfigurationProvider implements vscode.DebugConfigurationProvider {
        constructor(
        ) { }
        /**
         * Massage a debug configuration just before a debug session is being launched,
         * e.g. add all missing attributes to the debug configuration.
         */
        resolveDebugConfiguration(folder: vscode.WorkspaceFolder | undefined, config: vscode.DebugConfiguration, token?: vscode.CancellationToken): vscode.ProviderResult<vscode.DebugConfiguration> {

            // if launch.json is missing or empty
            if (!config.type && !config.request && !config.name) {
                config.type = 'vdm';
                config.name = 'Launch';
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
            // make VS Code connect to debug server
            return new vscode.DebugAdapterServer(this.dapPorts.get(session.workspaceFolder.uri.toString()));
        }
    }

    export function startDebuggerWithCommand(command: string, stopOnEntry?:boolean) {
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
        vscode.debug.startDebugging(undefined, debugConfiguration)
    }

}