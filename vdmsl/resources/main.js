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
        th.classList.add("headerrow");
        th.onclick = function()
        {
            sortTable(th.cellIndex, table);
        }
        //th.onclick = sortTable(th.tabIndex, table);
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
        let mainrow_signcell = mainrow.insertCell();
        mainrow_signcell.classList.add("signcell");
        mainrow_signcell.appendChild(document.createTextNode("+"));

        for (key in element) {
            if (key != 'location' && key != 'source')
            {
                let mainrow_cell = mainrow.insertCell();
                mainrow_cell.classList.add("mainrowcell"); 
                mainrow_cell.appendChild(document.createTextNode(element[key]));
            }
        }
        
        // Add a "subrow" to display the source information
        let subrow = tbdy.insertRow();
        subrow.classList.add("subrow");
        subrow.style.display = "none";

        //click listener for go to
        subrow.ondblclick = function() {
            vscode.postMessage({
                command: 'poid',
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
        subrow_cell.appendChild(document.createTextNode(element['source']));
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

function sortTable(n, table) {
    let elementsToSort = [];
    let rows = table.rows;
    for(l = 1; l < (rows.length - 1); l+=2)
    {
        elementsToSort.push({row: rows[l], value: rows[l].getElementsByTagName("TD")[n].innerHTML});
    }

    if(elementsToSort.length == 0) return;

    let isNum = /^\d+$/.test(elementsToSort[0].value);

    if(isNum)
    {
        elementsToSort.sort(function(a,b){
            return a.value - b.value;
        });
    }
    
    else
    {
        elementsToSort.sort(function(a,b){
            return a.value.localeCompare(b.value);
        });
    }

    for(l = 0; l < elementsToSort.length; l++)
    {
        console.log(elementsToSort[l]);
    }

    let elementsIndex = 0;

    for(i = 1; i < (rows.length - 1); i+=2)
    {
        rows[i]. = elementsToSort[elementsIndex].row;
        elementsIndex++;
    }
    // while (switching) {
    //   // Start by saying: no switching is done:
    //   switching = false;

    //   /* Loop through all table rows (except the
    //   first, which contains table headers): */
    //   for (i = 1; i < (rows.length - 2); i+=2) {
    //     console.log("i: " + i);
    //     // Start by saying there should be no switching:
    //     shouldSwitch = false;
    //     /* Get the two elements you want to compare,
    //     one from current row and one from the next: */
    //     console.log("x row: " + i);
    //     x = rows[i].getElementsByTagName("TD")[n];
    //     console.log("x cell " + x.innerHTML);

    //     console.log("y row: " + (i + 2));
    //     y = rows[i + 2].getElementsByTagName("TD")[n];
    //     console.log("y cell " + y.innerHTML);

    //     /* Check if the two rows should switch place,
    //     based on the direction, asc or desc: */
    //     if (dir == "asc") {
    //       if (x.innerHTML.toLowerCase() > y.innerHTML.toLowerCase()) {
    //         // If so, mark as a switch and break the loop:
    //         shouldSwitch = true;
    //         console.log("asc break");
    //         break;
    //       }
    //     } else if (dir == "desc") {
    //       if (x.innerHTML.toLowerCase() < y.innerHTML.toLowerCase()) {
    //         // If so, mark as a switch and break the loop:
    //         shouldSwitch = true;
    //         console.log("desc break");
    //         break;
    //       }
    //     }
    //   }
    //   if (shouldSwitch) {
    //     /* If a switch has been marked, make the switch
    //     and mark that a switch has been done: */
    //     rows[i].parentNode.insertBefore(rows[i + 2], rows[i]);
    //     switching = true;
    //     // Each time a switch is done, increase this count by 1:
    //     switchcount ++;
    //   } else {
    //     /* If no switching has been done AND the direction is "asc",
    //     set the direction to "desc" and run the while loop again. */
    //     if (switchcount == 0 && dir == "asc") {
    //       dir = "desc";
    //       switching = true;
    //     }
    //   }
    // }
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