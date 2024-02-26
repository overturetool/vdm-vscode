import React, { PropsWithChildren, useState } from "react"
import { VSCodeDataGrid, VSCodeDataGridRow, VSCodeDataGridCell, VSCodeDivider, VSCodePanels, VSCodePanelTab, VSCodePanelView } from "@vscode/webview-ui-toolkit/react";

const ProofObligationContainer = (props: PropsWithChildren) => {
    return (
        <div style={{"height": "100%", display: "flex", flexDirection: "column"}}>
            {props.children}
        </div>
    )
}

export const ProofObligationsView = () => {
    const [proofObligation, setProofObligation] = useState("");

    const rowData = [
        { cell1: "1", cell2: "map apply", cell3: "Plant.PlantInv(set of (Alarm), map (Period) to (set of (Expert)))", cell4: "Trivial", cell5: `(forall as:set of (Alarm), sch:map (Period) to (set of (Expert)) &
        (forall p in set (dom sch) &
            p in set dom sch))` },
        { cell1: "2", cell2: "map apply", cell3: "Plant.PlantInv(set of (Alarm), map (Period) to (set of (Expert)))", cell4: "Trivial", cell5: `(forall as:set of (Alarm), sch:map (Period) to (set of (Expert)) &
        (forall p in set (dom sch) &
            p in set dom sch but different))` },
        { cell1: "3", cell2: "total function", cell3: "Plant.ExpertToPage(Alarm, Period)", cell4: "Unchecked", cell5: "" },
        { cell1: "4", cell2: "map apply", cell3: "Plant.PlantInv(set of (Alarm), map (Period) to (set of (Expert)))", cell4: "Trivial", cell5: `(forall as:set of (Alarm), sch:map (Period) to (set of (Expert)) &
        (forall p in set (dom sch) &
            p in set dom sch but different))` },
        { cell1: "5", cell2: "map apply", cell3: "Plant.PlantInv(set of (Alarm), map (Period) to (set of (Expert)))", cell4: "Trivial", cell5: `(forall as:set of (Alarm), sch:map (Period) to (set of (Expert)) &
        (forall p in set (dom sch) &
            p in set dom sch but different))` },
        { cell1: "6", cell2: "map apply", cell3: "Plant.PlantInv(set of (Alarm), map (Period) to (set of (Expert)))", cell4: "Trivial", cell5: `(forall as:set of (Alarm), sch:map (Period) to (set of (Expert)) &
        (forall p in set (dom sch) &
            p in set dom sch but different))` },
        { cell1: "7", cell2: "map apply", cell3: "Plant.PlantInv(set of (Alarm), map (Period) to (set of (Expert)))", cell4: "Trivial", cell5: `(forall as:set of (Alarm), sch:map (Period) to (set of (Expert)) &
        (forall p in set (dom sch) &
            p in set dom sch but different))` },
        { cell1: "8", cell2: "map apply", cell3: "Plant.PlantInv(set of (Alarm), map (Period) to (set of (Expert)))", cell4: "Trivial", cell5: `(forall as:set of (Alarm), sch:map (Period) to (set of (Expert)) &
        (forall p in set (dom sch) &
            p in set dom sch but different))` },
        { cell1: "9", cell2: "map apply", cell3: "Plant.PlantInv(set of (Alarm), map (Period) to (set of (Expert)))", cell4: "Trivial", cell5: `(forall as:set of (Alarm), sch:map (Period) to (set of (Expert)) &
        (forall p in set (dom sch) &
            p in set dom sch but different))` },
        { cell1: "10", cell2: "map apply", cell3: "Plant.PlantInv(set of (Alarm), map (Period) to (set of (Expert)))", cell4: "Trivial", cell5: `(forall as:set of (Alarm), sch:map (Period) to (set of (Expert)) &
        (forall p in set (dom sch) &
            p in set dom sch but different))` },
        { cell1: "11", cell2: "map apply", cell3: "Plant.PlantInv(set of (Alarm), map (Period) to (set of (Expert)))", cell4: "Trivial", cell5: `(forall as:set of (Alarm), sch:map (Period) to (set of (Expert)) &
        (forall p in set (dom sch) &
            p in set dom sch but different))` },
        { cell1: "12", cell2: "map apply", cell3: "Plant.PlantInv(set of (Alarm), map (Period) to (set of (Expert)))", cell4: "Trivial", cell5: `(forall as:set of (Alarm), sch:map (Period) to (set of (Expert)) &
        (forall p in set (dom sch) &
            p in set dom sch but different))` },
        
    ];

    return (
        <ProofObligationContainer>
            <div>
                <VSCodeDataGrid gridTemplateColumns="1fr 2fr 6fr 2fr" style={{flexGrow: "1"}}>
                    <VSCodeDataGridRow row-type="header">
                        <VSCodeDataGridCell cell-type="columnheader" grid-column="1">
                            id
                        </VSCodeDataGridCell>
                        <VSCodeDataGridCell cell-type="columnheader" grid-column="2">
                            kind
                        </VSCodeDataGridCell>
                        <VSCodeDataGridCell cell-type="columnheader" grid-column="3">
                            name
                        </VSCodeDataGridCell>
                        <VSCodeDataGridCell cell-type="columnheader" grid-column="4">
                            status
                        </VSCodeDataGridCell>
                    </VSCodeDataGridRow>
                    {rowData.map((row) => (
                        <VSCodeDataGridRow onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            setProofObligation(row.cell5)
                            }}>
                            <VSCodeDataGridCell grid-column="1">{row.cell1}</VSCodeDataGridCell>
                            <VSCodeDataGridCell grid-column="2">{row.cell2}</VSCodeDataGridCell>
                            <VSCodeDataGridCell grid-column="3">{row.cell3}</VSCodeDataGridCell>
                            <VSCodeDataGridCell grid-column="4">{row.cell4}</VSCodeDataGridCell>
                        </VSCodeDataGridRow>
                    ))}
                </VSCodeDataGrid>
            </div>
            <VSCodeDivider/>
            {
                proofObligation !== "" ? 
                <VSCodePanels style={{flexGrow: "1"}}>
                <VSCodePanelTab id="tab-1">Proof Obligation</VSCodePanelTab>
                <VSCodePanelTab id="tab-2">QuickCheck</VSCodePanelTab>
                <VSCodePanelView id="view-1">
                    <div style={{"display": "flex", "justifyContent": "center", "alignItems": "center", "width": "100%", height: "200px", "whiteSpace": "pre-line", "backgroundColor": "#292929"}}>
                        {`
                        ${proofObligation}
                        `}
                    </div>
                </VSCodePanelView>
                <VSCodePanelView id="view-2">
                    QuickCheck Stuff
                </VSCodePanelView>
            </VSCodePanels> : null
            }
        </ProofObligationContainer>
    );
};
