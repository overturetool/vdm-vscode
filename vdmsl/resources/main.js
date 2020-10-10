const vscode = acquireVsCodeApi();

function buildTable(json, poContainer)
{
    // Access the DOM to get the table construct and add to it.
    poContainer.innerHTML = "";
    let table = document.createElement('table');
    poContainer.appendChild(table);

    // Build the headers
    let headers = Object.keys(json[0]).filter(k => k.indexOf("source") == -1 && k.indexOf("location") == -1 && k.indexOf("group") == -1);
    let thead = table.createTHead();
    let headerRow = thead.insertRow();

    // Cell for the "collapsible sign" present in the table body
    let th = document.createElement("th");
    th.appendChild(document.createTextNode(""));

    headerRow.appendChild(th);
    for (let key of headers) {
        let th = document.createElement("th");
        th.appendChild(document.createTextNode(key));
        headerRow.appendChild(th);
    }

    // Build the rows
    let tbdy = document.createElement("tbody");
    table.appendChild(tbdy);
    for (let element of json) {
        let mainrow = tbdy.insertRow();
        mainrow.classList.add("mainrow");

        //click listener for expanding sub row
        mainrow.onclick = function() {
            let subrow = tbdy.getElementsByTagName('tr')[mainrow.rowIndex];
            subrow.style.display = subrow.style.display === "none" ? "table-row" : "none"; 

            let signcell = tbdy.getElementsByTagName('tr')[mainrow.rowIndex - 1].cells[0];
            signcell.innerText = signcell.innerText === "+" ? "-" : "+";     
        }

        //click listener for go to
        mainrow.ondblclick = function() {
            vscode.postMessage({
                command: 'poid',
                text: tbdy.getElementsByTagName('tr')[mainrow.rowIndex - 1].cells[1].innerText
            });
        }

        // Add cell for "collapsible sign" as the first cell in the row
        let signcell_mainrow = mainrow.insertCell();
        signcell_mainrow.classList.add("signcell");
        signcell_mainrow.appendChild(document.createTextNode("+"));

        for (key in element) {
            if (key != 'location' && key != 'source')
            {
                let cell_mainrow = mainrow.insertCell();
                cell_mainrow.classList.add("mainrowcell"); 
                cell_mainrow.appendChild(document.createTextNode(element[key]));
            }
        }
        
        // Add a "subrow" to display the source information
        let subrow = tbdy.insertRow();
        subrow.classList.add("subrow");
        subrow.style.display = "none";

        //click listener for go to
        subrow.ondblclick = function() {
            console.log(tbdy.getElementsByTagName('tr'));
            console.log(subrow.rowIndex);
            vscode.postMessage({
                command: 'poid',
                text: tbdy.getElementsByTagName('tr')[subrow.rowIndex - 2].cells[1].innerText
            });
        }
        
        // The first cell is for the "collapsible sign"
        let signcell_subrow = subrow.insertCell();
        signcell_subrow.classList.add("signcell");

        // The main cell spans the rest of the row being the numbers of headers
        let cell_subrow = subrow.insertCell();
        cell_subrow.colSpan = headers.length;
        cell_subrow.classList.add("subrowcell");
        cell_subrow.appendChild(document.createTextNode(element['source']));
    }
}

function addToPOTree(poElement, map)
{
    let groupings = poElement.grouping;

    let groupElement = poElement.grouping[0];

    if(groupings.length == 1)
    {
        if(!map.has(groupElement))
        {
            map.set(groupElement, [poElement]);
        }
        else
        {
            map.get(groupElement).push(poElement);               
        } 
        return map;
    }
    else
    {
        poElement.grouping.shift();
        if(!map.has(groupElement))
        {
            map.set(groupElement, addToPOTree(poElement,new Map()));
        }
        else
        {
            map.set(groupElement, addToPOTree(poElement, map.get(groupElement)));               
        } 
    }      
    
    return map;
}

function buildPOView(json)
{
    let poContainer = document.getElementById('poContainer');

    // Creates tree-like map structure for groupings of pos
    let poTreeMap = new Map();
    let nonGroupedPos = [];
    for (let po of Object(json))
    {
        if(typeof po.grouping === 'undefined' || po.grouping.length < 1)
        {
            nonGroupedPos.push(po);
        }
        else
        {
            poTreeMap = addToPOTree(po,poTreeMap);
        }
    }

    if(nonGroupedPos.length > 0)
    {
        buildTable(nonGroupedPos, poContainer);
    }


}

window.addEventListener('message', event => {
    switch (event.data.command) {
        case 'po':
            buildPOView(event.data.text);
            return;      
    }
});