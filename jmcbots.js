var JmcBotsConfig = {
  // Directory where this lib is located, relative to jmc.exe dir
  libPath: "settings\\jmcbots",
  // Directory where runtime files will be created, relative to jmc.exe dir
  // Should exist and be writable
  runPath: "run"
};

if (typeof JmcBots !== "object") {
    JmcBots = {
      MODE: {
        MASTER: 1,
        SLAVE: 2
      }
    };
}

(function() {

  // ------ <Init>

  var fso = null,
    initialized = false;

  fso = new ActiveXObject("Scripting.FileSystemObject");

  // ------- </Init>

  // Private functions 

  function include(filename) {
    var stream = null,
      file = "";

    stream = fso.OpenTextFile(filename, 1 /* ForReading */);
    if (!stream) {
      return false;
    }

    file = stream.ReadAll();
    stream.close();

    if (!file) {
      return;
    }

    jmc.Eval(file);
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

  function findOtherBots() {
    // List directory and find "*.alive"
    // Try to open handle for writing, do not create new
    //   if opened - close and delete alive and cmdlock and TELL
    //   if failed - good handle, open for reading, save data and TELL
    //   check if I am a master and somebody else is also a master
    //   check if master and save it to master pointer
    // Handle list struct: { num: [handle1, handle2], ... }
  }

  function register(num, mode) {
    // Save mode internally
    // findOtherBots();
    // Create own name (jmc.Profile-num-Random.alive)
    // Open own alivefile 
    //   - if failed, generate new own name
    // Write mode,num there
    // Send all others NEW_BOT message
    // Set initialized flag
    initialized = true;
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

  function tell(msg) {
    // showme msg
    // cmdAll(showme my num:msg (handle))
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

  function onDestroy() {
    // Remove timers
    // Close alivefile
    // Delete alivefile
  }

  // TODO: Check dead handle mechanics

  // Public interface

  JmcBots.register = register;
  JmcBots.cmd = cmd;
  JmcBots.cmdAll = cmdAll;
  JmcBots.tell = tell;
  JmcBots.onInput = onInput;
  JmcBots.onTimer = onTimer;
  JmcBots.onDestroy = onDestroy;

}());
