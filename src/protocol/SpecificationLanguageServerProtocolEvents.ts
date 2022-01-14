import * as vscode from 'vscode'

export namespace Translate {
    export let onDidRequestTranslate: vscode.Event<TranslateInfo>;
    export interface TranslateInfo {
        uri: vscode.Uri,
        language: string
    }
    export function setEmitter(e: vscode.EventEmitter<TranslateInfo>) {
        onDidRequestTranslate = e.event;
    }
}