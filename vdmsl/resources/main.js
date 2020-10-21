const vscode = acquireVsCodeApi();

let hideBtn = document.getElementById('hideProvedPosBtn');

let expandBtn = document.getElementById('expandPOsBtn');

let expandPOs = false;

function buildTable(pos, poContainer)
{
    //Access the DOM to get the table construct and add to it.
    let table = document.createElement('table');
    table.id = "poTable";
    poContainer.appendChild(table);

    //Build the headers
    let headers = Object.keys(pos[0]).filter(k => k.indexOf("source") == -1 && k.indexOf("location") == -1 && k.indexOf("group") == -1);
    let thead = table.createTHead();
    let headerRow = thead.insertRow();

    //Cell for the "collapsible sign" present in the table body
    let th = document.createElement("th");
    th.appendChild(document.createTextNode(""));

    //Build the header row
    headerRow.appendChild(th);
    for (let key of headers) {
        let th = document.createElement("th");

        if(key == 'id' || key == 'kind')
        {
            th.classList.add("clickableheaderrow");
            th.onclick = function()
            {
                sortTable(th.cellIndex, table);
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

        // click listener for expanding sub row
        mainrow.onclick = function() {
            let subrow = tbdy.getElementsByTagName('tr')[mainrow.rowIndex];
            subrow.style.display = subrow.style.display === "none" ? "table-row" : "none"; 

            let signcell = tbdy.getElementsByTagName('tr')[mainrow.rowIndex - 1].cells[0];
            signcell.innerText = signcell.innerText === "+" ? "-" : "+";     
        }

        // click listener for go to
        mainrow.ondblclick = function() {
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
            if (key != 'location' && key != 'source')
            {
                let mainrow_cell = mainrow.insertCell();
                mainrow_cell.classList.add("mainrowcell");              
                mainrow_cell.appendChild(document.createTextNode(po[key]));
            }
        }
        
        // Add a "subrow" to display the po source information
        let subrow = tbdy.insertRow();
        subrow.classList.add("subrow");
        if(!expandPOs)
            subrow.style.display = "none";

        // Add click listener to go-to symbol for the po
        subrow.ondblclick = function() {
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
        if (typeof source == "string[]") {
            for(i = 0; i < source.length - 1; i++)
            {
                let txt = source[i];
                for(l = 0; l < i; l++)
                    txt += " ";
                subrow_cell.appendChild(document.createTextNode(txt + "\n"));
            } 
            subrow_cell.appendChild(document.createTextNode(source[source.length]));
        }
        // Add string formatted by server instead.
        else
            subrow_cell.appendChild(document.createTextNode(source));
    }
}

// function addToPOTree(poElement, map)
// {
//     let groupings = poElement.grouping;
//     let groupElement = poElement.grouping[0];
//     if(groupings.length == 1)
//     {
//         if(!map.has(groupElement))
//         {
//             map.set(groupElement, [poElement]);
//         }
//         else
//         {
//             map.get(groupElement).push(poElement);               
//         } 
//         return map;
//     }
//     else
//     {
//         poElement.grouping.shift();
//         if(!map.has(groupElement))
//         {
//             map.set(groupElement, addToPOTree(poElement,new Map()));
//         }
//         else
//         {
//             map.set(groupElement, addToPOTree(poElement, map.get(groupElement)));               
//         } 
//     }      
    
//     return map;
// }

function sortTable(n, table) {
    vscode.postMessage({
        command: 'sort',
        text: table.rows[0].getElementsByTagName("th")[n].innerHTML
    });  
}

function handleToggleExpandPOs()
{
    expandPOs = expandPOs ? false : true;
    let tbdyRows = document.getElementById("posbody").getElementsByTagName('tr');

    if(expandPOs)
    {
        expandBtn.textContent = "Collapse all proof obligations"
        for (let row of tbdyRows)
            if(row.classList.contains("subrow"))
            {
                let signcell = tbdyRows[row.rowIndex - 2].cells[0];
                signcell.innerText = "-";
                row.style.display = "table-row";     
            }
    }
    else
    {
        expandBtn.textContent = "Expand all proof obligations"
        for (let row of tbdyRows)
            if(row.classList.contains("subrow"))
            {
                let signcell = tbdyRows[row.rowIndex - 2].cells[0];
                signcell.innerText = "+";
                row.style.display = "none";  
            }
          
    }
}

function handleToggleProvedPOs()
{
    vscode.postMessage({
        command: 'toggleDisplayProvedPOs'
    });  
}

function buildPOView(json)
{
    let poContainer = document.getElementById('poContainer');

    // Clear the container
    poContainer.innerHTML = "";

    if(json.length < 1)
    {
        hideBtn.disabled = true;
        expandBtn.disabled = true;
        return;
    }

    hideBtn.disabled = false;
    expandBtn.disabled = false;

    buildTable(json, poContainer);

    hideBtn.onclick = function() {
        vscode.postMessage({
            command: 'toggleDisplayProvedPOs'
        });  
    }
    
    expandBtn.onclick = function() {
        handleToggleExpandPOs();
    }

    // // Creates tree-like map structure for groupings of pos
    // let poTreeMap = new Map();
    // let nonGroupedPos = [];
    // for (let po of Object(json))
    // {
    //     if(typeof po.grouping === 'undefined' || po.grouping.length < 1)
    //     {
    //         nonGroupedPos.push(po);
    //     }
    //     else
    //     {
    //         poTreeMap = addToPOTree(po,poTreeMap);
    //     }
    // }

    // if(nonGroupedPos.length > 0)
    // {
    //     buildTable(nonGroupedPos, poContainer);
    // }
}

function displayInvalidText(showText)
{
    let txt = document.getElementById("posInvalid");
    if(showText)
        txt.style.display = 'initial';
    else
        txt.style.display = 'none';

}

window.addEventListener('message', event => {
    switch (event.data.command) {
        case 'newPOs':
            buildPOView(event.data.pos);
            displayInvalidText(false);
            return;
        case 'rebuildPOview':
            buildPOView(event.data.pos);
            return;
        case 'posInvalid':
            displayInvalidText(true);
            return;
        case 'displayProvedPOsToggled':
            if(event.data.toggleState)
                hideBtn.textContent = "Hide proved proof obligations"
            else
                hideBtn.textContent = "Display proved proof obligations"
            return;
    }
});