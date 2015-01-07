var JmcBotsConfig = {
  // Directory where runtime files will be created, relative to jmc.exe dir
  // Should exist and be writable
  runPath: "run",
  windows: {
    botsStatus: 0,
    bots: 2,
    syslog: 3
  },
  statusBars: {
    commandProcessTimes: 5,
    processIncomingTime: 4
  }
};

// TODO: Move to separate file
var commonAliases = [
  ["аааа", "все зачитать свиток.возврата;инвентарь"],
  ["автопомощь", { action: "autoassist" }]
];

var classAliases = {
  "cleric": {
    "ли": "колдовать элегкое исцелениеэ",
    "лз": "колдовать элегкое заживлениеэ"
  },
  "fighter": {
    "сби": "сбить",
    "гер": "героический",
    "пну": "пнуть",
    "спас": "спасти",
    "пари": "парировать",
    "оглу": "оглушить",
    "драз": "дразнить"
  }, 
  "mage": {
    "гру": "колдовать эгорящие рукиэ",
    "шх": "колдовать эшокирующая хваткаэ"
  },
  "archer": {
    "укл": "уклониться",
    "вее": "веерный",
    "мет": "меткий"
  }
};

var characterNames = {
  1: "Блейрин",
  2: "Вильде",
  3: "Пратер",
  4: "Тэлен"
};

var characterClasses = {
  1: "cleric",
  2: "mage",
  3: "archer",
  4: "fighter"
};

