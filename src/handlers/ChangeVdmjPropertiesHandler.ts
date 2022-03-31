import { commands, Disposable, extensions, TextDocument, Uri, ViewColumn, window, workspace, WorkspaceFolder } from "vscode";
import AutoDisposable from "../helper/AutoDisposable";
import * as Util from "../util/Util";
import * as Fs from "fs-extra";
import { vdmDialects } from "../util/DialectUtil";
import * as Path from "path";
import { extensionId } from "../ExtensionInfo";

export class ChangeVdmjPropertiesHandler extends AutoDisposable {
    private readonly _fileName: string = "vdmj.properties";
    private _isWatchingChanges: boolean = false;
    constructor(readonly knownVdmFolders: Map<WorkspaceFolder, vdmDialects>) {
        super();
        commands.executeCommand("setContext", "vdm-vscode.changeVdmjProperties", true);

        if (workspace.textDocuments.find((docu) => docu.fileName.endsWith(this._fileName))) {
            this.addFileWatchers();
        }

        this._disposables.push(
            workspace.onDidOpenTextDocument((eve: TextDocument) => {
                if (eve.fileName.endsWith(this._fileName) && !this._isWatchingChanges) {
                    this.addFileWatchers();
                }
            })
        );

        Util.registerCommand(this._disposables, "vdm-vscode.changeVdmjProperties", async () => {
            if (!knownVdmFolders) {
                return;
            }
            if (knownVdmFolders.size == 0) {
                window.showInformationMessage("Cannot find any VDMJ workspace folders");
                return;
            }

            const chosenWsFolder: string = await window.showQuickPick(
                Array.from(knownVdmFolders.entries()).map((entry) => entry[0].name),
                { canPickMany: false, title: "Select workspace folder" }
            );

            if (chosenWsFolder) {
                const wsFolder: WorkspaceFolder = Array.from(knownVdmFolders.keys()).find((key) => key.name == chosenWsFolder);
                const vscodeFolder: Uri = Uri.joinPath(wsFolder.uri, ".vscode");

                const propertiesFilePath: string = Uri.joinPath(vscodeFolder, this._fileName).fsPath;
                Fs.pathExists(propertiesFilePath).then(async (fExists) => {
                    if (!fExists) {
                        await Fs.ensureDir(vscodeFolder.fsPath).then(() =>
                            Fs.copyFile(
                                Path.resolve(extensions.getExtension(extensionId).extensionPath, "resources", this._fileName),
                                propertiesFilePath
                            ).catch((err) => {
                                console.log("[Change VDMJ Properties]: Unable read default VDMJ properties file due to: " + err);
                                return;
                            })
                        );
                    }

                    workspace.openTextDocument(propertiesFilePath).then((document) => {
                        window.showTextDocument(document.uri, { viewColumn: ViewColumn.One, preserveFocus: false });
                    });
                });
            }
        });
    }

    private addFileWatchers() {
        this._isWatchingChanges = true;
        const didSaveDisposable: Disposable = workspace.onDidSaveTextDocument((eve: TextDocument) => {
            if (eve.fileName.endsWith(this._fileName)) {
                Util.showRestartMsg("VDMJ properties changed. Please reload VS Code to enable the changes.");
            }
        });

        const didCloseDisposable: Disposable = workspace.onDidCloseTextDocument((eve: TextDocument) => {
            if (
                eve.fileName.endsWith(this._fileName) &&
                workspace.textDocuments.filter((docu) => docu.fileName.endsWith(this._fileName)).length == 1
            ) {
                this._isWatchingChanges = false;
                didSaveDisposable.dispose();
                didCloseDisposable.dispose();
            }
        });
        this._disposables.push(didSaveDisposable);
        this._disposables.push(didCloseDisposable);
    }
}
