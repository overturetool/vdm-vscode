import * as assert from "assert";

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from "vscode";
//import * as vdmvscode from "../../src/extension";

suite("FMU Import Export", () => {
    vscode.window.showInformationMessage("Start all tests.");

    setup(async () => {
        // the tests assume that typescript features are registered
        await vscode.extensions.getExtension("overturetool.vdm-vscode")!.activate();
    });

    test("Should succedd in importing the FMU", async () => {
        await vscode.commands.executeCommand("vdm-vscode.fmuImport", "/tmp").then(
            (ret) => {
                console.log(ret);
                assert.ok(ret);
            },
            (error) => {
                console.log(error);
                assert.ok(false);
            }
        );
        return false;
    });

    test("Should succedd in exporting the FMU", async () => {
        await vscode.commands.executeCommand("vdm-vscode.fmuWrpExport", "/tmp/").then((ret) => {
            console.log(ret);
            assert.ok(ret);
        });
    }),
        (error) => {
            console.log(error);
            assert.ok(false);
        };
    return false;
});