var muds = {
  adan: {
    statusRegex: /^(\[([\d;]+)m)(-?\d+)H\[0m (\[([\d;]+)m)(-?\d+)V\[0m (-?\d+)X (-?\d+)C(( \[([^:]+):(\[([\d;]+)m)([^:]+)\[0m\])?( \[([^:]+):(\[([\d;]+)m)([^:]+)\[0m\])( \[([^:]+):(\[([\d;]+)m)([^:]+)\[0m\]))?( Зап:(\d+:\d+|-))?.*?> $/,
    commands: {
      assist: "помочь"
    },
    reportExact: [
      "Вы хотите есть.",
      "Вы хотите пить.",
      "Вы поднялись на уровень!",
      "На этот раз вы ничего здесь не выучили.",
      "Здесь таких нет.",
      "Ох... Вы слишком расслаблены, чтобы сделать это..",
      "Извините, вы не можете сделать этого здесь!",
      "Вы наелись.",
      "Вы больше не чувствуете жажды.",
      "На этот раз вы ничего здесь не выучили.",
      "Вам лучше встать на ноги!",
      "Вы слишком устали."
    ],
    reportStartsWith: [
      "Вы почувствовали себя увереннее в умении",
      "Журнал заданий обновлен:",
      "Журнал заданий обновлен:",
      "Для получения награды Вам необходимо доложить о выполнении задания",
      "Подсказка:",
      "Вы пока не можете использовать умение"
    ],
    reportRegex: [
      /^[а-яА-Яa-zA-Z\- ,.!]+ сказал.? вам:/
    ]
  }
};

JmcBots = {};

(function() {

  // <Init>

  var COMMANDS = {
      DISCOVER_BOTS: 1,
      BOT_STATUS: 2,
      PARSE: 3,
      REPORT: 4
    },
    ROLES = {
      MASTER: "master",
      SLAVE: "slave"
    },
    trimRegex = /^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g,
    statusRegex = null,
    fso = null,
    runPathAbsolute = "",
    inTell = false,
    initialized = false,
    myNum = 0,
    myRole = "",
    myName = "",
    myCharname = "",
    mudName = "",
    meIsMaster = false,
    aliveName = "",
    aliveFile = "",
    botsList = "",
    botsStatuses = [],
    masterNum = -1,
    masterName = "",
    lastProcessedTime = 0,
    lastDiscoveryTime = 0,
    lastBotsStatusUpdate = 0,
    consequentFailuresToLockWhenProcessing = 0;
    consequentFailuresToEnumDir = 0,
    aliases = [];

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

  function init(num, role, mud, registerHandlers) {
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

    myCharname = characterNames[myNum];
    if (!myCharname) {
      showErr("Charname not found for bot #" + myNum);
      return false;
    }

    if (!mud || !muds[mud]) {
      showErr("Mud not defined: '" + mud + "'");
      return false;
    }
    mudName = mud;
    statusRegex = muds[mud].statusRegex;

    initAliases();
    Character.init({
      mud: muds[mud],
      num: myNum,
      name: myCharname,
      className: characterClasses[myNum],
      characters: characterNames
    });

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

    showInfo("I am " + myName + " ([1;32m" + myCharname + "[0m, " + myRole + ", " + mud + ")");

    discoverBots();
    cmdAll(COMMANDS.DISCOVER_BOTS, "discover bots");
    initialized = true;

    if (registerHandlers) {
      jmc.RegisterHandler("Incoming", "JmcBots.onIncoming()");
      jmc.RegisterHandler("Input", "JmcBots.processInput()");
      jmc.RegisterHandler("Unload", "JmcBots.onUnload()");
      jmc.RegisterHandler("Timer", "JmcBots.onTimer()");
      jmc.RegisterHandler("PreTimer", "JmcBots.onTimer()");
      jmc.SetTimer(1, 1, 1);
    }

    return true;
  }

  function initAliases() {
    var i, k, 
      myClass = 0,
      aliasStr = "",
      classesCharacter = {};

    myClass = characterClasses[myNum];

    for (var charNum in characterClasses) {
      if (characterClasses.hasOwnProperty(charNum)) {
        classesCharacter[characterClasses[charNum]] = charNum;
      }
    }

    // Mt. Everest, horizontal view
    for (var className in classesCharacter) {
      if (classesCharacter.hasOwnProperty(className)) {
        if (!classAliases[className]) {
          showInfo("No aliases for class " + className);
        }
        for (var alias in classAliases[className]) {
          if (classAliases[className].hasOwnProperty(alias)) {
            if (aliases[alias]) {
              showWarn("Alias already defined in class " + aliases[alias].c + ", skipping: " + alias);
            } else {
              if (className === myClass) {
                aliasStr = classAliases[className][alias];
              } else {
                aliasStr = classesCharacter[className]  + classAliases[className][alias];
              }
              aliases[alias] = {
                c: className,
                re: new RegExp("^(" + alias + ")( .+|\\d+)?$"),
                act: aliasStr
              }
            }
          }
        }
      }
    }

    for (i = 0, k = commonAliases.length; i < k; i++) {
      if (aliases[commonAliases[i][0]]) {
        showWarn("Alias already defined in class " + aliases[alias].c + ", skipping: " + commonAliases[i][0]);
        continue;
      }
      aliases[commonAliases[i][0]] = {
        c: "common",
        re: new RegExp("^(" + commonAliases[i][0] + ")( .+|\\d+)?$"),
        act: commonAliases[i][1]
      }      
    }
  }

  function discoverBots(force) {
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
    if (!force && (now - lastDiscoveryTime < 5000)) {
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
        showInfo("Conflicting bot, perhaps reinited or parallel run #" + botNum + " (" + botData[0] + ")")
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
        if (consequentFailuresToLockWhenProcessing > 5) {
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
      if (commands.length > 2) {
        showInfo("Read more than one command: " + commands.length);
      }

      var i, k = commands.length;
      for (i = 0; i < k; i++) {
        command = commands[i].split(",");
        if (command.length < 4) {
          showErr("Command too short: " + commands[i]);
          continue;
        }

        now = new Date().getTime();
        if (command[0] != COMMANDS.BOT_STATUS) {
          showInfo("(" + command[2] + '|' + command[0] + ") " + command[4] + " (in " + (now - command[3]) + "ms)");
        }
        
        switch(parseInt(command[0])) {
          case COMMANDS.DISCOVER_BOTS:
            discoverBots(/*force:*/true);
            break;

          case COMMANDS.BOT_STATUS:
            processBotStatus(command[1], command.slice(4));
            break;
          
          case COMMANDS.PARSE:
            commandStr = command[4].replace(/\\/, "\\\\");
            rc = processInput(commandStr);
            if (!rc) {
              jmc.Parse(commandStr);
            }
            break;

          case COMMANDS.REPORT:
            commandStr = command[1] + ": " + command.slice(4).join(",");
            jmc.showme(commandStr);
            jmc.WOutput(JmcBotsConfig.windows.bots, commandStr);
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
    jmc.SetStatus(JmcBotsConfig.statusBars.commandProcessTimes, commands.length + "c/" + processingDuration + "ms/" + processToProcessTime + "ms");
    // </if>
    lastProcessedTime = finish;
  }

  function onIncoming(incomingRaw) {
    var start = 0,
      finish = 0,
      incoming = '',
      match = false,
      status = false;

    if (!initialized) {
      return false;
    }

    start = new Date().getTime();

    if (!incomingRaw) {
      incomingRaw = jmc.Event;
    }

    incoming = incomingRaw.replace(/[^m]+m/g, '');
// incoming = incomingRaw.replace(//g, '');
// jmc.showme(incoming);

    // Little optimization to avoid unneeded regex matching
    if (incoming.slice(-1) === " ") {
      status = statusRegex.exec(incomingRaw);
    }

    if (status) {
      Character.processStatus(myNum, status);
      Character.makeDecision();
      sendBotStatus(status);
    } else {
      findReports(incoming, incomingRaw);
      Character.processIncoming(incoming, incomingRaw);
    }
    
    finish = new Date().getTime() - start;
    // jmc.SetStatus(JmcBotsConfig.statusBars.processIncomingTime, finish + "ms");
  }

  function findReports(incoming, incomingRaw) {
    var i, k,
      buf = '';

    if (!meIsMaster) {
      mud = muds[mudName];

      for (i = 0, k = mud.reportExact.length; i < k; i++) {
        if (incoming === mud.reportExact[i]) {
          report(incoming);
          return true;
        }
      }      

      for (i = 0, k = mud.reportStartsWith.length; i < k; i++) {
        buf = incoming.slice(0, mud.reportStartsWith[i].length);
        if (buf === mud.reportStartsWith[i]) {
          report(incoming);
          return true;
        }
      }      

      for (i = 0, k = mud.reportRegex.length; i < k; i++) {
        if (mud.reportRegex[i].exec(incoming)) {
          report(incoming);
          return true;
        }
      }      
    }

    return false;    
  }

  function processInput(input, skipAliases) {
    var i, k, 
      rc,
      remainder = '',
      effectiveInput = '',
      match = null, 
      botNum = 0,
      botCharname = '',
      command = '';

    if (!initialized) {
      return false;
    }

    if (!input) {
      input = jmc.Event;
    }

    if (input.substring(0, 4) === "все ") {
      cmdAll(COMMANDS.PARSE, input.substring(4), /*includeSelf:*/true);
      jmc.DropEvent();
      return true;
    }

    if (!skipAliases) {
      for (var alias in aliases) {
        if (aliases.hasOwnProperty(alias)) {
          match = aliases[alias].re.exec(input);
          if (match) {
            remainder = input.slice(match[1].length);
            if (typeof aliases[alias].act === "string") {
              effectiveInput = aliases[alias].act + remainder;
              rc = processInput(effectiveInput, /*skipAliases:*/true);
              if (!rc) {
                jmc.Parse(effectiveInput);
              }
              jmc.DropEvent();
              return true;
            } else if (typeof aliases[alias].act === "object") {
              switch(aliases[alias].act.action) {
                case "autoassist":
                  Character.setAutoassist(remainder);
                  jmc.DropEvent();
                  return true;
                  break;
                default:
                  showWarning("Unknown action: " + aliases[alias].act.action);
                  return false;
                  break;
              }
            } else {
              showWarning("Unknown action type: " + typeof aliases[alias].act.action);
            }
          }
        }
      }
    }

    match = input.match(/^\d[^\d ]/);
    if (match) {
      command = input.substring(1);

      botNum = parseInt(input, 10);
      if (botNum === myNum) {
        processInput(command);
      } else {
        cmd(COMMANDS.PARSE, botNum, command);
      }

      jmc.DropEvent();
      return true;
    }

    if (input.search(/[^ \d]\d+$/) !== -1) {
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
        command = input.substring(0, input.length - 1) + " " + botCharname;
        rc = processInput(command);
        if (!rc) {
          jmc.Parse(command);
        }
      } else {
        showWarn("No bot #" + botNum);  
      }

      jmc.DropEvent();
      return true;
    }

    return false;
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
      showWarn("Sending cmd to unregistered bot #" + botNum + ", " + type + "|" + command);
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
      showErr("Failed to lock file to send command: " + lockFilename + ", tries left " + lockTriesLeft);     
      return false;
    } else if (lockTriesLeft < 20) {
      showWarn("Lock tries left: " + lockTriesLeft);
    }

    commandsFilename = runPathAbsolute + "\\" + bot[0] + ".commands";
    try {
      commandsFile = fso.OpenTextFile(commandsFilename, 8 /* ForWriting */, true /* create */);
      commandBuf = [
        type,
        myNum,
        myName,
        new Date().getTime(),
        command
      ];
      commandsFile.WriteLine(commandBuf.join(","));
      
      if (!silent) {
        showInfo("Sent to " + bot[0] + ": type " + type + ", " + command);
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
    var i, k,
      rc;

    for (i = 1, k = botsList.length; i < k; i++) {
      if (botsList[i]) {
        cmd(type, i, command, /*silent:*/true );
      }
    }

    if (!includeSelf) {
      showInfo("Sent: type " + type + ", '" + command + "'");
    }

    if (includeSelf) {
      // TODO: Deduplicate with processCommandFile func
      rc = processInput(command);
      if (!rc) {
        jmc.Parse(command.replace(/\\/, "\\\\"));
      }        
    }
  }

  function report(msg) {
    if (meIsMaster) {
      showWarn("Not reporting to self: " + msg);
      return false;
    }

    if (!masterNum) {
      return false;
    }

    cmd(COMMANDS.REPORT, masterNum, msg);
    return true;
  }

  function sendBotStatus(status) {
    cmdAll(COMMANDS.BOT_STATUS, status);
    // if (meIsMaster) {
    //   processBotStatus(myNum, status);
    // } else if (masterNum) {
    //   cmd(COMMANDS.BOT_STATUS, masterNum, status);
    // }
  }

  function processBotStatus(botNum, status) {
    Character.processPartyMemberStatus(botNum, status);
    botsStatuses[botNum] = status;
  }

  function updateBotsStatus() {
    var now = 0,
      i, k,
      bot,
      botStatus,
      color,
      statusStr = "";

    now = new Date().getTime();
    if (now - lastBotsStatusUpdate < 50) {
      return false;
    }
    lastBotsStatusUpdate = now;

    for (i = 1, k = botsList.length; i < k; i++) {
      if (!botsList[i]) {
        continue;
      }

      bot = botsList[i];
      botStatus = botsStatuses[i];
      if (!botStatus) {
        statusStr += bot[3].slice(0, 1) + ": ?/?" + " ";
      } else {
        statusStr += botStatus[3] + "/" + botStatus[6] + " ";
        // statusStr += bot[3].slice(0, 1) + ": \[1;" + botStatus[2] + "m" + botStatus[3] + "\[0m/\[1;" + botStatus[5] + "m" + botStatus[6] + "\[0m ";
        // jmc.showme((bot[3].slice(0, 1) + ": \[1;" + botStatus[2] + "m" + botStatus[3] + "\[0m/\[1;" + botStatus[5] + "m" + botStatus[6] + "\[0m ").replace(//g, ""));
        // jmc.WOutput(JmcBotsConfig.windows.botsStatus, statusStr);
        color = "";
        if (botStatus[3] < 50 || botStatus[6] < 30) {
          color = "black, b yellow"
        } else if (botStatus[3] < 30) {
          color = "bold white, b light red"
        }
        jmc.setStatus(i, statusStr, color);
        statusStr = "";
      }
    }

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
    if (!initialized) {
      return false;
    }

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

  function runWithInput(command) {
    var input;
    jmc.Parse("#var __input $INPUT");
    input = jmc.GetVar("__input");
    if (input === "$INPUT") {
      input = "";
    }
    processInput(command + " " + input);
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
  JmcBots.onIncoming = onIncoming;
  JmcBots.processInput = processInput;
  JmcBots.runWithInput = runWithInput;
  JmcBots.onTimer = onTimer;
  JmcBots.onUnload = onUnload;
  JmcBots.showErr = showErr;
  JmcBots.showWarn = showWarn;
  JmcBots.showInfo = showInfo;
  JmcBots.status = status;

JmcBots.benchmark = function benchmark() {
  var start, 
    finish,
    i, k,
    numCommands = 10000;

    start = new Date().getTime();
    for (i = 0, k = numCommands; i < k; i++) {
      cmd(COMMANDS.PARSE, 1, "#showme test");
    }
    finish = new Date().getTime() - start;

  jmc.ShowMe(numCommands + " in " + finish + "ms (" + (numCommands / finish).toFixed(2) + " cmd/s)");
};

}());

Character = {};

(function() {

  var mud,
    num = 0,
    name = "";
    className = "",
    partyMembers = {},
    me = null,
    autoassistEnabled = jmc.GetVar("__autoassistEnabled"),
    lastSkillUsageTimes = {};

  function init(parameters) {
    if (!parameters.num || parameters.num < 1) {
      JmcBots.showErr("Bad num passed to Character.init: " + parameters.num);
      return false;
    }
    num = parameters.num;

    if (!parameters.name) {
      JmcBots.showErr("No name passed to Character.init");
      return false;
    }
    name = parameters.name;

    if (!parameters.className) {
      JmcBots.showErr("No classname passed to Character.init");
      return false;
    }
    if (parameters.className !== "cleric" && 
        parameters.className !== "mage" &&
        parameters.className !== "archer" &&
        parameters.className != "fighter") {
      JmcBots.showErr("Unknown classname passed to Character.init: " + parameters.className);
      return false;       
    }
    className = parameters.className;

    if (!parameters.mud) {
      JmcBots.showErr("No mud passed to Character.init");
      return false;
    }
    mud = parameters.mud;

    if (!parameters.characters) {
      JmcBots.showErr("No characters passed to Character.init");
      return false;
    }
    for (var characterNum in parameters.characters) {
      if (parameters.characters.hasOwnProperty(characterNum)) {
        partyMembers[characterNum] = {
          name: parameters.characters[characterNum],
          health: -1,
          vitality: -1,
          tnl: -1,
          coins: -1,
          inFight: false          
        };

        if (characterNum == num) {
          me = partyMembers[characterNum];
        }
      }
    }
  }

  function setAutoassist(parameters) {
    var newAutoassistEnabled = false;

    if (!parameters) {
      newAutoassistEnabled = !autoassistEnabled; 
    } else {
      newAutoassistEnabled = !!parseInt(parameters);
    }

    autoassistEnabled = newAutoassistEnabled;
    jmc.ShowMe("Autoassist: " + autoassistEnabled);
    jmc.SetVar("__autoassistEnabled", autoassistEnabled);
  }

  function processStatus(botNum, status) {
    // statusRegex: /^(\[([\d;]+)m)(-?\d+)H\[0m (\[([\d;]+)m)(-?\d+)V\[0m (-?\d+)X (-?\d+)C(( \[([^:]+):(\[([\d;]+)m)([^:]+)\[0m\])?( \[([^:]+):(\[([\d;]+)m)([^:]+)\[0m\])( \[([^:]+):(\[([\d;]+)m)([^:]+)\[0m\]))?( Зап:(\d+:\d+|-))?.*?> $/,
    partyMembers[botNum].health = status[3];
    partyMembers[botNum].vitality = status[6];
    partyMembers[botNum].tnl = status[7];
    partyMembers[botNum].coins = status[8];
    partyMembers[botNum].inFight = !!status[9];
  }

  function processPartyMemberStatus(botNum, status) {
    processStatus(botNum, status);
  }

  function processIncoming(incoming, incomingRaw) {

  }

  function makeDecision() {
    var logic = false,
      rc = false;

    logic = getLogic(className);
    if (!logic) {
      showWarning("No logic found for class" + className);
      return false;
    }

    rc = logic();
    return rc;
  }

  function getLogic(className) {
    switch(className) {
      case "cleric":
        return function() {};
        break;
      case "mage":
        return function() {};
        break;
      case "archer":
        return archerLogic;
        break;
      case "fighter":
        return function() {};
        break;
    }
  }

  function archerLogic() {
    var rc;

    if (autoassistEnabled
        && !me.inFight
        ) {
      for (var botNum in partyMembers) {
        if (partyMembers.hasOwnProperty(botNum)) {
          if (botNum == me.Num) {
            continue;
          }
          if (partyMembers[botNum].inFight) {
            rc = JmcBots.processInput(mud.commands.assist + " " + partyMembers[botNum].name);
            if (!rc) {
              jmc.Parse(mud.commands.assist + " " + partyMembers[botNum].name)
            }
            return true;
          }
        }
      }

      return false;
    }

    return false;
  }

  Character.init = init;
  Character.setAutoassist = setAutoassist;
  Character.processStatus = processStatus;
  Character.processPartyMemberStatus = processPartyMemberStatus;
  Character.processIncoming = processIncoming;
  Character.makeDecision = makeDecision;

}());
