// SPDX-License-Identifier: GPL-3.0-or-later

import { Event, Uri, EventEmitter } from "vscode";
import { ButtonEmitter } from "../../ButtonEmitter";
import * as LanguageId from "../../LanguageId";


export namespace SLSPEvents {



    export namespace translate {
        const onDidRequestTranslateLatexEmitter: EventEmitter<Uri> = new ButtonEmitter(`vdm-vscode.translate.${LanguageId.latex}`);
        export const onDidRequestTranslateLatex: Event<Uri> = onDidRequestTranslateLatexEmitter.event;

        const onDidRequestTranslateWordEmitter: EventEmitter<Uri> = new ButtonEmitter(`vdm-vscode.translate.${LanguageId.word}`);
        export const onDidRequestTranslateWord: Event<Uri> = onDidRequestTranslateWordEmitter.event;

        const onDidRequestTranslateCoverageEmitter: EventEmitter<Uri> = new ButtonEmitter(`vdm-vscode.translate.${LanguageId.coverage}`);
        export const onDidRequestTranslateCoverage: Event<Uri> = onDidRequestTranslateCoverageEmitter.event;

        const onDidRequestTranslateGraphvizEmitter: EventEmitter<Uri> = new ButtonEmitter(`vdm-vscode.translate.${LanguageId.graphviz}`);
        export const onDidRequestTranslateGraphviz: Event<Uri> = onDidRequestTranslateGraphvizEmitter.event;

        const onDidRequestTranslateIsabelleEmitter: EventEmitter<Uri> = new ButtonEmitter(`vdm-vscode.translate.${LanguageId.isabelle}`);
        export const onDidRequestTranslateIsabelle: Event<Uri> = onDidRequestTranslateIsabelleEmitter.event;

        export const onDidRequestTranslate: Map<string, Event<Uri>> = new Map<string, Event<Uri>>([
            [LanguageId.latex, onDidRequestTranslateLatex],
            [LanguageId.word, onDidRequestTranslateWord],
            [LanguageId.coverage, onDidRequestTranslateCoverage],
            [LanguageId.graphviz, onDidRequestTranslateGraphviz],
            [LanguageId.isabelle, onDidRequestTranslateIsabelle]
        ])
    }
}