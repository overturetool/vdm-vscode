import { expect } from "chai";
import { getDialectFromAlias, dialectToPrettyDialect, isVDMFile } from "../../src/util/DialectUtil";

describe("getDialectFromAlias", () => {
    it("throw error on mismatch", () => {
        expect(() => getDialectFromAlias("badAlias")).to.throw(Error);
    });

    [
        ["vdmsl", "vdmsl"],
        ["vsl", "vdmsl"],
        ["vdm-sl", "vdmsl"],
        ["sl", "vdmsl"],
        ["vdmpp", "vdmpp"],
        ["vpp", "vdmpp"],
        ["vdm-pp", "vdmpp"],
        ["pp", "vdmpp"],
        ["vdm++", "vdmpp"],
        ["vdmrt", "vdmrt"],
        ["vrt", "vdmrt"],
        ["vdm-rt", "vdmrt"],
        ["rt", "vdmrt"],
    ].forEach((testInput) => {
        it("return valid dialects on direct match", () => {
            expect(getDialectFromAlias(testInput[0])).to.be(testInput[1]);
        });
    });

    [
        ["VDMSL", "vdmsl"],
        ["VdM++", "vdmpp"],
        ["VDM-rt", "vdmrt"],
    ].forEach((testInput) => {
        it("return valid dialects on large letters", () => {
            expect(getDialectFromAlias(testInput[0])).to.be(testInput[1]);
        });
    });
});

describe("getDialectFromPretty", () => {
    [
        ["VDM-SL", "vdmsl"],
        ["VDM++", "vdmpp"],
        ["VDM-RT", "vdmrt"],
    ].forEach((testInput) => {
        it("return dialects on match", () => {
            expect(dialectToPrettyDialect(testInput[0])).to.be(testInput[1]);
        });
    });

    it("return undefined on no match", () => {
        expect(dialectToPrettyDialect("badInput")).to.be.undefined;
    });
});

describe("isVDMFile", () => {
    it("return true for vdm file extension", () => {
        expect(isVDMFile("some.path.vdmsl")).to.be.true;
    });

    it("return false for non vdm file extension", () => {
        expect(isVDMFile("some.invalid.vdmsl.path")).to.be.false;
    });
});

// describe("pickDialect", () => {
//     test("");
// });
