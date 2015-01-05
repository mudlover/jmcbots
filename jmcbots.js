var JmcBotsConfig = {
  // Directory where runtime files will be created, relative to jmc.exe dir
  // Should exist and be writable
  runPath: "run"
};

if (typeof JmcBots !== "object") {
    JmcBots = {
      ROLE: {
        MASTER: 1,
        SLAVE: 2
      }
    };
}

(function() {

  // ------ <Init>

  var fso = null,
    inTell = false,
    initialized = false,
    botNum = 0,
    botRole = -1,
    botName = "",
    aliveName = "",
    aliveFile = "";

  fso = new ActiveXObject("Scripting.FileSystemObject");

  // ------- </Init>

  // Private functions 

  function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function register(num, role) {
    var aliveFileCreationTriesLeft = 0;

    if (num < 0) {
      tell("Num is less then 0: " + num);
      return false;
    }
    botNum = num;

    if (role != JmcBots.ROLE.MASTER && role != JmcBots.ROLE.SLAVE) {
      tell("Role doesn't belong to JmcBots.ROLE set:  " + role);
      return false;
    }
    botRole = role;

    if (!fso.FolderExists(JmcBotsConfig.runPath)) {
      tell("JmcBots run directory doesn't exist: " + JmcBotsConfig.runPath);
      return false;
    }

    for (aliveFileCreationTriesLeft = 5; aliveFileCreationTriesLeft > 0; aliveFileCreationTriesLeft -= 1) {
      botName = jmc.Profile + "-" + botNum + "-" + getRandomInt(10, 99);
      aliveName = fso.GetAbsolutePathName(JmcBotsConfig.runPath + "\\" + botName + ".alive");

      try {
        aliveFile = fso.OpenTextFile(aliveName, 2 /* ForWriting */, true /* iocreate */);
        } catch(e) {
        tell("Couldn't create alive file: " + aliveName + " (msg: " + e.message + ", errno: " + e.number + ")");
      }
      if (aliveFile) {
        break;
      }
      tell("Couldn't create alive file " + aliveName);
    }

    if (aliveFileCreationTriesLeft < 1) {
      tell("Couldn't create alive file, giving up");
      return false;
    }
    // Write mode,num there

    findOtherBots();
    initialized = true;
    return true;
  }

  function findOtherBots() {
    // List directory and find "*.alive"
    // Try to open handle for writing, do not create new
    //   if opened - close and delete alive and cmdlock and TELL
    //   if failed - good handle, open for reading, save data and TELL
    //   check if I am a master and somebody else is also a master
    //   check if master and save it to master pointer
    // Handle list struct: { num: [handle1, handle2], ... }
  }

  function processCommandFile() {
    // Open cmdlock for writing
    //   - if failed - TELL, quit and wait for next tick
    // Open cmdfile for reading
    // Read all strings from cmdfile
    // Close cmdfile
    // Close cmdlock
    // Tell/report to master if more than 1 strings found 
    // Process all strings:
    // Calculate time from last successfull process, TELL it
    // Warn if too much time passed from the last time
    // Save current time as last successful
  }

  function processCommand() {
      // split by , to type, text
      // swit
      // NEW_BOT:
      //   findOtherBots()
      // SEND_TO_MUD:
      //   Parse    
  }

  function cmd(botNum, cmd) {
    // foreach handle in handles[botNum]:
    //   - try to open their lockfile for writing
    //     - if failed, TELL and retry a lot of times with sleep
    //       - if still failure - TELL and exit
    //   - when success, open cmdfile for appending, create ok
    //     - if failed, TELL!!! and quit (this shouldn't be!)
    //   - writeLine botname,time,cmd
    //   - close cmdfile
    //   - close lockfile
  }

  function cmdAll(cmd) {
    // foreach botnums in handles:
    //   - cmd(botNum, cmd)
  }

  function tell(msg, finalTell) {
    jmc.ShowMe(msg);
    if (inTell) {
      // Circuit breaker in case something goes wrong in cmdAll and it will call tell again
      if (!finalTell) {
        tell("Note: breaking circuit by inTell", true);
      }
      inTell = false;
      return;
    }
    inTell = true;
    cmdAll("#showme " + botNum + ":" + msg + " (" + botName + ")");
    inTell = false;
  }

  function onInput(input) {
    var match, botNum;

    if (input.substring(0, 4) === "все ") {
      cmdAll(input.substring(4));
      return true;
    } 

    match = input.match(/^\d+[^\d ]/);
    if (match) {
      botNum = parseInt(match, 10);
      cmd(botNum, input);
      return true;
    }

    return false;
  }

  function onTimer() {
    if (!initialized) {
      return;
    }

    findOtherBots();
    processCommandFile();
  }

  function onUnload() {
    if (aliveFile) {
      try {
        aliveFile.close();
      } catch(e) {
        tell("Couldn't close alive file: " + aliveName + " (msg: " + e.message + ", errno: " + e.number + ")");
      }

      try {
        rc = fso.DeleteFile(aliveName);
      } catch(e) {
        tell("Couldn't delete alive file: " + aliveName + " (msg: " + e.message + ", errno: " + e.number + ")");
      }
    }
  }

  // TODO: Check dead handle mechanics

  // Public interface

  JmcBots.register = register;
  JmcBots.cmd = cmd;
  JmcBots.cmdAll = cmdAll;
  JmcBots.tell = tell;
  JmcBots.onInput = onInput;
  JmcBots.onTimer = onTimer;
  JmcBots.onUnload = onUnload;

}());
