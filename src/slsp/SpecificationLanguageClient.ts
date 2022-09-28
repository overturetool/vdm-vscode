// SPDX-License-Identifier: GPL-3.0-or-later

import { LanguageClient, LanguageClientOptions, ServerOptions } from "vscode-languageclient/node";
import { CombinantorialTestingFeature } from "./features/CombinatorialTestingFeature";
import * as TranslationLanguageId from "./protocol/TranslationLanguageId";
import ProofObligationGenerationFeature from "./features/ProofObligationGenerationFeature";
import TranslateFeature from "./features/TranslateFeature";

export class SpecificationLanguageClient extends LanguageClient {
    constructor(
        name: string,
        public readonly languageId: string,
        serverOptions: ServerOptions,
        clientOptions: LanguageClientOptions,
        forceDebug?: boolean
    ) {
        super(name, serverOptions, clientOptions, forceDebug);
    }

    registerBuiltinFeatures() {
        super.registerBuiltinFeatures();
        this.registerFeature(new ProofObligationGenerationFeature(this));
        this.registerFeature(new CombinantorialTestingFeature(this));
        this.registerFeature(new TranslateFeature(this, TranslationLanguageId.latex));
        this.registerFeature(new TranslateFeature(this, TranslationLanguageId.word));
        this.registerFeature(new TranslateFeature(this, TranslationLanguageId.coverage));
        this.registerFeature(new TranslateFeature(this, TranslationLanguageId.graphviz));
        this.registerFeature(new TranslateFeature(this, TranslationLanguageId.isabelle));
        this.registerFeature(new TranslateFeature(this, TranslationLanguageId.vdm2uml));
        this.registerFeature(new TranslateFeature(this, TranslationLanguageId.uml2vdm));
    }
}
