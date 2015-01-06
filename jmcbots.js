var JmcBotsConfig = {
  // Directory where runtime files will be created, relative to jmc.exe dir
  // Should exist and be writable
  runPath: "run",
  windows: {
    groupStatus: 0,
    bots: 2,
    syslog: 3
  }
};

JmcBots = {};

// TODO: Move to separate file
var classAliases = {
  "cleric": {

  },
  "fighter": {
    "сби": "сбить %1",
    "гер": "героический %1",
    "спас": "спасти %1"
  }, 
  "mage": {

  },
  "archer": {

  }
};

var characterClasses = {
  1: "cleric",
  2: "mage",
  3: "archer",
  4: "figher"
};

(function() {

  // <Init>

  var COMMANDS = {
      DISCOVER_BOTS: 1,
      BOT_STATUS: 2,
      PARSE: 3
    },
    ROLES = {
      MASTER: "master",
      SLAVE: "slave"
    },
    trimRegex = /^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g,
    fso = null,
    runPathAbsolute = "",
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
    masterName = "",
    lastProcessedTime = 0,
    lastDiscoveryTime = 0,
    lastBotsStatusUpdate = 0,
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
    var msg = "ERROR: " + str;
    jmc.WOutput(JmcBotsConfig.windows.syslog, msg, "light red");
    jmc.WOutput(JmcBotsConfig.windows.bots, msg, "light red");
    jmc.ShowMe(msg, "light red");
  }

  function showWarn(str) {
    var msg = "WARNING: " + str;
    jmc.WOutput(JmcBotsConfig.windows.syslog, msg, "yellow");
    jmc.ShowMe(msg, "yellow");
  }

  function showInfo(str) {
    jmc.WOutput(JmcBotsConfig.windows.syslog, str);
  }

  function init(num, role, charName, registerHandlers) {
    var aliveFileCreationTriesLeft = 0,
      aliveContent = "";

    if (num < 1) {
      showErr("Num should be positive: " + num);
      return false;
    }
    myNum = num;

    if (role !== ROLES.MASTER && role !== ROLES.SLAVE) {
      showErr("Role doesn't belong to ROLES set:  " + role);
      return false;
    }
    myRole = role;
    
    if (myRole === ROLES.MASTER) {
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

    showInfo("I am " + myName + " ([1;32m" + myCharname + "[0m)" + " (" + myRole + ")");

    discoverBots();
    cmdAll(COMMANDS.DISCOVER_BOTS, "discover bots");
    initialized = true;

    if (registerHandlers) {
      jmc.RegisterHandler("Input", "JmcBots.processInput()");
      jmc.RegisterHandler("Unload", "JmcBots.onUnload()");
      jmc.RegisterHandler("Timer", "JmcBots.onTimer()");
      jmc.RegisterHandler("PreTimer", "JmcBots.onTimer()");
      jmc.SetTimer(1, 1, 1);
    }

    return true;
  }

  function discoverBots() {
    var now = 0,
      newBotsList = [],
      runDir = null,
      goodFile = false,
      fileEnum = null,
      fileObj = null,
      file = null,
      botDataStr = '';
      botData = [],
      botNum = -1;

    now = new Date().getTime();
    if (now - lastDiscoveryTime < 5000) {
      return false;
    }
    lastDiscoveryTime = now;

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

      botNum = botData[1];
      if (newBotsList[botNum]) {
        showWarn("Skipping conflicting bot #" + botNum + " (" + botData[0] + ")")
        continue;
      }

      if (ROLES.MASTER === botData[2]) {
        if (meIsMaster) {
          // showErr("Found another master bot, I am " + myName + ", he is " + botData[0]);
        }
        if (masterNum < 1) {
          showInfo("My master is [1;35m" + botData[0] + "[0m");
        }
        masterNum = botData[1];
        masterName = botData[0];
      }

      newBotsList[botNum] = botData;
    }

    // for (i = 0, k = newBotsList.length; i < k; i++) {
    //   if (!newBotsList[i]) {
    //     continue;
    //   }
    //   if (!botsList[i]) {
    //     for (ii = 0, kk = newBotsList[i].length; ii < kk; ii++) {
    //       showErr("Found bot: " + newBotsList[i][ii].join(", "));
    //       if (ROLES.MASTER === newBotsList[i][ii][2]) {
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

    // if (newBotsList.length > botsList.length) {
    //   showInfo("Found new bots");
    // } else if (newBotsList.length < botsList.length) { 
    //   showWarn("Lost bots");
    // }
    
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
        if (command.length < 4) {
          showErr("Command too short: " + commands[i]);
          continue;
        }

        now = new Date().getTime();
        showInfo("(" + command[1] + '|' + command[0] + ") " + command[3] + " (in " + (now - command[2]) + "ms)");
        
        switch(parseInt(command[0])) {
          case COMMANDS.DISCOVER_BOTS:
            discoverBots(/*force:*/true);
            break;

          case COMMANDS.BOT_STATUS:
            saveBotStatus(command[3]);
            break;
          
          case COMMANDS.PARSE:
            commandStr = command[3].replace(/\\/, "\\\\");
            rc = processInput(commandStr);
            if (!rc) {
              jmc.Parse(commandStr);
            }
            break;

          default:
            showErr("Unknown command type: " + command[0]);
            break;
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

  function processInput(input) {
    var match = null, 
      botNum = 0,
      botCharname = '',
      command = '';

    if (!input) {
      input = jmc.Event;
    }

    if (input.substring(0, 4) === "все ") {
      cmdAll(COMMANDS.PARSE, input.substring(4), true /* include self */);
      jmc.DropEvent();
      return true;
    } 

    match = input.match(/^\d[^\d ]/);
    if (match) {
      command = input.substring(1);

      botNum = parseInt(input, 10);
      if (botNum === myNum) {
        jmc.Parse(command)
      } else {
        cmd(COMMANDS.PARSE, botNum, command);
      }

      jmc.DropEvent();
      return true;
    }

    match = input.match(/[^ ]\d+$/);
    if (match) {
      botNum = parseInt(input.substring(input.length - 1), 10);
      if (botNum === 0) {
        botCharname = myCharname;
      } else {
        bot = botsList[botNum];
        if (bot) {
          botCharname = bot[3];
        }
      }

      if (botCharname) {
        command = input.substring(0, input.length - 1);
        jmc.Parse(command + " " + botCharname);
      } else {
        showWarn("No bot #" + botNum);  
      }

      jmc.DropEvent();
      return true;
    }

    return false;
  }

  function updateBotsStatus() {
    var now = 0,
      i, k;

    now = new Date().getTime();
    if (now - lastBotsStatusUpdate < 500) {
      return false;
    }
    lastBotsStatusUpdate = now;

  }

  function cmd(type, botNum, command, silent) {
    var i, k,
      bot = false,
      lockTriesLeft = 100,
      lockSuccess = false;
      lockFilename = "",
      lockFile = null,
      commandsFilename = "",
      commandsFile = null,
      commandBuf = null;

    bot = botsList[botNum];
    if (!bot) {
      return false;
    }

    lockFilename = runPathAbsolute + "\\" + bot[0] + ".lock";
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
      return false;
    } else if (lockTriesLeft < 20) {
      jmc.ShowMe("Lock tries left: " + lockTriesLeft);
    }

    commandsFilename = runPathAbsolute + "\\" + bot[0] + ".commands";
    try {
      commandsFile = fso.OpenTextFile(commandsFilename, 8 /* ForWriting */, true /* create */);
      commandBuf = [
        type,
        myName,
        new Date().getTime(),
        command
      ];
      commandsFile.WriteLine(commandBuf.join(","));
      
      if (!silent) {
        showInfo("Sent to " + bot[0] + ": " + command);
      }
    } catch(e) {
      showErr("Caught exception while writing commands to file: " + commandsFilename + " (msg: " + e.message + ", errno: " + e.number + ")");        
      return false;
    } finally {
      commandsFile.close();
      lockFile.close();        
    }
  }

  function cmdAll(type, command, includeSelf) {
    var i, k;

    for (i = 0, k = botsList.length; i < k; i++) {
      cmd(type, i, command, /*silent:*/true );
    }

    if (!includeSelf) {
      showInfo("Sent: type " + type + ", '" + command + "'");
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
    cmdAll(COMMANDS.PARSE, "#showme " + myNum + ": " + msg + " (" + myName + ")");
    inTell = false;
  }

  function onTimer() {
    if (!initialized) {
      return;
    }

    discoverBots();
    updateBotsStatus();
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
    var i, k;
    jmc.ShowMe("Bot name: " + myName);
    jmc.ShowMe("Bot role: " + myRole);
    jmc.ShowMe("Character name: " + myCharname);
    jmc.ShowMe("Master name: " + masterName);
    jmc.ShowMe("Bots list:");
    for (i = 0, k = botsList.length; i < k; i++) {
      if (!botsList[i]) {
        continue;
      }
      jmc.ShowMe(i + ": " + botsList[i].join(", "));
    }
  }

  // Public interface

  JmcBots.init = init;
  JmcBots.processInput = processInput;
  JmcBots.onTimer = onTimer;
  JmcBots.onUnload = onUnload;
  JmcBots.status = status;

}());
