import * as vscode from "vscode";

export function initDebugConfig(context: vscode.ExtensionContext, port: number, dialect: string) {
    // register a configuration provider for 'vdm' debug type
    const provider = new VdmConfigurationProvider(dialect);
    context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider(dialect, provider));

    // run the debug adapter as a server inside the extension and communicating via a socket
    let factory = new VdmDebugAdapterDescriptorFactory(port);

    context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory(dialect, factory));
    if ('dispose' in factory) {
        context.subscriptions.push(factory);
    }
}

export class VdmConfigurationProvider implements vscode.DebugConfigurationProvider {
    constructor(
        private dialect: string
    ) {}
    /**
     * Massage a debug configuration just before a debug session is being launched,
     * e.g. add all missing attributes to the debug configuration.
     */
    resolveDebugConfiguration(folder: vscode.WorkspaceFolder | undefined, config: vscode.DebugConfiguration, token?: vscode.CancellationToken): vscode.ProviderResult<vscode.DebugConfiguration> {

        // if launch.json is missing or empty
        if (!config.type && !config.request && !config.name) {
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document.languageId === this.dialect) {   // TODO figure out if debug configurations should be language specific or if this is fine
			// if (editor && editor.document.languageId.startsWith("vdm")) {
                config.type = this.dialect;
                config.name = 'Launch';
                config.request = 'launch';
                config.stopOnEntry = true;
                config.noDebug = false;
            }
        }

        return config;
    }
}

export class VdmDebugAdapterDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {
    constructor(
        private dapPort: number
    ) { }

    createDebugAdapterDescriptor(session: vscode.DebugSession, executable: vscode.DebugAdapterExecutable | undefined): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
        // make VS Code connect to debug server
        return new vscode.DebugAdapterServer(this.dapPort);
    }
}