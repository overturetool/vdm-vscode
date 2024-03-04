import React, { PropsWithChildren, useState, useEffect } from "react";
import { VSCodeDataGrid, VSCodeDataGridRow, VSCodeDataGridCell, VSCodeTextField, VSCodeButton } from "@vscode/webview-ui-toolkit/react";

const ProofObligationContainer = (props: PropsWithChildren) => {
    return <div style={{ height: "100%", display: "flex", flexDirection: "column", minWidth: "550px" }}>{props.children}</div>;
};

const formatProofObligationSource = (poSource: Array<string>) => {
    console.log(poSource);
    return poSource.reduce((formatted, line, idx) => {
        return formatted + "  ".repeat(idx) + line + "\n";
    }, "");
};

const formatProofObligations = (posSource: Array<Record<string, any>>) => {
    return posSource.map((po) => {
        console.log(po);
        return {
            id: po["id"],
            kind: po["kind"],
            name: po["name"].join("\u200B."),
            status: po["status"],
            source: formatProofObligationSource(po["source"]),
            provedBy: po["provedBy"],
            message: po["message"],
            witness: po["witness"],
            counterexample: po["counterexample"],
        };
    }, []);
};

const HeaderSortingArrow = ({ direction, hide }: { direction: "ascending" | "descending"; hide: boolean }) => {
    let arrowClass = "";

    if (direction == "ascending") {
        arrowClass = "codicon codicon-arrow-small-up";
    } else if (direction == "descending") {
        arrowClass = "codicon codicon-arrow-small-down";
    }

    return <span className={arrowClass} style={{ position: "relative", top: "4px", visibility: hide ? "hidden" : "visible" }}></span>;
};

const ProofObligationsTableHeader = ({
    headers,
    onUpdateSortingState,
}: {
    headers: Array<string>;
    onUpdateSortingState: (newState: { id: string; direction: "ascending" | "descending" }) => void;
}) => {
    const [sortingState, setSortingState] = useState<{ id: string; direction: "ascending" | "descending" }>({
        id: "id",
        direction: "ascending",
    });

    const handleGridClick = (headerId: string) => {
        console.log(headerId, sortingState);
        let newSortingState;
        if (sortingState.id === headerId) {
            if (sortingState.direction === "ascending") {
                newSortingState = {
                    id: headerId,
                    direction: "descending",
                };
            } else {
                newSortingState = {
                    id: headers[0],
                    direction: "ascending",
                };
            }
        } else {
            newSortingState = {
                id: headerId,
                direction: "ascending",
            };
        }

        setSortingState(newSortingState);
        onUpdateSortingState(newSortingState);
    };

    return (
        <VSCodeDataGridRow row-type="sticky-header" style={{ zIndex: 1 }}>
            {headers.map((header, idx) => (
                <VSCodeDataGridCell
                    onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        handleGridClick(header);
                    }}
                    cell-type="columnheader"
                    grid-column={`${idx + 1}`}
                >
                    <div>
                        {header} <HeaderSortingArrow direction={sortingState.direction} hide={sortingState.id !== header} />
                    </div>
                </VSCodeDataGridCell>
            ))}
        </VSCodeDataGridRow>
    );
};

const ProofObligationsTable = ({ pos, onSelectPo, filterText, openPos, onClickRow }) => {
    const [sortingState, setSortingState] = useState({
        id: "id",
        direction: "ascending",
    });

    const filterPOs = (proofObligations: Array<any>) => {
        return proofObligations.filter((po) =>
            ["id", "kind", "name", "status"].some((id) => po[id].toString().toLowerCase().includes(filterText.toLowerCase()))
        );
    };

    const sortPOs = (proofObligations) => {
        const directionFactor = sortingState.direction === "ascending" ? 1 : -1;
        const sortKey = sortingState.id;
        const _sortedPOs = proofObligations.sort((a, b) => {
            if (a[sortKey] < b[sortKey]) {
                return -1 * directionFactor;
            } else if (a[sortKey] > b[sortKey]) {
                return directionFactor;
            }

            return 0;
        });

        return _sortedPOs;
    };

    const sortedPOs = sortPOs(filterPOs(pos));

    return (
        <VSCodeDataGrid gridTemplateColumns="2fr 3fr 8fr 3fr" style={{ flexGrow: "1" }}>
            <ProofObligationsTableHeader headers={["id", "kind", "name", "status"]} onUpdateSortingState={setSortingState} />
            {sortedPOs.map((row) => (
                <>
                    <VSCodeDataGridRow
                        onClick={() => onClickRow(row)}
                        key={row.id}
                        style={{ borderTop: "2px solid var(--vscode-textBlockQuote-background)" }}
                    >
                        <VSCodeDataGridCell grid-column="1">
                            <VSCodeButton
                                onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    onSelectPo(row);
                                }}
                                appearance="icon"
                                style={{ position: "relative", top: "-4px", left: "-8px" }}
                            >
                                <span className="codicon codicon-go-to-file"></span>
                            </VSCodeButton>
                            &nbsp;{row.id}
                        </VSCodeDataGridCell>
                        <VSCodeDataGridCell style={{ overflowWrap: "break-word" }} grid-column="2">
                            {row.kind}
                        </VSCodeDataGridCell>
                        <VSCodeDataGridCell style={{ overflowWrap: "break-word" }} grid-column="3">
                            {row.name}
                        </VSCodeDataGridCell>
                        <VSCodeDataGridCell style={{ overflowWrap: "break-word" }} grid-column="4">
                            {row.status}
                        </VSCodeDataGridCell>
                    </VSCodeDataGridRow>
                    {openPos.has(row.id) ? (
                        <div
                            style={{
                                width: "100%",
                                padding: "1em 0.5em",
                                boxSizing: "border-box",
                                whiteSpace: "pre-wrap",
                            }}
                        >
                            {row.source}
                        </div>
                    ) : null}
                </>
            ))}
        </VSCodeDataGrid>
    );
};

