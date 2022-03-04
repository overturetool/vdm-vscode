// SPDX-License-Identifier: GPL-3.0-or-later

import { LanguageClient, LanguageClientOptions, ServerOptions } from "vscode-languageclient/node";
import { CombinantorialTestingFeature } from "./features/CombinatorialTestingFeature";
import * as LanguageId from "./protocol/LanguageId";
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
        this.registerFeature(new TranslateFeature(this, LanguageId.latex));
        this.registerFeature(new TranslateFeature(this, LanguageId.word));
        this.registerFeature(new TranslateFeature(this, LanguageId.coverage));
        this.registerFeature(new TranslateFeature(this, LanguageId.graphviz));
        this.registerFeature(new TranslateFeature(this, LanguageId.isabelle));
    }
}
