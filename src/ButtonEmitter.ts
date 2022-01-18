// SPDX-License-Identifier: GPL-3.0-or-later

import { commands, Uri, Disposable, window } from 'vscode'
import { Emitter } from 'vscode-languageclient';

export interface ButtonArgs<I> {
    uri: Uri,
    args?: I
}

export class ButtonEmitter extends Emitter<Uri> {
    private _commandListener: Disposable;

    constructor(
        private readonly _command: string,
    ) {
        super({
            onFirstListenerAdd: () => commands.executeCommand('setContext', this._command, true),
            onLastListenerRemove: () => commands.executeCommand('setContext', this._command, false)
        })
        this._commandListener = commands.registerCommand(this._command, (uri: Uri) => this.didInvoke(uri));
    }

    private didInvoke(uri: Uri): void {
        if (!uri)
            uri = window.activeTextEditor.document.uri;

        this.fire(uri);
    }

    dispose() {
        this._commandListener.dispose();
        super.dispose();
    }
}