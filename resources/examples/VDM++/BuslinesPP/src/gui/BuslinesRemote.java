package gui;

import com.fujitsu.vdmj.RemoteControl;
import com.fujitsu.vdmj.RemoteInterpreter;


public class BuslinesRemote implements RemoteControl {

	RemoteInterpreter interpreter;
	@Override
	public void run(RemoteInterpreter intrprtr) throws Exception {
	
		interpreter = intrprtr;
		BuslinesControl ctrl = new BuslinesControl(interpreter);

		ctrl.init();
	}
}
