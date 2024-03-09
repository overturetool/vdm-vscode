import React, { PropsWithChildren, useState, useEffect, useMemo, ChangeEvent } from "react";
import { VSCodeTextField, VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import { VSCodeAPI } from "../shared.types";
import { ProofObligation } from "../../slsp/protocol/ProofObligationGeneration";
import { ProofObligationsTable } from "./ProofObligationsTable";
import { QuickCheckPanel } from "./QuickCheckPanel";

export interface FormattedProofObligation extends Omit<ProofObligation, "name"> {
    name: string;
    breakableName: string;
}

const ProofObligationContainer = (props: PropsWithChildren) => {
    return <div css={{ height: "100%", display: "flex", flexDirection: "column", minWidth: "550px" }}>{props.children}</div>;
};

const formatProofObligationSource = (poSource: ProofObligation["source"]) => {
    if (typeof poSource === "string") {
        return poSource;
    }

    return poSource.reduce((formatted, line, idx) => {
        return formatted + "  ".repeat(idx) + line + "\n";
    }, "");
};

const formatProofObligations = (posSource: Array<ProofObligation>): Array<FormattedProofObligation> => {
    return posSource.map((po) => {
        return {
            ...po,
            // Join each section of name with zero-width space to allow breaking in between . in UI.
            name: po["name"].join("."),
            breakableName: po["name"].join("\u200B."),
            source: formatProofObligationSource(po["source"]),
        };
    }, []);
};

interface FilterState {
    matchingRows: number;
    totalRows: number;
}

interface ProofObligationsHeaderMenuProps {
    onFilterChanged: (newFilterText: string) => void;
    onExpandCollapse: () => void;
    vscodeApi: VSCodeAPI;
    enableQuickCheck: boolean;
    openPos: Set<number>;
    pos: Array<FormattedProofObligation>;
    filterState?: FilterState;
}

const ProofObligationsHeaderMenu = ({
    onFilterChanged,
    onExpandCollapse,
    vscodeApi,
    enableQuickCheck,
    openPos,
    pos,
    filterState
}: ProofObligationsHeaderMenuProps) => {
    return (
        <div
            css={{
                display: "flex",
                flexDirection: "row",
                justifyContent: "space-between",
                margin: "0.5em 1em 1em 0.5em",
                alignItems: "center",
            }}
        >
            <VSCodeTextField css={{flexShrink: 1}} onInput={(e) => {
                onFilterChanged((e.target as HTMLInputElement).value)
            }} type="text">
                Filter {filterState ? `(Showing ${filterState.matchingRows} of ${filterState.totalRows} rows.)` : null}
            </VSCodeTextField>
            <div css={{flexShrink: 0}}>
                <VSCodeButton css={{ margin: "0 1em" }} appearance="secondary" onClick={onExpandCollapse}>
                    {openPos.size === pos.length ? "Collapse all proof obligations" : "Expand all proof obligations"}
                </VSCodeButton>
                {enableQuickCheck ? (
                    <VSCodeButton
                        onClick={() =>
                            vscodeApi.postMessage({
                                command: "runQC"
                            })
                        }
                    >
                        Run QuickCheck
                    </VSCodeButton>
                ) : null}
            </div>
        </div>
    );
};

const filterPOs = (proofObligations: Array<FormattedProofObligation>, filterText: string) => {
    const preSplitTerms = filterText.split("+");
    const conjunctionTerms = preSplitTerms.map((term) => term.split(","));

    const filterableHeaders: Array<keyof FormattedProofObligation> = ["id", "kind", "name", "status"];

    // Check if any one term is found in the proof obligation
    const disjunctMatch = (po: FormattedProofObligation, orTerms: Array<string>) => filterableHeaders.some((id) => orTerms.some((term) => (po[id] ?? "").toString().toLowerCase().includes(term.toLowerCase())))
    // Check if all terms are found in the proof obligation
    const conjunctMatch = (po: FormattedProofObligation, andTerms: Array<Array<string>>) => andTerms.every((orTerms) => disjunctMatch(po, orTerms));

    return proofObligations.filter((po) => conjunctMatch(po, conjunctionTerms));
};

interface ProofObligationsViewProps {
    vscodeApi: VSCodeAPI;
    enableQuickCheck?: boolean;
}

export const ProofObligationsView = ({ vscodeApi, enableQuickCheck = false }: ProofObligationsViewProps) => {
    const [proofObligation, setProofObligation] = useState<FormattedProofObligation | null>(null);
    const [posAreInvalid, setPosAreInvalid] = useState<boolean>(false);
    const [pos, setPos] = useState<Array<FormattedProofObligation>>([]);
    const [openPos, setOpenPos] = useState<Set<number>>(new Set<number>());
    const [filterText, setFilterText] = useState<string>("");


    const filteredPos = useMemo(() => filterPOs(pos, filterText), [filterText, pos]); 
    const currentFilterState: FilterState | undefined = filterText === "" ? undefined : {
        matchingRows: filteredPos.length,
        totalRows: pos.length
    }

    const handleJumpToSource = (po: FormattedProofObligation) => {
        vscodeApi.postMessage({
            command: "goToSymbol",
            data: po.id
        });
    };

    const handleOpenQuickCheck = (po: FormattedProofObligation) => {
        setProofObligation(po);
    }

    const handleRowClick = (row: FormattedProofObligation) => {
        const id = row.id;
        if (openPos.has(id)) {
            setOpenPos((old) => {
                old.delete(id);
                return new Set(old);
            });
            return;
        }

        setOpenPos((old) => {
            old.add(id);
            return new Set(old);
        });
    };

    const handleExpandCollapseClick = () => {
        if (openPos.size === pos.length) {
            setOpenPos((old) => {
                old.clear();
                return new Set(old);
            });
            return;
        }

        setOpenPos(new Set(pos.map((po) => po.id)));
    };

    const onMessage = (e: MessageEvent) => {
        switch (e.data.command) {
            case "newPOs":
                setPos(formatProofObligations(e.data.pos));
                setProofObligation(null);
                setPosAreInvalid(false);
                break;
            case "rebuildPOview":
                setPos(formatProofObligations(e.data.pos));
                setProofObligation(null);
                break;
            case "posInvalid":
                setPosAreInvalid(true);
                break;
        }
    };

    useEffect(() => {
        window.addEventListener("message", onMessage);
        vscodeApi.postMessage({
            command: "readyToReceive",
        });

        return () => {
            window.removeEventListener("message", onMessage);
        };
    }, []);

    return (
        <ProofObligationContainer>
            <ProofObligationsHeaderMenu
                vscodeApi={vscodeApi}
                onFilterChanged={setFilterText}
                onExpandCollapse={handleExpandCollapseClick}
                enableQuickCheck={enableQuickCheck}
                openPos={openPos}
                pos={pos}
                filterState={currentFilterState}
            />

            <div
                css={{
                    flex: "1",
                    overflow: "scroll",
                }}
            >
                <ProofObligationsTable
                    headers={["id", "kind", "name", "status"]}
                    pos={filteredPos}
                    onJumpToSource={handleJumpToSource}
                    onClickRow={handleRowClick}
                    openPos={openPos}
                    onOpenQuickCheck={handleOpenQuickCheck}
                />
            </div>

            {proofObligation !== null ? (
                <QuickCheckPanel proofObligation={proofObligation} vscodeApi={vscodeApi} onClose={() => setProofObligation(null)} />
            ) : null}
        </ProofObligationContainer>
    );
};
