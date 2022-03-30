import { commands, extensions, Uri, window, WorkspaceFolder } from "vscode";
import AutoDisposable from "../helper/AutoDisposable";
import * as Util from "../util/Util";
import * as Fs from "fs-extra";
import { vdmDialects } from "../util/DialectUtil";
import * as Path from "path";
import { extensionId } from "../ExtensionInfo";

export class ChangeVdmjPropertiesHandler extends AutoDisposable {
    private readonly fileName: string = "vdmj.properties";
    constructor(readonly knownVdmFolders: Map<WorkspaceFolder, vdmDialects>) {
        super();
        commands.executeCommand("setContext", "vdm-vscode.changeVdmjProperties", true);
        Util.registerCommand(this._disposables, "vdm-vscode.changeVdmjProperties", async () => {
            if (!knownVdmFolders) {
                return;
            }
            if (knownVdmFolders.size == 0) {
                window.showInformationMessage("Cannot find any VDMJ workspace folders");
                return;
            }
            const chosenWsFolder = await window.showQuickPick(
                Array.from(knownVdmFolders.entries()).map((entry) => entry[0].name),
                { canPickMany: false, title: "Select workspace folder" }
            );
            if (chosenWsFolder) {
                const wsFolder: WorkspaceFolder = Array.from(knownVdmFolders.keys()).find((key) => key.name == chosenWsFolder);
                const vscodeFolder: Uri = Uri.joinPath(wsFolder.uri, ".vscode");
                await Fs.ensureDir(vscodeFolder.fsPath);
                const propertiesFilePath: string = Uri.joinPath(vscodeFolder, this.fileName).fsPath;
                this.readPropertiesFiles(propertiesFilePath)
                    .then((properties) => this.changeProperties(properties, propertiesFilePath))
                    .catch((err) => console.log("[Change VDMJ Properties]: Unable to change properties due to: " + err));
            }
        });
    }

    private async changeProperties(properties: Map<string, string>, propertiesFilePath: string) {
        // Let the user select the properties that they wish to change
        const chosenProperties: string[] = await window.showQuickPick(
            Array.from(properties.entries())
                .map((entry) => this.prettifyPropertyName(entry[0]))
                .sort((a, b) => b.localeCompare(a))
                .reverse(),
            { canPickMany: true, title: "Select properties to change" }
        );
        // If the user selected properties then prompt the user to change them one by one.
        let userBailed: boolean = !chosenProperties;
        if (!userBailed) {
            for await (const prettyProperty of chosenProperties) {
                const property: string = this.unPrettifyPropertyName(prettyProperty);
                const value: string = properties.get(property);
                const newValue: string = await window.showInputBox({
                    title: prettyProperty,
                    value: value,
                    prompt: "Insert new value for the property.",
                    validateInput: (userInput: string) => {
                        // The input should be a number if original value is also a number
                        return !Number(userInput) && Number(value) ? `The value should be a number. Original value: ${value}` : "";
                    },
                });
                userBailed = !newValue;
                if (userBailed) {
                    break;
                }
                properties.set(property, newValue);
            }
            // Save the changes if the user did not bail on changing property values
            if (userBailed) {
                window.showInformationMessage("No property changes have been saved");
            } else {
                let newText: string = "";
                properties.forEach((value, key) => (newText += `${key} = ${value}\n`));

                Fs.writeFile(propertiesFilePath, newText.trim())
                    .then(() => Util.showRestartMsg("VDMJ properties changed. Please reload VS Code to enable the changes."))
                    .catch((err) => {
                        const msg: string = "Failed to save the changes";
                        window.showInformationMessage(msg);
                        console.log(`${msg}: ${err}`);
                    });
            }
        }
    }

    private readPropertiesFiles(propertiesFilePath: string): Promise<Map<string, string>> {
        return new Promise<Map<string, string>>(async (resolve, reject) => {
            if (!Fs.existsSync(propertiesFilePath)) {
                // Copy default properties file
                await Fs.copyFile(
                    Path.resolve(extensions.getExtension(extensionId).extensionPath, "resources", this.fileName),
                    propertiesFilePath
                );
            }

            Fs.readFile(propertiesFilePath, "utf8")
                .then((content) => {
                    // Read the properties file and map property name to value
                    const properties: Map<string, string> = new Map();
                    content
                        .trim()
                        .split(new RegExp("[\r\n\t]+"))
                        .forEach((line) => {
                            if (line.startsWith("vdmj.")) {
                                const lineSplit: string[] = line.split("=").map((split) => split.trim());
                                properties.set(lineSplit[0], lineSplit[1]);
                            }
                        });

                    return resolve(properties);
                })
                .catch((err) => reject(err));
        });
    }

    private prettifyPropertyName(propertyName: string): string {
        const splitOnPoint: string[] = propertyName.split(".");
        return `${splitOnPoint[1]}: ${splitOnPoint[2]}`;
    }

    private unPrettifyPropertyName(prettyPorperty: string): string {
        let reconstructedPropName: string = "vdmj.";
        const splitOnSpace: string[] = prettyPorperty.split(" ");
        return (reconstructedPropName += `${splitOnSpace[0].slice(0, splitOnSpace[0].length - 1)}.${splitOnSpace[1]}`);
    }
}
