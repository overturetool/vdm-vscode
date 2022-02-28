// SPDX-License-Identifier: GPL-3.0-or-later

import { Disposable } from "vscode";

export default class AutoDisposable implements Disposable {
    protected _disposables: Disposable[] = [];

    dispose() {
        while (this._disposables.length) this._disposables.pop().dispose();
    }
}
