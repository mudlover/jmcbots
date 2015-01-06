var JmcBotsConfig = {
  // Directory where runtime files will be created, relative to jmc.exe dir
  // Should exist and be writable
  runPath: "run"
};

JmcBots = {
  ROLE: {
    MASTER: "master",
    SLAVE: "slave"
  }
};

(function() {

  // ------ <Init>

  var trimRegex = /^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g,
    fso = null,
    runPathAbsolute = '',
    inTell = false,
    initialized = false,
    myNum = 0,
    myRole = "",
    myName = "",
    myCharname = "",
    meIsMaster = false,
    aliveName = "",
    aliveFile = "",
    botsList = "",
    masterNum = -1,
    masterName = '',
    lastProcessedTime = 0,
    lastDiscoveryTime = 0,
    consequentFailuresToLockWhenProcessing = 0;
    consequentFailuresToEnumDir = 0;

  fso = new ActiveXObject("Scripting.FileSystemObject");
  runPathAbsolute = fso.GetAbsolutePathName(JmcBotsConfig.runPath);

  // ------- </Init>

  // Private functions 

  function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function showErr(str) {
    jmc.ShowMe("ERROR: " + str, "light red");
  }

  function showWarn(str) {
    jmc.ShowMe("WARNING: " + str, "yellow");
  }

  function showInfo(str) {
    jmc.ShowMe("Info: " + str);
  }

  function register(num, role, charName, registerHandlers) {
    var aliveFileCreationTriesLeft = 0,
      aliveContent = '';

    if (num < 1) {
      showErr("Num should be positive: " + num);
      return false;
    }
    myNum = num;

    if (role !== JmcBots.ROLE.MASTER && role !== JmcBots.ROLE.SLAVE) {
      showErr("Role doesn't belong to JmcBots.ROLE set:  " + role);
      return false;
    }
    myRole = role;
    
    if (myRole === JmcBots.ROLE.MASTER) {
      meIsMaster = true;
    }

    if (!charName) {
      showErr("Charname is not set");
      return false;      
    }
    myCharname = charName;

    if (!fso.FolderExists(JmcBotsConfig.runPath)) {
      showErr("JmcBots run directory doesn't exist: " + JmcBotsConfig.runPath);
      return false;
    }

    for (aliveFileCreationTriesLeft = 5; aliveFileCreationTriesLeft > 0; aliveFileCreationTriesLeft -= 1) {
      myName = jmc.Profile + "-" + myNum + "-" + getRandomInt(10, 99);
      aliveName = runPathAbsolute + "\\" + myName + ".alive";

      try {
        aliveFile = fso.OpenTextFile(aliveName, 2 /* ForWriting */, true /* create */);
      } catch(e) {
        showErr("Caught exception while creating alive file, msg: " + e.message + ", errno: " + e.number);
      }
      if (aliveFile) {
        break;
      }
      showErr("Couldn't create alive file, probably in use by other bot: " + aliveName);
    }

    if (aliveFileCreationTriesLeft < 1) {
      showErr("Couldn't create alive file, giving up");
      return false;
    }

    aliveContent = myName + "," + myNum + "," + myRole + "," + myCharname;  
    try {
      aliveFile.WriteLine(aliveContent);
    } catch(e) {
      showErr("Couldn't write info '" + aliveContent + "' to alive file: " + aliveName + " (msg: " + e.message + ", errno: " + e.number + ")");
      return false;
    }  

    try {
      fso.DeleteFile(runPathAbsolute + "\\" + myName + ".lock");
      fso.DeleteFile(runPathAbsolute + "\\" + myName + ".commands");
    } catch(e) {
      // Hands in the air
    }

    showInfo("Registered as " + myName + " (" + myCharname + ")" + " (" + myCharname + ")");

    discoverBots();
    cmdAll("#script JmcBots.discoverBots()");
    initialized = true;

    if (registerHandlers) {
      jmc.RegisterHandler("Input", "JmcBots.onInput()");
      jmc.RegisterHandler("Unload", "JmcBots.onUnload()");
      jmc.RegisterHandler("Timer", "JmcBots.onTimer()");
      jmc.RegisterHandler("PreTimer", "JmcBots.onTimer()");
      jmc.SetTimer(1, 1, 1);
    }

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
      showErr("Couldn't get run dir from fso: " + runPathAbsolute + " (msg: " + e.message + ", errno: " + e.number + ")");
    }

    fileEnum = new Enumerator(runDir.Files);
    for (; !fileEnum.atEnd(); fileEnum.moveNext()) {
      try {
        fileObj = fileEnum.item();
      } catch (e) {
        consequentFailuresToEnumDir += 1;
        if (consequentFailuresToEnumDir > 2) {
          showErr("Too many consequent failures to enum dir: " + consequentFailuresToEnumDir + " (msg: " + e.message + ", errno: " + e.number + ")");
        }
        return false;
      }

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
        file = fso.OpenTextFile(fileObj.Path, 2 /* ForWriting */, false /* create */);
      } catch(e) {
        if (e.number === -2146828218) {
          goodFile = true;
        } else {
          showErr("Caught exception while opening other bot's alive file for writing: " + fileObj.Path + " (msg: " + e.message + ", errno: " + e.number + ")");
        }
      }

      if (!goodFile) {
        showInfo("Removing left over alive and cmd files: " + fileObj.Path);
        try {
          file.close();
          fso.DeleteFile(fileObj.Path);
          fso.DeleteFile(fileObj.Path.substring(0, fileObj.Path.length - 6) + ".lock");
          fso.DeleteFile(fileObj.Path.substring(0, fileObj.Path.length - 6) + ".commands");
        } catch(e) {
          // Hands in the air
        }
        continue;
      }

      try {
        file = fso.OpenTextFile(fileObj.Path, 1 /* ForWriting */, false /* create */);
        botDataStr = file.readLine();
        file.close();
      } catch(e) {
        showErr("Caught exception while getting data from other bot's alive file: " + fileObj.Path + " (msg: " + e.message + ", errno: " + e.number + ")");
        continue;
      }

      botData = botDataStr.split(",");
      if (botData.length < 4) {
        showErr("Bot data is too short: " + botDataStr);        
        continue;
      }

      if (JmcBots.ROLE.MASTER === botData[2]) {
        if (meIsMaster) {
          // showErr("Found another master bot, I am " + myName + ", he is " + botData[0]);
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
    //       showErr("Found bot: " + newBotsList[i][ii].join(", "));
    //       if (JmcBots.ROLE.MASTER === newBotsList[i][ii][2]) {
    //         if (meIsMaster) {
    //           showErr("He is also a master like me, " + myName + "!");
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
      showInfo("Found new bots");
    } else if (newBotsList.length < botsList.length) { 
      showWarn("Lost bots");
    }
    
    botsList = newBotsList;
  }

  function processCommandFile() {
    var rc, 
      commandsFilename = "",
      commandsFile = null,
      lockFilename = "",
      lockFile = null,
      commandsStr = "",
      commands = "",
      command = "",
      commandStr = "", 
      start = 0,
      finish = 0,
      now = 0,
      processingDuration = 0,
      processToProcessTime = 0;

    start = new Date().getTime();

    lockFilename = runPathAbsolute + "\\" + myName + ".lock"; 
    try {
      lockFile = fso.OpenTextFile(lockFilename, 2 /* ForWriting */, true /* create */);
    } catch(e) {
      if (e.number === -2146828218) {
        consequentFailuresToLockWhenProcessing += 1;
        if (consequentFailuresToLockWhenProcessing > 2) {
          showErr("Too many consequent failures to lock when processing: " + consequentFailuresToLockWhenProcessing);
        }
        return;
      } else {
        showErr("Caught exception while opening my cmdlock: " + lockFilename + " (msg: " + e.message + ", errno: " + e.number + ")");
        return;
      }
      return;
    }

    consequentFailuresToLockWhenProcessing = 0;

    commandsFilename = runPathAbsolute + "\\" + myName + ".commands"; 
    try {
      commandsFile = fso.OpenTextFile(commandsFilename, 1 /* ForReading */, true /* create */);
      if (!commandsFile.AtEndOfStream) {
        commandsStr = commandsFile.ReadAll();
      }
    } catch(e) {
      showErr("Caught exception while reading my commandsFile: " + commandsFilename + " (msg: " + e.message + ", errno: " + e.number + ")");
      return;
    } finally {
      commandsFile.close();
      fso.DeleteFile(commandsFilename);
      lockFile.close();      
    }

    if (commandsStr.length) {
      commandsStr = commandsStr.replace(trimRegex, '');
      commands = commandsStr.split("\n");
      if (commands.length > 1) {
        jmc.ShowMe("Read more than one command: " + commands.length);
      }

      var i, k = commands.length;
      for (i = 0; i < k; i++) {
        command = commands[i].split(",");
        if (command.length < 3) {
          showErr("Command too short: " + commands[i]);
          continue;
        }

        now = new Date().getTime();
        jmc.ShowMe("From " + command[0] + ": " + command[2] + " (traveled " + (now - command[1]) + "ms)");
        
        commandStr = command[2].replace(/\\/, "\\\\");
        rc = onInput(commandStr);
        if (!rc) {
          jmc.Parse(commandStr);
        }
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

  function cmd(botNum, command, silent) {
    var i, k,
      lockTriesLeft = 100,
      lockSuccess = false;
      lockFilename = "",
      lockFile = null,
      commandsFilename = "",
      commandsFile = null;

    if (!botsList[botNum]) {
      return false;
    }

    for (i = 0, k = botsList[botNum].length; i < k; i++) {
      lockFilename = runPathAbsolute + "\\" + botsList[botNum][i][0] + ".lock";
      lockSuccess = false;
      for (lockTriesLeft = 100; lockTriesLeft > 0; lockTriesLeft -= 1) {
        try {
          lockFile = fso.OpenTextFile(lockFilename, 2 /* ForWriting */, true /* create */);
        } catch(e) {
          if (e.number === -2146828218) {
            continue;
          } else {
            showErr("Caught exception while opening lock file to send command: " + lockFilename + " (msg: " + e.message + ", errno: " + e.number + ")");
            break;
          }
        }

        if (!lockFile) {
          break;
        }

        lockSuccess = true;
        break;
      }

      if (lockTriesLeft === 0 || !lockSuccess) {
        jmc.ShowMe("Failed to lock file to send command: " + lockFilename + ", tries left " + lockTriesLeft);        
        continue;
      } else if (lockTriesLeft < 20) {
        jmc.ShowMe("Lock tries left: " + lockTriesLeft);
      }

      commandsFilename = runPathAbsolute + "\\" + botsList[botNum][i][0] + ".commands";
      try {
        commandsFile = fso.OpenTextFile(commandsFilename, 8 /* ForWriting */, true /* create */);
        commandsFile.WriteLine(myName + "," + (new Date().getTime()) + "," + command);
        
        if (!silent) {
          jmc.ShowMe("Sent to " + botsList[botNum][i][0] + ": " + command);
        }
      } catch(e) {
        showErr("Caught exception while writing commands to file: " + commandsFilename + " (msg: " + e.message + ", errno: " + e.number + ")");        
        continue;
      } finally {
        commandsFile.close();
        lockFile.close();        
      }
    }
  }

  function cmdAll(command, includeSelf) {
    var i, k;

    for (i = 0, k = botsList.length; i < k; i++) {
      if (!botsList[i]) {
        continue;
      }
      cmd(i, command, true /* silent */);
    }

    if (!includeSelf) {
      jmc.ShowMe("Sent: " + command);
    }

    if (includeSelf) {
      // TODO: Deduplicate with processCommandFile func
      jmc.Parse(command.replace(/\\/, "\\\\"));
    }
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
    cmdAll("#showme " + myNum + ": " + msg + " (" + myName + ")");
    inTell = false;
  }

  function onInput(input) {
    var match, 
      botNum,
      botCharname = '';

    if (!input) {
      input = jmc.Event;
    }

    if (input.substring(0, 4) === "все ") {
      cmdAll(input.substring(4), true /* include self */);
      jmc.DropEvent();
      return true;
    } 

    match = input.match(/^\d[^\d ]/);
    if (match) {
      botNum = parseInt(input, 10);
      if (botNum === myNum) {
        showWarn("Not sending command to self");
      } else {
        cmd(botNum, input.substring(1));
      }
      jmc.DropEvent();
      return true;
    }

    match = input.match(/[^ ]\d$/);
    if (match) {
      botNum = parseInt(input.substring(input.length - 1), 10);

      if (botNum === 0) {
        botCharname = myCharname;
      } else {
        bot = botsList[botNum];
        if (bot) {
          botCharname = bot[0][3];        
        }
      }

      if (botCharname) {
        jmc.Parse(input.substring(0, input.length - 1) + " " + botCharname);
      } else {
        showWarn("No bot #" + botNum);  
      }
      jmc.DropEvent();
      return true;
    }

    return false;
  }

  function onTimer() {
    var now;

    if (!initialized) {
      return;
    }

    now = new Date().getTime();
    if (now - lastDiscoveryTime > 5000) {
      lastDiscoveryTime = now;
      discoverBots();
    }
    processCommandFile();
  }

  function onUnload() {
    if (aliveFile) {
      try {
        aliveFile.close();
      } catch(e) {
        showErr("Couldn't close alive file: " + aliveName + " (msg: " + e.message + ", errno: " + e.number + ")");
      }

      try {
        rc = fso.DeleteFile(aliveName);
      } catch(e) {
        showErr("Couldn't delete alive file: " + aliveName + " (msg: " + e.message + ", errno: " + e.number + ")");
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
  JmcBots.discoverBots = discoverBots;
  JmcBots.cmd = cmd;
  JmcBots.cmdAll = cmdAll;
  JmcBots.tell = tell;
  JmcBots.onInput = onInput;
  JmcBots.onTimer = onTimer;
  JmcBots.onUnload = onUnload;
  JmcBots.status = status;

}());
