import { expect } from "chai";
import { dialectToPrettyFormat, getDialectFromAlias, vdmDialects } from "../../src/util/DialectUtil";

describe("getDialectFromAlias", () => {
    it("throw error on mismatch", () => {
        expect(() => getDialectFromAlias("badAlias")).to.throw(Error);
    });

    [
        ["vdmsl", vdmDialects.VDMSL],
        ["vsl", vdmDialects.VDMSL],
        ["vdm-sl", vdmDialects.VDMSL],
        ["sl", vdmDialects.VDMSL],
        ["vdmpp", vdmDialects.VDMPP],
        ["vpp", vdmDialects.VDMPP],
        ["vdm-pp", vdmDialects.VDMPP],
        ["pp", vdmDialects.VDMPP],
        ["vdm++", vdmDialects.VDMPP],
        ["vdmrt", vdmDialects.VDMRT],
        ["vrt", vdmDialects.VDMRT],
        ["vdm-rt", vdmDialects.VDMRT],
        ["rt", vdmDialects.VDMRT],
    ].forEach((testInput) => {
        it("return valid dialects on direct match", () => {
            expect(getDialectFromAlias(testInput[0])).to.be(testInput[1]);
        });
    });

    [
        ["VDMSL", vdmDialects.VDMSL],
        ["VdM++", vdmDialects.VDMPP],
        ["VDM-rt", vdmDialects.VDMRT],
    ].forEach((testInput) => {
        it("return valid dialects on large letters", () => {
            expect(getDialectFromAlias(testInput[0])).to.be(testInput[1]);
        });
    });
});

describe("dialectToPrettyFormat", () => {
    [
        [vdmDialects.VDMSL, "VDM-SL"],
        [vdmDialects.VDMPP, "VDM++"],
        [vdmDialects.VDMRT, "VDM-RT"],
    ].forEach((testInput) => {
        it("return dialects on match", () => {
            expect(dialectToPrettyFormat[testInput[0]]).to.be(testInput[1]);
        });
    });

    it("return undefined on no match", () => {
        expect(dialectToPrettyFormat["badInput"]).to.be.undefined;
    });
});

// describe("pickDialect", () => {
//     test("");
// });
