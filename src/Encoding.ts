// SPDX-License-Identifier: GPL-3.0-or-later

import { TextDocument, workspace, window, ConfigurationTarget, commands } from "vscode";
import * as jschardet from 'jschardet'
import * as fs from 'fs-extra';
import * as util from "./Util"


// ************* Not used *****************
// export function checkEncodingMatch(document: TextDocument, logPath: string): void {
//     const wsFolder = workspace.getWorkspaceFolder(document.uri);
//
//     // Get encoding setting
//     const encodingSetting: string = workspace.getConfiguration('files', wsFolder).get('encoding');
//     if (!encodingSetting || Buffer.isEncoding(encodingSetting)) {
//         util.writeToLog(logPath, `Encoding setting not found`)
//         return;
//     }
//
//     // Get document encoding
//     let encodingDocument = jschardet.detect(fs.readFileSync(document.fileName));
//     if (!encodingDocument) {
//         util.writeToLog(logPath, `Could not determine document encoding for document: ${document.fileName}`);
//         return;
//     }
//     if (encodingDocument.encoding == 'ascii') // Interpret ascii encoding as utf8
//         encodingDocument.encoding = 'utf8'
//
//     // Compare the encodings
//     if (encodingDocument.encoding != encodingSetting) { // FIXME names from jschardet are not the same as the ones usen for files.encoding
//         util.writeToLog(logPath, `Document encoding (${encodingDocument.encoding}) does not match the encoding.files setting (${encodingSetting})`);
//
//         // Prompt user with warning
//         const encodingConfig = workspace.getConfiguration('vdm-vscode.encoding', wsFolder);
//         if (encodingConfig?.showWarning) {
//             window.showWarningMessage(`Document encoding (${encodingDocument.encoding}) does not match the encoding.files setting (${encodingSetting}) this may cause issues for the VDM extension`, "Do not show again").then(
//                 press => { if (press) encodingConfig.update("showWarning", false, ConfigurationTarget.Global) }
//             );
//         }
//     }
// }
// *******************************************

let once = false;
export function checkEncoding(document: TextDocument, logPath: string): void {
    // Check if done before
    if (once)
        return;

    const wsFolder = workspace.getWorkspaceFolder(document.uri);

    // Get document encoding
    let encodingDocument = jschardet.detect(fs.readFileSync(document.fileName));
    if (!encodingDocument) {
        util.writeToLog(logPath, `Could not determine document encoding for document: ${document.fileName}`);
        return;
    }

    // Prompt user with warning, if not UTF-8
    if (encodingDocument.encoding != 'ascii' && encodingDocument.encoding != 'UTF-8') {
        const encodingConfig = workspace.getConfiguration('vdm-vscode.encoding', wsFolder);
        if (encodingConfig?.showWarning) {
            window.showWarningMessage(`Document encoding is not UTF-8. Please set files.encoding to the correct encoding. Not doing so may cause issues for the VDM extensions`, 'Go to setting', 'Do not show again', 'Close').then(
                press => {
                    once = true;
                    if (press == 'Open settings UI')
                        commands.executeCommand('workbench.action.openSettings2', 'files.encoding')
                    if (press == 'Do not show again')
                        encodingConfig.update("showWarning", false, ConfigurationTarget.Global)
                }
            );
        }
    }
}

export function toJavaName(encoding: string): string {
    if (!nameMapVSC2Java.has(encoding))
        return undefined

    let javaname = nameMapVSC2Java.get(encoding);
    if (javaname == '')
        return undefined;

    return javaname;
}

const nameMapVSC2Java = new Map<string, string>([
    ['big5hkscs', 'big5hkscs'],
    ['cp437', 'cp437'],
    ['cp850', 'cp850'],
    ['cp852', 'cp852'],
    ['cp865', 'cp865'],
    ['cp866', 'cp866'],
    ['cp950', 'cp950'],
    ['eucjp', 'eucjp'],
    ['euckr', 'euckr'],
    ['gb18030', 'gb18030'],
    ['gb2312', 'gb2312'],
    ['gbk', 'gbk'],
    ['iso88591', 'iso8859-1'],
    ['iso885910', 'iso8859-10'],
    ['iso885911', 'iso8859-11'],
    ['iso885913', 'iso8859-13'],
    ['iso885914', 'iso8859-14'],
    ['iso885915', 'iso8859-15'],
    ['iso885916', 'iso8859-16'],
    ['iso88592', 'iso8859-2'],
    ['iso88593', 'iso8859-3'],
    ['iso88594', 'iso8859-4'],
    ['iso88595', 'iso8859-5'],
    ['iso88596', 'iso8859-6'],
    ['iso88597', 'iso8859-7'],
    ['iso88598', 'iso8859-8'],
    ['iso88599', 'iso8859-9'],
    ['koi8r', 'koi8_r'],
    ['koi8ru', ''],
    ['koi8t', ''],
    ['koi8u', 'koi8_u'],
    ['macroman', 'macroman'],
    ['shiftjis', 'shift_jis'],
    ['utf16be', 'utf-16be'],
    ['utf16le', 'utf-16le'],
    ['utf8', 'utf8'],
    ['utf8bom', ''],
    ['windows1250', 'windows-1250'],
    ['windows1251', 'windows-1251'],
    ['windows1252', 'windows-1252'],
    ['windows1253', 'windows-1253'],
    ['windows1254', 'windows-1254'],
    ['windows1255', 'windows-1255'],
    ['windows1256', 'windows-1256'],
    ['windows1257', 'windows-1257'],
    ['windows1258', 'windows-1258'],
    ['windows874', 'windows-874'],
])

// const nameMapJSCharDet2VSC = new Map<string, string>([
//     ['GB2312', 'gb2312'],
//     ['EUC-TW', 'euctw'],
//     ['EUC-KR', 'euckr'],
//     ...
// ])