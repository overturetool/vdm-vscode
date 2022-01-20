// SPDX-License-Identifier: GPL-3.0-or-later

import path = require("path");
import { Uri } from "vscode";
import { LanguageClient, LanguageClientOptions, ServerOptions } from "vscode-languageclient/node";
import { CombinantorialTestingFeature } from "./slsp/features/ct/CombinatorialTestingFeature";
import * as LanguageId from "./LanguageId";
import ProofObligationGenerationFeature from "./slsp/features/pog/ProofObligationGenerationFeature";
import TranslateFeature from "./slsp/features/translate/TranslateFeature";
import * as util from "./Util"

export class SpecificationLanguageClient extends LanguageClient {
    public readonly projectRoot = this.clientOptions.workspaceFolder.uri;
    public readonly projectSavedDataUri = util.joinUriPath(this.projectRoot, ".generated");
    public readonly language: string;
    public readonly name: string;
    public readonly dataStoragePath: Uri

    constructor(
        name: string,
        language: string,
        serverOptions: ServerOptions,
        clientOptions: LanguageClientOptions,
        dataStoragePath: Uri,
        forceDebug?: boolean) {
        super(name, serverOptions, clientOptions, forceDebug);
        this.name = name;
        this.language = language;
        this.dataStoragePath = dataStoragePath;
    };

    registerBuiltinFeatures() {
        super.registerBuiltinFeatures();
        this.registerFeature(new ProofObligationGenerationFeature(this));
        this.registerFeature(new CombinantorialTestingFeature());
        this.registerFeature(new TranslateFeature(this, LanguageId.latex));
        this.registerFeature(new TranslateFeature(this, LanguageId.word));
        this.registerFeature(new TranslateFeature(this, LanguageId.coverage));
        this.registerFeature(new TranslateFeature(this, LanguageId.graphviz));
        this.registerFeature(new TranslateFeature(this, LanguageId.isabelle));
    }
}