// SPDX-License-Identifier: GPL-3.0-or-later

import path = require("path");
import { Event, EventEmitter, ExtensionContext, Uri } from "vscode";
import { DynamicFeature, LanguageClient, LanguageClientOptions, ServerOptions, StaticFeature } from "vscode-languageclient/node";
import { ButtonEmitter } from "./ButtonEmitter";
import { CombinantorialTestingFeature } from "./CombinatorialTestingFeature";
import * as LanguageId from "./LanguageId";
import { ProofObligationGenerationFeature } from "./ProofObligationGenerationFeature";
import { TranslateRequest } from "./protocol/slsp/translate";
import { TranslateFeature } from "./TranslateFeature";
import * as util from "./Util"

export class SpecificationLanguageClient extends LanguageClient {
    public readonly projectRoot = this.clientOptions.workspaceFolder.uri;
    public readonly projectSavedDataUri = util.joinUriPath(this.projectRoot, ".generated");
    public readonly logPath: string;
    public readonly language: string;
    public readonly name: string;
    public readonly dataStoragePath: Uri
    public readonly events: SLSPClientEvents

    constructor(
        name: string,
        language: string,
        serverOptions: ServerOptions,
        clientOptions: LanguageClientOptions,
        context: ExtensionContext,
        dataStoragePath: Uri,
        events: SLSPClientEvents,
        forceDebug?: boolean) {
        super(name, serverOptions, clientOptions, forceDebug);
        this.name = name;
        this.language = language;
        this.dataStoragePath = dataStoragePath;
        this.events = events;
        this.logPath = path.resolve(context.logUri.fsPath, `${name}.log`);
        util.ensureDirectoryExistence(this.logPath);

        let features: (StaticFeature | DynamicFeature<any>)[] = [];
        features.push(new ProofObligationGenerationFeature(this));
        features.push(new CombinantorialTestingFeature());

        if (events.onDidRequestTranslateLatex)
            features.push(new TranslateFeature(this, LanguageId.latex, events.onDidRequestTranslateLatex));
        if (events.onDidRequestTranslateWord)
            features.push(new TranslateFeature(this, LanguageId.word, events.onDidRequestTranslateWord));
        if (events.onDidRequestTranslateCoverage)
            features.push(new TranslateFeature(this, LanguageId.coverage, events.onDidRequestTranslateCoverage));
        if (events.onDidRequestTranslateGraphviz)
            features.push(new TranslateFeature(this, LanguageId.graphviz, events.onDidRequestTranslateGraphviz));
        if (events.onDidRequestTranslateIsabelle)
            features.push(new TranslateFeature(this, LanguageId.isabelle, events.onDidRequestTranslateIsabelle));

        this.registerFeatures(features);
    };


}

export interface SLSPClientEvents {
    readonly onDidRequestTranslateLatex?: Event<Uri>;
    readonly onDidRequestTranslateWord?: Event<Uri>;
    readonly onDidRequestTranslateCoverage?: Event<Uri>;
    readonly onDidRequestTranslateGraphviz?: Event<Uri>;
    readonly onDidRequestTranslateIsabelle?: Event<Uri>;
}
