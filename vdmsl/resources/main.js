const vscode = acquireVsCodeApi();

function buildTable(json)
{
    // Access the DOM to get the table construct and add to it.
    let table = document.getElementById('table');
    table.innerHTML = "";

    // Build the headers
    let thead = table.createTHead();
    let headerRows = thead.insertRow();
    let th = document.createElement("th");
    th.appendChild(document.createTextNode(""));
    headerRows.appendChild(th);  
    for (let key of Object.keys(json[0]).filter(k => k.indexOf("source") == -1 && k.indexOf("location") == -1)) {
        let th = document.createElement("th");
        th.appendChild(document.createTextNode(key));
        headerRows.appendChild(th);
    }       

    // Build the rows
    let tbdy = document.createElement("tbody");
    table.appendChild(tbdy);
    let i = 0;
    for (let element of json) {
        let row1 = tbdy.insertRow();
        row1.classList.add("mainrow");

        let cell = row1.insertCell();
        cell.classList.add("signcell");
        cell.appendChild(document.createTextNode("+"));

        for (key in element) {
            if(key == "source")
            {
                let row2 = tbdy.insertRow();
                row2.classList.add("subrow");
                row2.style.display = "none";

                let cell0 = row2.insertCell();
                cell0.classList.add("signcell");

                let cell1 = row2.insertCell();
                cell1.colSpan = 3;
                cell1.classList.add("subrowcell");
                cell1.appendChild(document.createTextNode(element[key]));
            }
            else if (key != 'location')
            {
                let cell = row1.insertCell();
                cell.classList.add("mainrowcell"); 
                cell.appendChild(document.createTextNode(element[key]));
            }
        }      
    }

    // Add on click listeners to sub rows
    var rows = tbdy.getElementsByTagName('tr');
    for (i = 0; i < rows.length; i++) {
        if(!rows[i].classList.contains("subrow"))
        {
            rows[i].onclick = function() {
                if(this.rowIndex >= rows.length) return;           
          
                let subrow = rows[this.rowIndex];
                subrow.style.display = subrow.style.display === "none" ? "table-row" : "none"; 

                let signcell = rows[this.rowIndex - 1].cells[0];
                signcell.innerText = signcell.innerText === "+" ? "-" : "+";            
            }
            
            rows[i].ondblclick = function() {
                vscode.postMessage({
                    command: 'poid',
                    text: rows[this.rowIndex - 1].cells[1].innerText
                });
            }
        }           
    }
}

window.addEventListener('message', event => {
    switch (event.data.command) {
        case 'po':
            buildTable(event.data.text);
            return;      
    }
});