const QuickCheckExampleTable = ({ variables }) => {
    if (variables.length === 0) {
        return null;
    }

    return (
        <>
            <VSCodeDataGrid gridTemplateColumns="1fr 1fr" style={{ flexGrow: "1", marginTop: "1em" }}>
                <ProofObligationsTableHeader headers={["variable", "value"]} onUpdateSortingState={() => undefined} />
                {variables.map((row) => (
                    <VSCodeDataGridRow key={row[0]}>
                        <VSCodeDataGridCell grid-column="1">{row[0]}</VSCodeDataGridCell>
                        <VSCodeDataGridCell style={{ overflowWrap: "break-word" }} grid-column="2">
                            {row[1]}
                        </VSCodeDataGridCell>
                    </VSCodeDataGridRow>
                ))}
            </VSCodeDataGrid>
        </>
    );
};

const QuickCheckView = ({ proofObligation, vscodeApi, onClose }: { proofObligation: any; vscodeApi: any; onClose?: CallableFunction }) => {
    let provedByMessage = proofObligation.provedBy ? `Proved by: ${proofObligation.provedBy}` : "";

    if (proofObligation.message) {
        provedByMessage = `${provedByMessage} - ${proofObligation.message}`;
    }

    const counterExampleVariables = Object.entries(proofObligation?.counterexample?.variables ?? {});
    const witnessVariables = Object.entries(proofObligation?.witness?.variables ?? {});
    // There will never be both a counterexample and a witness, so the following array is either equal to counterExampleVariables or witnessVariables or []
    const allVariables = [...counterExampleVariables, ...witnessVariables];

    let launchCommand: string;

    if (proofObligation.counterexample) {
        launchCommand = proofObligation.counterexample.launch.command;
    } else if (proofObligation.witness) {
        launchCommand = proofObligation.witness.launch.command;
    }

    return (
        <div
            css={{
                width: "100%",
                whiteSpace: "pre-wrap",
                backgroundColor: "var(--vscode-textBlockQuote-background)",
                overflow: "scroll",
                padding: "2em",
                boxSizing: "border-box",
                minHeight: "200px",
                maxHeight: "50%",
                "&::-webkit-scrollbar-track": {
                    backgroundColor: "var(--vscode-editor-background)",
                },
            }}
        >
            <div style={{ display: "flex", flexDirection: "row", justifyContent: "flex-start" }}>
                <VSCodeButton
                    style={{ justifySelf: "flex-start", position: "relative", top: "0px" }}
                    appearance="icon"
                    onClick={(e) => {
                        if (onClose) {
                            onClose(e);
                        }
                    }}
                >
                    <span className="codicon codicon-close"></span>
                </VSCodeButton>
                {launchCommand != null ? (
                    <VSCodeButton
                        css={{
                            marginLeft: "auto",
                        }}
                        onClick={() =>
                            vscodeApi.postMessage({
                                command: "debugQCRun",
                                data: launchCommand,
                            })
                        }
                    >
                        Debug example
                        <span slot="start" className="codicon codicon-debug-start"></span>
                    </VSCodeButton>
                ) : null}
            </div>

            {provedByMessage}
            <QuickCheckExampleTable variables={allVariables} />
        </div>
    );
};

export const ProofObligationsView = ({ vscodeApi }) => {
    const [proofObligation, setProofObligation] = useState(null);
    const [posAreInvalid, setPosAreInvalid] = useState(false);
    const [pos, setPos] = useState([]);
    const [openPos, setOpenPos] = useState(new Set());
    const [filterText, setFilterText] = useState("");

    const handleSelectPo = (po) => {
        setProofObligation(po);
        console.log(po);
        vscodeApi.postMessage({
            command: "goToSymbol",
            data: po.id,
        });
    };

    const handleRowClick = (row) => {
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
            })
            return;
        }

        setOpenPos(new Set(pos.map((po) => po.id)));
    }

    const onMessage = (e) => {
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
            case "updateFilterBtn":
                break;
        }
    };

    useEffect(() => {
        window.addEventListener("message", onMessage);

        return () => {
            window.removeEventListener("message", onMessage);
        };
    }, []);

    return (
        <ProofObligationContainer>
            <div
                style={{
                    display: "flex",
                    flexDirection: "row",
                    justifyContent: "space-between",
                    margin: "0.5em 1em 1em 0.5em",
                    alignItems: "center",
                }}
            >
                <VSCodeTextField onInput={(e) => setFilterText(e.target.value)} type="text">
                    Filter
                </VSCodeTextField>
                <div>
                    <VSCodeButton
                        style={{ margin: "0 1em" }}
                        appearance="secondary"
                        onClick={handleExpandCollapseClick}
                    >
                        {openPos.size === pos.length ? "Collapse all proof obligations" : "Expand all proof obligations"}
                    </VSCodeButton>
                    <VSCodeButton
                        onClick={() =>
                            vscodeApi.postMessage({
                                command: "debugQCRun",
                                data: "qc",
                            })
                        }
                    >
                        Run QuickCheck
                    </VSCodeButton>
                </div>
            </div>

            <div
                css={{
                    flex: "1",
                    overflow: "scroll",
                }}
            >
                <ProofObligationsTable filterText={filterText} pos={pos} onSelectPo={handleSelectPo} onClickRow={handleRowClick} openPos={openPos}/>
            </div>

            {proofObligation !== null ? (
                <QuickCheckView proofObligation={proofObligation} vscodeApi={vscodeApi} onClose={() => setProofObligation(null)} />
            ) : null}
        </ProofObligationContainer>
    );
};
