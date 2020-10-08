const vscode = acquireVsCodeApi();
let mainCells = [];

function buildTable(json)
{
    // Access the DOM to get the table construct and add to it.
    let table = document.getElementById('table');

    // Build the headers
    let thead = table.createTHead();
    let headerRows = thead.insertRow();  
    for (let key of Object.keys(json[0]).filter(k => k.indexOf("source") == -1)) {
        let th = document.createElement("th");
        let thtext = document.createTextNode(key);
        th.appendChild(thtext);
        headerRows.appendChild(th);
    }       

    // Build the rows
    let tbdy = document.createElement("tbody");
    table.appendChild(tbdy);
    let i = 0;
    for (let element of json) {
        let row = tbdy.insertRow();
        row.classList.add("mainrow");

        for (key in element) {
            if(key == "source")
            {
                let row2 = tbdy.insertRow();
                row2.classList.add("subrow");
                let cell2 = row2.insertCell();
                cell2.colSpan = 3;
                cell2.classList.add("subrowcell");
                cell2.style.display = "none";
                cell2.appendChild(document.createTextNode(element[key]));
            }
            else
            {
                let cell = row.insertCell();
                cell.classList.add("mainrowcell");
                cell.appendChild(document.createTextNode(element[key]));
            }
        }      
    }

    var rows = tbdy.getElementsByTagName('tr');
    for (i = 0; i < rows.length; i++) {
        if(!rows[i].classList.contains("subrow"))
        {
            rows[i].onclick = function() {
                if(this.rowIndex >= rows.length) return;

                let cellx = rows[this.rowIndex].cells[0];
                if (cellx.style.display === "none") 
                {
                    cellx.style.display = "table-cell";
                } 
                else 
                {
                    cellx.style.display = "none";
                }
            }
        }           
    }
}

window.addEventListener('message', event => {
    switch (event.data.command) {
        case 'poh':
            buildTable(event.data.text);
            return;
        case 'po':
            addPOStoTable(event.data.text);
            return;
    }
});