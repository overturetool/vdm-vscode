/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as path from "path";
import * as Mocha from "mocha";
import * as glob from "glob";

export async function run(): Promise<void> {
    // Create the mocha test
    const mocha = new Mocha({
        ui: "tdd",
        color: true,
    });
    const testsRoot = path.join(__dirname);

    // Enable source map support
    // require('source-map-support').install();

    // Find test files
    const testFiles = await new Promise<string[]>((resolve, reject) => {
        glob(`**/**.test.js`, { ignore: ["**/**.test.js", "**/**.functional.test.js"], cwd: testsRoot }, (error, files) => {
            if (error) {
                return reject(error);
            }
            resolve(files);
        });
    });

    // Setup test files that need to be run
    testFiles.forEach((file) => mocha.addFile(path.join(testsRoot, file)));

    // TODO Needed?
    // // // Activate extension
    // // console.time('Time taken to activate the extension');
    // // try {
    // //     await activatePythonExtensionScript(); // see https://github.com/microsoft/vscode-python/blob/main/src/test/index.ts
    // //     console.timeEnd('Time taken to activate the extension');
    // // } catch (ex) {
    // //     console.error('Failed to activate python extension without errors', ex);
    // // }

    // Run the tests
    try {
        await new Promise<void>((resolve, reject) => {
            mocha
                .run((failures) => {
                    if (failures > 0) {
                        return reject(new Error(`${failures} total failures`));
                    }
                    resolve();
                })
                .uncaught((err: any) => {
                    console.error(err);
                    reject(err);
                });
        });
    } catch (e) {
        console.error(e);
    }
}
