// SPDX-License-Identifier: GPL-3.0-or-later

const vscode = acquireVsCodeApi();

let filterBtn = document.getElementById('filterPOsBtn');
let expandBtn = document.getElementById('expandPOsBtn');

let filteringPOs = false;
let expandPOs = false;

function buildTable(pos, poContainer) {
    //  Access the DOM to get the table construct and add to it.
    let table = document.createElement('table');
    table.id = "poTable";
    poContainer.appendChild(table);

    //  Build the headers
    let headers = Object.keys(pos[0]).filter(k => k.indexOf("source") == -1 && k.indexOf("location") == -1 && k.indexOf("group") == -1);
    let thead = table.createTHead();
    let headerRow = thead.insertRow();

    //  Cell for the "collapsible sign" present in the table body
    let th = document.createElement("th");
    th.appendChild(document.createTextNode(""));
    headerRow.appendChild(th);

    //  Add the rest of the header row cells
    for (let key of headers) {
        let th = document.createElement("th");

        // Enable sort on some of the headers and add a sorting sign cell
        if (key == 'id' || key == 'kind' || key == 'name' || key == 'status') {
            th.classList.add("clickableheadercell");
            th.onclick = function () {
                sortTable(table.rows[0].getElementsByTagName("th")[th.cellIndex].innerHTML);
            }
        }
        th.appendChild(document.createTextNode(key));
        headerRow.appendChild(th);
    }

    // Build the data rows
    let tbdy = document.createElement("tbody");
    tbdy.id = "posbody";
    table.appendChild(tbdy);
    for (let po of pos) {
        let mainrow = tbdy.insertRow();
        mainrow.classList.add("mainrow");

        // Click listener for expanding sub row
        mainrow.onclick = function () {
            let subrow = tbdy.getElementsByTagName('tr')[mainrow.rowIndex];
            subrow.style.display = subrow.style.display === "none" ? "table-row" : "none";

            let signcell = tbdy.getElementsByTagName('tr')[mainrow.rowIndex - 1].cells[0];
            signcell.innerText = signcell.innerText === "+" ? "-" : "+";
        }

        // Click listener for go to
        mainrow.ondblclick = function () {
            vscode.postMessage({
                command: 'goToSymbol',
                text: tbdy.getElementsByTagName('tr')[mainrow.rowIndex - 1].cells[1].innerText
            });
        }

        // Add cell for "collapsible sign" as the first cell in the row
        let mainrow_signcell = mainrow.insertCell();
        mainrow_signcell.classList.add("signcell");
        mainrow_signcell.appendChild(document.createTextNode("+"));

        // Add data cells to the row with content
        for (key in po) {
            if (key != 'location' && key != 'source') {
                let mainrow_cell = mainrow.insertCell();
                mainrow_cell.classList.add("mainrowcell");
                let content = po[key];
                if (key == "name")
                    content = content.join(".");
                mainrow_cell.appendChild(document.createTextNode(content));
            }
        }

        // Add a "subrow" to display the po source information
        let subrow = tbdy.insertRow();
        subrow.classList.add("subrow");
        if (!expandPOs)
            subrow.style.display = "none";

        // Add click listener to go-to symbol for the po
        subrow.ondblclick = function () {
            vscode.postMessage({
                command: 'goToSymbol',
                text: tbdy.getElementsByTagName('tr')[subrow.rowIndex - 2].cells[1].innerText
            });
        }

        // The first cell is for the "collapsible sign"
        let subrow_signcell = subrow.insertCell();
        subrow_signcell.classList.add("signcell");

        // The main cell spans the rest of the row being the numbers of headers
        let subrow_cell = subrow.insertCell();
        subrow_cell.colSpan = headers.length;
        subrow_cell.classList.add("subrowcell");

        let source = po['source'];
        // Format the source with newlines and spaces.
        if (source instanceof Array) {
            for (i = 0; i < source.length; i++) {
                let txt = "";
                for (l = 0; l < i; l++)
                    txt += "  ";
                txt += source[i];
                subrow_cell.appendChild(document.createTextNode(txt + "\n"));
            }
        }
        // Add string formatted by server instead.
        else
            subrow_cell.appendChild(document.createTextNode(source));
    }
}

function sortTable(header) {
    vscode.postMessage({
        command: 'sort',
        text: header
    });
}

function handleToggleExpandPOs() {
    expandPOs = expandPOs ? false : true;
    let tbdyRows = document.getElementById("posbody").getElementsByTagName('tr');

    if (expandPOs) {
        expandBtn.textContent = "Collapse all proof obligations"
        for (let row of tbdyRows) {
            if (row.classList.contains("subrow")) {
                let signcell = tbdyRows[row.rowIndex - 2].cells[0];
                signcell.innerText = "-";
                row.style.display = "table-row";
            }
        }
    }
    else {
        expandBtn.textContent = "Expand all proof obligations"
        for (let row of tbdyRows) {
            if (row.classList.contains("subrow")) {
                let signcell = tbdyRows[row.rowIndex - 2].cells[0];
                signcell.innerText = "+";
                row.style.display = "none";
            }
        }
    }
}

function handleFilterPOs() {
    if (!filteringPOs) {
        vscode.postMessage({
            command: 'filterPOs'
        });
    }
    else {
        vscode.postMessage({
            command: 'filterPOsDisable'
        });
    }
}

function updateFilterBtn(active) {
    filteringPOs = active

    if (filteringPOs)
        filterBtn.textContent = "Disable status filter"
    else
        filterBtn.textContent = "Filter by status"
}

function buildPOView(json) {
    let poContainer = document.getElementById('poContainer');

    // Clear the container
    poContainer.innerHTML = "";

    if (json.length < 1) {
        filterBtn.disabled = true;
        expandBtn.disabled = true;
        return;
    }

    filterBtn.disabled = false;
    expandBtn.disabled = false;

    buildTable(json, poContainer);

    filterBtn.onclick = function () {
        handleFilterPOs();
    }

    expandBtn.onclick = function () {
        handleToggleExpandPOs();
    }
}

function displayInvalidText(showText) {
    let txt = document.getElementById("posInvalid");
    if (showText)
        txt.style.display = 'initial';
    else
        txt.style.display = 'none';

}

window.addEventListener('message', event => {
    switch (event.data.command) {
        case 'newPOs':
            buildPOView(event.data.pos);
            displayInvalidText(false);
            break;
        case 'rebuildPOview':
            buildPOView(event.data.pos);
            break;
        case 'posInvalid':
            displayInvalidText(true);
            break;
        case 'updateFilterBtn':
            updateFilterBtn(event.data.active)
    }
});