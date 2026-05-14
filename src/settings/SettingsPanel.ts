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
import * as path from "path";
import * as Util from "../util/Util";

interface Message {
    command: string;
    data?: any;
}

export class SettingsPanel extends AutoDisposable {
    private _panel: WebviewPanel | undefined;
    private _currentWsFolder: WorkspaceFolder | undefined;
    private _restartMsgTimer: NodeJS.Timeout | undefined;

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
            { viewColumn: ViewColumn.Beside, preserveFocus: false },
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
                        this._sendVdmjProperties();
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
                        commands.executeCommand(
                            "workbench.action.openWorkspaceSettings",
                            message.data?.query ?? "@ext:overturetool.vdm-vscode",
                        );
                        break;

                    case "saveVdmjProperty": {
                        const { key, value } = message.data;
                        const projectPath = this._getPropertiesPath();
                        if (!projectPath) {
                            break;
                        }

                        const vscodeFolder = path.dirname(projectPath);
                        if (!fs.existsSync(vscodeFolder)) {
                            fs.mkdirSync(vscodeFolder, { recursive: true });
                        }

                        const existing = fs.existsSync(projectPath)
                            ? fs.readFileSync(projectPath, "utf8")
                            : fs.readFileSync(Uri.joinPath(this._context.extensionUri, "resources", "vdmj.properties").fsPath, "utf8");

                        const updated = this._serializeProperties(existing, { [key]: value });
                        fs.writeFileSync(projectPath, updated, "utf8");
                        if (this._restartMsgTimer) {
                            clearTimeout(this._restartMsgTimer);
                        }
                        this._restartMsgTimer = setTimeout(() => {
                            Util.showRestartMsg("VDMJ properties changed. Please reload VS Code to enable the changes.");
                        }, 1000);
                        break;
                    }
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
            // Exclude Development group entirely
            if (group.title === "Development") {
                continue;
            }

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
                    advanced: false,
                };
            }
        }

        // Apply settingsUI.json overrides
        const uiOverridesPath = Uri.joinPath(this._context.extensionUri, "resources", "settingsUI.json").fsPath;
        if (fs.existsSync(uiOverridesPath)) {
            const overrides = JSON.parse(fs.readFileSync(uiOverridesPath, "utf8"));
            for (const [key, override] of Object.entries<any>(overrides)) {
                if (schema[key]) {
                    schema[key] = { ...(schema[key] as object), ...(override as object) };
                }
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

    private _inferType(value: string): "boolean" | "number" | "string" {
        if (value === "true" || value === "false") {
            return "boolean";
        }
        if (value !== "" && !isNaN(Number(value))) {
            return "number";
        }
        return "string";
    }

    private _parseProperties(content: string): Record<string, string> {
        const result: Record<string, string> = {};

        for (const line of content.split("\n")) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("#")) {
                continue;
            }
            const eq = trimmed.indexOf("=");
            if (eq === -1) {
                continue;
            }
            const key = trimmed.substring(0, eq).trim();
            const value = trimmed.substring(eq + 1).trim();
            result[key] = value;
        }

        return result;
    }

    private _serializeProperties(existing: string, updates: Record<string, string>): string {
        const lines = existing.split("\n");
        const written = new Set<string>();

        const result = lines.map((line) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("#")) {
                return line;
            }
            const eq = trimmed.indexOf("=");
            if (eq === -1) {
                return line;
            }
            const key = trimmed.substring(0, eq).trim();
            if (key in updates) {
                written.add(key);
                return `${key} = ${updates[key]}`;
            }
            return line;
        });

        for (const [key, value] of Object.entries(updates)) {
            if (!written.has(key)) {
                result.push(`${key} = ${value}`);
            }
        }

        return result.join("\n");
    }

    private _getPropertiesPath(): string | undefined {
        if (!this._currentWsFolder) {
            return undefined;
        }
        return Uri.joinPath(this._currentWsFolder.uri, ".vscode", "vdmj.properties").fsPath;
    }

    private _sendVdmjProperties() {
        if (!this._panel) {
            return;
        }

        const defaultPath = Uri.joinPath(this._context.extensionUri, "resources", "vdmj.properties").fsPath;
        const defaults = this._parseProperties(fs.readFileSync(defaultPath, "utf8"));

        const projectPath = this._getPropertiesPath();
        const projectValues = projectPath && fs.existsSync(projectPath) ? this._parseProperties(fs.readFileSync(projectPath, "utf8")) : {};

        const merged: Record<string, string> = { ...defaults, ...projectValues };

        const uiPath = Uri.joinPath(this._context.extensionUri, "resources", "vdmjUI.json").fsPath;
        const uiMeta = fs.existsSync(uiPath) ? JSON.parse(fs.readFileSync(uiPath, "utf8")) : {};

        const schema: Record<string, { type: string; description: string; category: string; advanced: boolean; default: string }> = {};
        for (const [key, defaultValue] of Object.entries(defaults)) {
            const meta = uiMeta[key] ?? {};
            schema[key] = {
                type: this._inferType(defaultValue),
                description: meta.description ?? "",
                category: meta.category ?? "Other",
                advanced: meta.advanced ?? false,
                default: defaultValue,
            };
        }

        this._panel.webview.postMessage({
            command: "loadVdmjProperties",
            data: { values: merged, schema },
        });
    }

    public dispose() {
        if (this._panel) {
            this._panel.dispose();
        }
        super.dispose();
    }
}
