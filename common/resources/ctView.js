const vscode = acquireVsCodeApi();

let traces = [];

function buildTable(cts, ctContainer)
{
    //Access the DOM to get the table construct and add to it.
    let table = document.createElement('table');
    table.id = "ctTable";
    ctContainer.appendChild(table);

    //Build the header row
    let headers = ["Test case", "Result"]
    let thead = table.createTHead();
    let headerRow = thead.insertRow();

    //Add the header row cells
    for (let key of headers) {
        let th = document.createElement("th");       
        th.appendChild(document.createTextNode(key));
        headerRow.appendChild(th);
    }

    // Build the data rows 
    let tbdy = document.createElement("tbody");
    tbdy.id = "ctsbody";
    table.appendChild(tbdy);
    for (let ct of cts) {
        let mainrow = tbdy.insertRow();
        mainrow.classList.add("mainrow");

        // Add data cells to the row with content
        for (key in ct) {
            let mainrow_cell = mainrow.insertCell();
            mainrow_cell.classList.add("mainrowcell");
            mainrow_cell.appendChild(document.createTextNode(ct[key]));
        }
    }
}

function buildCTOutline(cts, ctContainer)
{
    let outerOL = document.createElement('ol');
    outerOL.classList.add("outerOL");
    for(i = 0; i < cts.length; i++)
    {
        // Add a list item to outerOL list
        let li_ctSymbol = document.createElement('li');
        outerOL.appendChild(li_ctSymbol);

        // Add a details element to the list item
        let details_ctSymbol = document.createElement('details');
        li_ctSymbol.appendChild(details_ctSymbol);
        details_ctSymbol.firstChild.textContent = cts[i].name;

        // Add a list to the details element 
        let ul_ctSymbol = document.createElement('ul');
        details_ctSymbol.appendChild(ul_ctSymbol);
        let traces = cts[i].traces;

        // Add items to the list in the details element
        for(l = 0; l < traces.length; l++)
        {
            let ul_ctSymbol = document.createElement('ul');
            details_ctSymbol.appendChild(ul_ctSymbol);
            let traces[l]
            for(n = 0; n < )
        }





    }
    outerOL.appendChild
}