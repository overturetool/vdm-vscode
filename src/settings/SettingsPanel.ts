import {
    commands,
    ConfigurationTarget,
    ExtensionContext,
    TabInputWebview,
    Uri,
    ViewColumn,
    Webview,
    WebviewPanel,
    window,
    workspace,
    WorkspaceFolder,
} from "vscode";
import AutoDisposable from "../helper/AutoDisposable";
import { VdmDialect } from "../util/DialectUtil";
import * as fs from "fs";

interface Message {
    command: string;
    data?: any;
}

export class SettingsPanel extends AutoDisposable {
    private _panel: WebviewPanel | undefined;
    private _currentWsFolder: WorkspaceFolder | undefined;

    private get _webviewsUri(): Uri {
        return Uri.joinPath(this._context.extensionUri, "dist", "webviews");
    }

    private get _resourcesUri(): Uri {
        return Uri.joinPath(this._context.extensionUri, "resources");
    }

    private get viewType(): string {
        return `${this._context.extension.id}.settingsPanel`;
    }

    constructor(
        private readonly _context: ExtensionContext,
        readonly knownVdmFolders: Map<WorkspaceFolder, VdmDialect>,
    ) {
        super();

        // Close any orphaned panels from previous sessions
        const orphanedTabs = window.tabGroups.all
            .flatMap((tg) => tg.tabs)
            .filter((tab) => tab.input instanceof TabInputWebview && tab.input.viewType.includes(this.viewType));
        window.tabGroups.close(orphanedTabs);

        this._disposables.push(commands.registerCommand("vdm-vscode.openSettingsPanel", () => this.open()));
    }

    public open() {
        // Determine which workspace folder to use (active editor or first known VDM folder)
        const activeEditor = window.activeTextEditor;
        const wsFolder =
            (activeEditor && workspace.getWorkspaceFolder(activeEditor.document.uri)) ||
            (this.knownVdmFolders.size > 0 ? Array.from(this.knownVdmFolders.keys())[0] : undefined);

        this._currentWsFolder = wsFolder;

        if (this._panel) {
            this._panel.reveal(ViewColumn.One, false);
            this._sendSettings();
            return;
        }

        this._panel = window.createWebviewPanel(
            this.viewType,
            "VDM Settings",
            { viewColumn: ViewColumn.One, preserveFocus: false },
            {
                enableScripts: true,
                localResourceRoots: [this._resourcesUri, this._webviewsUri],
                retainContextWhenHidden: true,
            },
        );

        this._panel.onDidDispose(
            () => {
                this._panel = undefined;
            },
            null,
            this._disposables,
        );

        this._panel.webview.onDidReceiveMessage(
            async (message: Message) => {
                switch (message.command) {
                    case "ready":
                        this._sendSettings();
                        break;

                    case "updateSetting": {
                        const { key, value } = message.data;
                        const config = workspace.getConfiguration(undefined, this._currentWsFolder?.uri);
                        try {
                            if (this._currentWsFolder) {
                                await config.update(key, value, ConfigurationTarget.WorkspaceFolder, true);
                            } else {
                                await config.update(key, value, ConfigurationTarget.Workspace);
                            }
                        } catch (e) {
                            window.showErrorMessage(`Failed to update setting "${key}": ${e}`);
                        }
                        break;
                    }

                    case "openNativeSettings":
                        commands.executeCommand("workbench.action.openWorkspaceSettings", "@ext:overturetool.vdm-vscode");
                        break;
                }
            },
            null,
            this._disposables,
        );

        this._panel.webview.html = this._buildHtml(this._panel.webview);
    }

    private _sendSettings() {
        if (!this._panel) {
            return;
        }

        const packageJsonPath = Uri.joinPath(this._context.extensionUri, "package.json").fsPath;
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

        // Collect all setting keys from package.json contributes.configuration
        const configurations: any[] = Array.isArray(packageJson.contributes.configuration)
            ? packageJson.contributes.configuration
            : [packageJson.contributes.configuration];

        // Read current values for all keys from VS Code config
        const config = workspace.getConfiguration("vdm-vscode", this._currentWsFolder?.uri);
        const settings: Record<string, unknown> = {};
        const schema: Record<string, unknown> = {};

        for (const group of configurations) {
            // fullKey is e.g. "vdm-vscode.server.highPrecision"
            // getConfiguration("vdm-vscode") expects just "server.highPrecision"
            for (const [fullKey, def] of Object.entries<any>(group.properties ?? {})) {
                const shortKey = fullKey.replace(/^vdm-vscode\./, "");
                settings[fullKey] = config.get(shortKey);
                schema[fullKey] = {
                    type: def.type,
                    title: def.title ?? def.description?.split(".")[0] ?? shortKey,
                    description: def.description ?? def.markdownDescription ?? "",
                    default: def.default,
                    enum: def.enum ?? null,
                    minimum: def.minimum ?? null,
                    maximum: def.maximum ?? null,
                    group: group.title,
                };
            }
        }

        this._panel.webview.postMessage({
            command: "loadSettings",
            data: {
                settings,
                schema,
                wsFolderName: this._currentWsFolder?.name ?? null,
            },
        });
    }

    private _buildHtml(webview: Webview): string {
        const scriptUri = webview.asWebviewUri(Uri.joinPath(this._webviewsUri, "webviews.js"));
        const codiconsUri = webview.asWebviewUri(Uri.joinPath(this._webviewsUri, "codicons", "codicon.css"));
        const nonce = this._generateNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${codiconsUri}" rel="stylesheet">
</head>
<body>
    <div id="root"></div>
    <script type="module" nonce="${nonce}">
        import { renderWebview } from "${scriptUri}";
        renderWebview("root", "Settings", acquireVsCodeApi(), "${nonce}", {});
    </script>
</body>
</html>`;
    }

    private _generateNonce(): string {
        let text = "";
        const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    public dispose() {
        if (this._panel) {
            this._panel.dispose();
        }
        super.dispose();
    }
}
