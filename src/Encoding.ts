import { TextDocument, workspace, window, ConfigurationTarget } from "vscode";
import * as jschardet from 'jschardet'
import * as fs from 'fs-extra';
import * as util from "./Util"

export function checkEncodingMatch(document: TextDocument, logPath: string): void {
    const wsFolder = workspace.getWorkspaceFolder(document.uri);

    // Get encoding setting
    const encodingSetting = workspace.getConfiguration('files', wsFolder).get('encoding');
    if (!encodingSetting) {
        util.writeToLog(logPath, `Encoding setting not found`)
        return;
    }

    // Get document encoding
    let encodingDocument = jschardet.detect(fs.readFileSync(document.fileName));
    if (!encodingDocument) {
        util.writeToLog(logPath, `Could not determine document encoding for document: ${document.fileName}`);
        return;
    }
    if (encodingDocument.encoding == 'ascii') // Interpret ascii encoding as utf8
        encodingDocument.encoding = 'utf8'

    // Compare the encodings
    if (encodingDocument.encoding != encodingSetting) {
        util.writeToLog(logPath, `Document encoding (${encodingDocument.encoding}) does not match the encoding.files setting (${encodingSetting})`);

        // Prompt user with warning
        const encodingConfig = workspace.getConfiguration('vdm-vscode.encoding', wsFolder);
        if (encodingConfig?.showWarning) {
            window.showWarningMessage(`Document encoding (${encodingDocument.encoding}) does not match the encoding.files setting (${encodingSetting}) this may cause issues for the VDM extension`, "Do not show again").then(
                press => { if (press) encodingConfig.update("showWarning", false, ConfigurationTarget.Global) }
            );
        }
    }
}