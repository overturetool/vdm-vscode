// SPDX-License-Identifier: GPL-3.0-or-later

import { Disposable, Event, Uri } from "vscode";
import { Emitter } from "vscode-languageclient/node";
import { ButtonEmitter } from "./ButtonEmitter";
import * as LanguageId from "./LanguageId";
import { SLSPClientEvents } from "./SpecificationLanguageClient";


export class SLSPClientEventsDispatcher implements SLSPClientEvents, Disposable {
    private _disposables: Disposable[] = [];
    private _translateEmitters: Map<string, Emitter<Uri>> = new Map();
    readonly onDidRequestTranslateLatex: Event<Uri>;
    readonly onDidRequestTranslateWord: Event<Uri>;
    readonly onDidRequestTranslateCoverage: Event<Uri>;
    readonly onDidRequestTranslateGraphviz: Event<Uri>;
    readonly onDidRequestTranslateIsabelle: Event<Uri>;

    constructor() {
        // Create emitters
        [LanguageId.latex,
        LanguageId.word,
        LanguageId.coverage,
        LanguageId.graphviz,
        LanguageId.isabelle].forEach(language => {
            let emitter = new ButtonEmitter(`vdm-vscode.translate.${language}`);
            this._translateEmitters.set(language, emitter);
            this._disposables.push(emitter);
        })

        // Set events
        this.onDidRequestTranslateLatex = this._translateEmitters.get(LanguageId.latex).event;
        this.onDidRequestTranslateWord = this._translateEmitters.get(LanguageId.word).event;
        this.onDidRequestTranslateCoverage = this._translateEmitters.get(LanguageId.coverage).event;
        this.onDidRequestTranslateGraphviz = this._translateEmitters.get(LanguageId.graphviz).event;
        this.onDidRequestTranslateIsabelle = this._translateEmitters.get(LanguageId.isabelle).event;
    }
    dispose() {
        this._disposables.forEach(d => d.dispose());
    }
}