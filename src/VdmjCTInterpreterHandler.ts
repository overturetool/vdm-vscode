import { CTInterpreterHandler } from "./CTHandler";
import { VdmDapSupport as dapSupport} from "./VdmDapSupport"

export class VdmjCTInterpreterHandler implements CTInterpreterHandler {
    sendToInterpreter(trace: string, test: number){
        let command: string = "runtrace " + trace + " " + test.toString();
        dapSupport.startDebuggerWithCommand(command, true);
    }
}