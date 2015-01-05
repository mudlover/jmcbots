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

  var trimRegex = /^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g,
    fso = null,
    runPathAbsolute = '',
    inTell = false,
    initialized = false,
    myNum = 0,
    myRole = -1,
    myName = "",
    meIsMaster = false,
    aliveName = "",
    aliveFile = "",
    botsList = "",
    masterNum = -1,
    masterName = '',
    lastProcessedTime = 0;

  fso = new ActiveXObject("Scripting.FileSystemObject");
  runPathAbsolute = fso.GetAbsolutePathName(JmcBotsConfig.runPath);

  // ------- </Init>

  // Private functions 

  function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function register(num, role) {
    var aliveFileCreationTriesLeft = 0,
      aliveContent = '';

    if (num < 0) {
      tell("Num is less then 0: " + num);
      return false;
    }
    myNum = num;

    if (role !== JmcBots.ROLE.MASTER && role !== JmcBots.ROLE.SLAVE) {
      tell("Role doesn't belong to JmcBots.ROLE set:  " + role);
      return false;
    }
    myRole = role;
    
    if (myRole === JmcBots.ROLE.MASTER) {
      meIsMaster = true;
    }

    if (!fso.FolderExists(JmcBotsConfig.runPath)) {
      tell("JmcBots run directory doesn't exist: " + JmcBotsConfig.runPath);
      return false;
    }

    for (aliveFileCreationTriesLeft = 5; aliveFileCreationTriesLeft > 0; aliveFileCreationTriesLeft -= 1) {
      myName = jmc.Profile + "-" + myNum + "-" + getRandomInt(10, 99);
      aliveName = fso.GetAbsolutePathName(JmcBotsConfig.runPath + "\\" + myName + ".alive");

      try {
        aliveFile = fso.OpenTextFile(aliveName, 2 /* ForWriting */, true /* iocreate */);
      } catch(e) {
        tell("Caught exception while creating alive file, msg: " + e.message + ", errno: " + e.number);
      }
      if (aliveFile) {
        break;
      }
      tell("Couldn't create alive file, probably in use by other bot: " + aliveName);
    }

    if (aliveFileCreationTriesLeft < 1) {
      tell("Couldn't create alive file, giving up");
      return false;
    }

    aliveContent = myName + "," + myNum + "," + myRole;  
    try {
      aliveFile.WriteLine(aliveContent);
    } catch(e) {
      tell("Couldn't write info '" + aliveContent + "' to alive file: " + aliveName + " (msg: " + e.message + ", errno: " + e.number + ")");
      return false;
    }

    discoverBots();
    initialized = true;
    return true;
  }

  function discoverBots() {
    var newBotsList = [],
      runDir = null,
      goodFile = false,
      fileEnum = null,
      fileObj = null,
      file = null,
      botDataStr = '';
      botData = [],
      botNum = -1;

    try {
      runDir = fso.getFolder(runPathAbsolute);
    } catch (e) {
      tell("Couldn't get run dir from fso: " + runPathAbsolute + " (msg: " + e.message + ", errno: " + e.number + ")");
    }

    fileEnum = new Enumerator(runDir.Files);
    for (; !fileEnum.atEnd(); fileEnum.moveNext()) {
      fileObj = fileEnum.item();

      if (fileObj.Name.substring(fileObj.Name.length - 6) !== ".alive") {
        continue;
      }
      if (aliveName === fileObj.Path) {
        continue;
      }

      // If we can open this file for writing - it means
      // no one else is already has it open. Since active bot
      // always holds this file open exclusively, this file
      // must have been left over from some dead bot
      // and thus is bad. To cleanup we delete it. 
      goodFile = false;
      try {
        file = fso.OpenTextFile(fileObj.Path, 2 /* ForWriting */, false /* iocreate */);
      } catch(e) {
        if (e.number === -2146828218) {
          goodFile = true;
        } else {
          tell("Caught exception while opening other bot's alive file for writing: " + fileObj.Path + " (msg: " + e.message + ", errno: " + e.number + ")");
        }
      }

      if (!goodFile) {
        tell("Removing left over alive and cmd files: " + fileObj.Path);
        try {
          file.close();
          fso.DeleteFile(fileObj.Path);
          fso.DeleteFile(fileObj.Path.substring(0, fileObj.Path.length - 6) + ".cmdlock");
          fso.DeleteFile(fileObj.Path.substring(0, fileObj.Path.length - 6) + ".cmdfile");
        } catch(e) {
          // Hands in the air
        }
        continue;
      }

      try {
        file = fso.OpenTextFile(fileObj.Path, 1 /* ForWriting */, false /* iocreate */);
        botDataStr = file.readLine();
        file.close();
      } catch(e) {
        tell("Caught exception while getting data from other bot's alive file: " + fileObj.Path + " (msg: " + e.message + ", errno: " + e.number + ")");
        continue;
      }

      botData = botDataStr.split(",");
      if (botData.length < 3) {
        tell("Bot data is too short: " + botDataStr);        
        continue;
      }

      if (JmcBots.ROLE.MASTER === parseInt(botData[2])) {
        if (meIsMaster) {
          // tell("Found another master bot, I am " + myName + ", he is " + botData[0]);
        } 
        masterNum = botData[1];
        masterName = botData[0];
      }

      botNum = botData[1];
      if (!newBotsList[botNum]) {
        newBotsList[botNum] = [];
      }

      newBotsList[botNum].push(botData);
    }

    // for (i = 0, k = newBotsList.length; i < k; i++) {
    //   if (!newBotsList[i]) {
    //     continue;
    //   }
    //   if (!botsList[i]) {
    //     for (ii = 0, kk = newBotsList[i].length; ii < kk; ii++) {
    //       tell("Found bot: " + newBotsList[i][ii].join(", "));
    //       if (JmcBots.ROLE.MASTER === parseInt(newBotsList[i][ii][2])) {
    //         if (meIsMaster) {
    //           tell("He is also a master like me, " + myName + "!");
    //         } else {
    //           masterNum = newBotsList[i][ii][1];
    //           masterName = newBotsList[i][ii][0];
    //         }
    //       }
    //     }
    //   } else {
    //     for (ii = 0, )
    //   }
    // }

    if (newBotsList.length > botsList.length) {
      tell("Found new bots");
    } else if (newBotsList.length < botsList.length) { 
      tell("Lost bots");
    }
    
    botsList = newBotsList;
  }

  function processCommandFile() {
    var cmdFileName = "",
      cmdLockName = "",
      cmdFile = null,
      cmdLockFile = null,
      commandsStr = "",
      commands = "",
      command = "", 
      start = 0,
      finish = 0,
      processingDuration = 0,
      processToProcessTime = 0;

    start = new Date().getTime();

    cmdLockFileName = runPathAbsolute + "\\" + myName + ".cmdlock"; 
    try {
      cmdLockFile = fso.OpenTextFile(cmdLockFileName, 2 /* ForWriting */, true /* iocreate */);
    } catch(e) {
      tell("Caught exception while opening my cmdlock: " + cmdLockFileName + " (msg: " + e.message + ", errno: " + e.number + ")");
      return;
    }

    cmdFileName = runPathAbsolute + "\\" + myName + ".cmdfile"; 
    jmc.ShowMe(cmdFileName);
    try {
      cmdFile = fso.OpenTextFile(cmdFileName, 1 /* ForReading */, true /* iocreate */);
      if (!cmdFile.AtEndOfStream) {
        commandsStr = cmdFile.ReadAll();
      }
    } catch(e) {
      tell("Caught exception while reading my cmdfile: " + cmdFileName + " (msg: " + e.message + ", errno: " + e.number + ")");
      return;
    } finally {
      cmdFile.close();
      fso.DeleteFile(cmdFileName);
      cmdLockFile.close();      
    }

    if (commandsStr.length) {
      commandsStr = commandsStr.replace(trimRegex, '');
      commands = commandsStr.split("\n");
      if (commands.length > 1) {
        tell("Read more than one command: " + commands.length);
      }

      var i, k = commands.length;
      for (i = 0; i < k; i++) {
        tell("Cmd: " + commands[i]);
        processCommand(commands[i]);
      }
    }

    finish = new Date().getTime();
    processingDuration = finish - start;
    processToProcessTime = finish - lastProcessedTime;
    // <if too much time passed>
    jmc.SetStatus(5, commands.length + "c/" + processingDuration + "ms/" + processToProcessTime + "ms");
    // </if>
    lastProcessedTime = finish;
  }

  function processCommand() {
      // split by , to type, text
      // swit
      // NEW_BOT:
      //   discoverBots()
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
    jmc.ShowMe("(" + myName + ") " + msg);
    if (inTell) {
      // Circuit breaker in case something goes wrong in cmdAll and it will call tell again
      if (!finalTell) {
        tell("Note: breaking circuit by inTell", true);
      }
      inTell = false;
      return;
    }
    inTell = true;
    cmdAll("#showme " + myNum + ":" + msg + " (" + myName + ")");
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

    discoverBots();
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

  function status() {
    var i, j, k, l;
    jmc.ShowMe("Bot name: " + myName);
    jmc.ShowMe("Bot role: " + myRole);
    jmc.ShowMe("Master name: " + masterName);
    jmc.ShowMe("Bots list:");
    for (i = 0, k = botsList.length; i < k; i++) {
      if (!botsList[i]) {
        continue;
      }
      for (j = 0, l = botsList[i].length; j < l; j++) {
        jmc.ShowMe("- " + botsList[i][j].join(", "));
      }
    }
  }

  // Public interface

  JmcBots.register = register;
  JmcBots.cmd = cmd;
  JmcBots.cmdAll = cmdAll;
  JmcBots.tell = tell;
  JmcBots.onInput = onInput;
  JmcBots.onTimer = onTimer;
  JmcBots.onUnload = onUnload;
  JmcBots.status = status;

}());
