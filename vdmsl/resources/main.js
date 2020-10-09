const vscode = acquireVsCodeApi();

function buildTable(json)
{
    // Access the DOM to get the table construct and add to it.
    let table = document.getElementById('table');
    table.innerHTML = "";

    // Build the headers
    let thead = table.createTHead();
    let headerRow = thead.insertRow();
    let th = document.createElement("th");
    th.appendChild(document.createTextNode(""));
    headerRow.appendChild(th);  
    for (let key of Object.keys(json[0]).filter(k => k.indexOf("source") == -1 && k.indexOf("location") == -1)) {
        let th = document.createElement("th");
        th.appendChild(document.createTextNode(key));
        headerRow.appendChild(th);
    }

    // Build the rows
    for (let element of json) {
        let filename = element['location']['uri'].split(/.*[\/|\\]/)[1].split('.')[0];
        let tbdy = document.getElementById(filename);

        if(tbdy === null)
        {
            let tbdy_upper = document.createElement("tbody");
            table.appendChild(tbdy_upper);

            let filerow = tbdy_upper.insertRow();
            filerow.classList.add("filerow"); 
            filerow.onclick = function() { 
                tbdy.style.display = tbdy.style.display === "none" ? "table-row-group" : "none";  
            }
           
            let cell_filerow = filerow.insertCell();
            cell_filerow.classList.add('locationcell');
            cell_filerow.colSpan = 4;
            cell_filerow.appendChild(document.createTextNode(filename));


            tbdy = document.createElement("tbody");
            table.appendChild(tbdy); 
            tbdy.id = filename;
            tbdy.style.display = "none";
         
        }

        let mainrow = tbdy.insertRow();
        mainrow.classList.add("mainrow");

        //click listener for expanding sub row
        mainrow.onclick = function() {
            let subrow = tbdy.getElementsByTagName('tr')[mainrow.rowIndex - 1];
            subrow.style.display = subrow.style.display === "none" ? "table-row" : "none"; 

            let signcell = tbdy.getElementsByTagName('tr')[mainrow.rowIndex - 2].cells[0];
            signcell.innerText = signcell.innerText === "+" ? "-" : "+";     
        }

        //click listener for go to
        mainrow.ondblclick = function() {
            vscode.postMessage({
                command: 'poid',
                text: tbdy.getElementsByTagName('tr')[mainrow.rowIndex - 2].cells[1].innerText
            });
        }

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
        
        let subrow = tbdy.insertRow();
        subrow.classList.add("subrow");
        subrow.style.display = "none";

        //click listener for go to
        subrow.ondblclick = function() {
            console.log(tbdy.getElementsByTagName('tr'));
            console.log(subrow.rowIndex);
            vscode.postMessage({
                command: 'poid',
                text: tbdy.getElementsByTagName('tr')[subrow.rowIndex - 3].cells[1].innerText
            });
        }

        let signcell_subrow = subrow.insertCell();
        signcell_subrow.classList.add("signcell");

        let cell_subrow = subrow.insertCell();
        cell_subrow.colSpan = 3;
        cell_subrow.classList.add("subrowcell");
        cell_subrow.appendChild(document.createTextNode(element['source']));
    }

    
}

window.addEventListener('message', event => {
    switch (event.data.command) {
        case 'po':
            buildTable(event.data.text);
            return;      
    }
});