
# Program to convert an xml
# file to json file
 
# import json module and xmltodict
# module provided by python
import json
from os import replace
import xmltodict
import re
from itertools import count
 
 
# open the input xml file and read
# data in form of python dictionary
# using xmltodict module
with open("overtureTemplates.xml") as xml_file:
     
    data_dict = xmltodict.parse(xml_file.read())
    xml_file.close()
    
    sl = {}
    pp = {}
    rt = {}

    # convert templates to vscode snippet format
    for t in data_dict["templates"]["template"]:
        snippet = {}
        snippet["prefix"] = [t["@name"]]
        snippet["body"] = t["#text"]
        snippet["description"] = t["@description"]

        # replace ${cursor} with $0
        snippet["body"] = snippet["body"].replace("${cursor}","$0",1)

        # replace e.g. ${asd} with ${1:asd}
        i = 1
        counter = count(i)
        snippet["body"] = re.sub(r'\${', lambda x: (x.group(0) + str(next(counter)) + ":"), snippet["body"]) 

        # put snippet in correct vdm type
        if "vdmsl" in t["@context"]:
            sl[t["@name"]] = snippet
        elif "vdmpp" in t["@context"]:
            pp[t["@name"]] = snippet
        elif "vdmrt" in t["@context"]:
            rt[t["@name"]] = snippet
        else:
            print("ERROR: Could not find context")
        
    # replace matching keyword to have the same number, e.g.:
    # "class ${1:className}\n\nend ${2:className}" to "class ${1:className}\n\nend ${1:className}"
    for langid in [sl,pp,rt]:
        for key in langid.keys():
            body = langid[key]["body"]
            matches = re.findall(r'\$\{(.*?)\}', body)
            if matches:
                for i in range(0, len(matches)):
                    for j in range(i+1, len(matches)):
                        if (matches[i].split(":",1)[1] == matches[j].split(":",1)[1]):
                            langid[key]["body"] = langid[key]["body"].replace(matches[j],matches[i],1)

    # generate the object using json.dumps()
    # corresponding to json data
    sl_data = json.dumps(sl, indent=2, sort_keys=False)
    pp_data = json.dumps(pp, indent=2, sort_keys=False)
    rt_data = json.dumps(rt, indent=2, sort_keys=False)

    # Write the json data to output
    # json file
    with open("vdmslSnippets.json", "w") as file:
        file.write(sl_data)
        file.close()

    with open("vdmppSnippets.json", "w") as file:
        file.write(pp_data)
        file.close()

    with open("vdmrtSnippets.json", "w") as file:
        file.write(rt_data)
        file.close()

    
