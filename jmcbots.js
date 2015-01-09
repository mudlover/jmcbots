/* jshint enforceall: true, strict: false, nocomma: false, -W100, -W113, -W027, -W126, unused: vars */
/* global _: false, ActiveXObject: false, Enumerator: false, jmc: false */
/* global JmcBots: true, Character: true */

var JmcBotsConfig = {
  // Directory where this files is located, relative to jmc.exe dir
  libDir: "settings\\jmcbots",
  // Directory where runtime files will be created, relative to jmc.exe dir
  // Should exist and be writable
  runPath: "run",
  debug: false,
  windows: {
    botsStatus: 0,
    bots: 2,
    syslog: 3
  },
  statusBars: {
    processIncomingTime: 5
  }
};

// Workaround to grab underscore reference
include(JmcBotsConfig.libDir + "\\underscore.js");
include(JmcBotsConfig.libDir + "\\json2.js");

// TODO: Move to separate file
var aliases = {
  common: {
    "аааа": "все зачитать свиток.возврата;инвентарь",
    "автопомощь": { action: "autoassist" },
    "автореск": { action: "autorescue" },
    "босс": { action: "becomeMaster" }
  },
  cleric: {
    "ли": "колдовать элегкое исцелениеэ",
    "лз": "колдовать элегкое заживлениеэ",
    "си": "колдовать эсерьезное исцелениеэ"
  },
  fighter: {
    "сби": "сбить",
    "гер": "героический",
    "пну": "пнуть",
    "спас": "спасти",
    "пари": "парировать",
    "оглу": "оглушить",
    "драз": "дразнить",
    "подрез": "подреза#ть"
  }, 
  mage: {
    "гру": "колдовать эгорящие рукиэ",
    "шх": "колдовать эшокирующая хваткаэ",
    "лепр": "колдовать эледяное прикосновениеэ"
  },
  archer: {
    "укл": "уклониться",
    "вее": "веерный",
    "мет": "меткий",
    "овы": "оглушающий"
  }
};

var characters = {
  1: { 
    name: "Блейрин",
    className: "cleric",
    role: "master"
  },
  2: {
    name: "Вильде",
    className: "mage",
    role: "slave"
  },
  3: {
    name: "Пратер",
    className: "archer",
    role: "slave"
  },
  4: { 
    name: "Тэлен",
    className: "fighter",
    role: "slave"
  }  
};

var classAliasesMap = {
  "cleric": 1,
  "mage" : 2,
  "archer" : 3,
  "fighter": 4
};

var muds = {
  adan: {
    statusRegex: /^(\[([\d;]+)m)(-?\d+)H\[0m (\[([\d;]+)m)(-?\d+)V\[0m (-?\d+)X (-?\d+)C(( \[([^:]+):(\[([\d;]+)m)([^:]+)\[0m\])?( \[([^:]+):(\[([\d;]+)m)([^:]+)\[0m\])( \[([^:]+):(\[([\d;]+)m)([^:]+)\[0m\]))?( Зап:(\d+:\d+|-))?.*?> $/,
    commands: {
      assist: "помочь",
      rescue: "спасти"
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
      "Вы пока не можете использовать умение",
      "Вы немного попрактиковались в области",
      "Вам, пожалуй, стоит посетить гильдию и потренировать умение"
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
      REPORT: 4,
      NEW_MASTER: 5
    },
    ROLES = {
      MASTER: "master",
      SLAVE: "slave"
    },
    TIMERS = {
      BOTS_DISCOVERY: 1,
      COMMAND_FILES: 2,
      BOTS_STATUS: 3
    },
    statusRegex = null,
    fso = null,
    runPathAbsolute = "",
    initialized = false,
    initializedJmc = false,
    timersIdShift = 0,
    myNum = 0,
    myRole = "",
    myName = "",
    mudName = "",
    meIsMaster = false,
    myAliveFilename = "",
    myAliveFile = "",
    myCommandFiles = {},
    myBots = [],
    botsStatuses = [],
    masterNum = 0,
    lastProcessedTime = 0,
    consequentFailuresToEnumDir = 0,
    myAliases = {};

  fso = new ActiveXObject("Scripting.FileSystemObject");
 
  runPathAbsolute = fso.GetAbsolutePathName(JmcBotsConfig.runPath);
  if (!fso.FolderExists(runPathAbsolute)) {
    showErr("JmcBots run directory doesn't exist: " + JmcBotsConfig.runPath);
    return false;
  }

  // ------- </Init>

  // Private functions 

  function getRandomInt(min, max) {
    var boundaries = max - min + 1;
    return Math.floor(Math.random() * boundaries) + min;
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

  function init(parameters) {
    var mud,
      profile,
      rc;

    if (initialized) {
      onUnload();
      initialized = false;
    }

    showInfo("Initializing JmcBots");

    masterNum = 0;
    profile = jmc.Profile;

    if (parameters.timersIdShift) {
      if (parseInt(parameters.timersIdShift, 10) < 0) {
        showErr("Incorrect timersIdShift passed: " + parameters.num);
        return false;      
      }
      timersIdShift = parameters.timersIdShift;
    }

    if (parameters.num < 1) {
      showErr("Num should be positive: " + parameters.num);
      return false;
    }
    if (!characters[parameters.num]) {
      showErr("No character is set for bot #" + parameters.num);
      return false;
    }
    myNum = parameters.num;

    if (parameters.role !== ROLES.MASTER && parameters.role !== ROLES.SLAVE) {
      showErr("Roles doesn't belong to correct ROLES set: " + parameters.num);
      return false;
    }
    myRole = characters[myNum].role;
    
    if (myRole === ROLES.MASTER) {
      meIsMaster = true;
    }

    if (!parameters.mudName || !muds[parameters.mudName]) {
      showErr("Mud not defined: '" + parameters.mudName + "'");
      return false;
    }
    mudName = parameters.mudName;
    mud = muds[parameters.mudName];
    statusRegex = mud.statusRegex;

    initAliases(myNum);

    Character.init({
      mud: mud,
      num: myNum,
      characters: characters
    });


    discoverBots();
    rc = initFiles(profile, myNum, myRole, characters);
    if (!rc) {
      showErr("Unable to init alive and command files");
      return false;
    }

    showInfo("I am [1;32m" + characters[myNum].name + "[0m in " + mudName + " mud, codename " + myName + ", " + myRole + ")");
    initialized = true;

    initializedJmc = false;
    if (initJmc) {
      initJmc();
    }

    cmdAll(COMMANDS.DISCOVER_BOTS, "discover bots");

    return true;
  }

  function initFiles(profile, botNum, botRole, characters) {
    var triesLeft,
      rcAliveFile,
      rcInitCommandFiles;

    for (triesLeft = 10; triesLeft > 0; triesLeft -= 1) {
      myName = profile + "-" + botNum + "-" + getRandomInt(10, 99);

      rcAliveFile = initAliveFile(myName, botNum, botRole);
      if (!rcAliveFile) {
        continue;
      }

      rcInitCommandFiles = initMyCommandFiles(myName, botNum, characters);
      if (!rcInitCommandFiles) {
        cleanupAliveFile();
        continue;
      }

      break;
    }

    if (triesLeft === 0) {
      showWarn("Out of tries to create alive and command files");
      return false;
    }
    return true;
  }

  function initAliveFile(botName, botNum, botRole) {
    var aliveContents = "";

    myAliveFilename = runPathAbsolute + "\\" + botName + ".alive";

    try {
      myAliveFile = fso.OpenTextFile(myAliveFilename, 2 /* ForWriting */, true /* create */);
    } catch(e) {
      showErr("Caught exception while creating alive file: " + myAliveFilename + " (msg: " + e.message + ", errno: " + e.number + ")");
      return false;
    }

    aliveContents = JSON.stringify({
      name: botName,
      num: botNum,
      role: botRole
    });

    try {
      myAliveFile.WriteLine(aliveContents);
    } catch(e) {
      showErr("Couldn't write info '" + aliveContents + "' to alive file: " + myAliveFilename + " (msg: " + e.message + ", errno: " + e.number + ")");
      cleanupAliveFile();
      return false;
    }

    return true;
  }

  function cleanupAliveFile() {
    if (!myAliveFile) {
      return;
    }

    try {
      myAliveFile.close();
      myAliveFile = false;
    } catch(e) {
      showErr("Caught exception while closing alive file: " + myAliveFilename + " (msg: " + e.message + ", errno: " + e.number + ")");
    }

    try {
      fso.DeleteFile(myAliveFilename);
    } catch(e) {
      showErr("Caught exception while deleting alive file: " + myAliveFilename + " (msg: " + e.message + ", errno: " + e.number + ")");
    }

    return;
  }

  function initMyCommandFiles(botName, botNum, characters) {
    var filename;

    for (var charNum in characters) {
      if (characters.hasOwnProperty(charNum) &&
          parseInt(charNum, 10) !== botNum) {
        filename = runPathAbsolute + "\\" + botName + "." + charNum + ".commandFile";
        myCommandFiles[charNum] = {
          name: filename,
          file: false
        };

        try {
          myCommandFiles[charNum].file = fso.OpenTextFile(filename, 1 /* ForReading */, /*create:*/true);
        } catch(e) {
          showErr("Caught exception while opening commandfile: " + filename + " (msg: " + e.message + ", errno: " + e.number + ")");
          cleanupCommandFiles();
          return false;
        }
      }
    }

    return true;
  }

  function cleanupCommandFiles() {
    for (var filenum in myCommandFiles) {
      if (myCommandFiles.hasOwnProperty(filenum) &&
          myCommandFiles[filenum].file) {
        try {
          myCommandFiles[filenum].file.close();
          myCommandFiles[filenum].file = false;
        } catch(e) {
          showErr("Caught exception while closing commandFile: " + myCommandFiles[filenum].name + " (msg: " + e.message + ", errno: " + e.number + ")");
        }

        try {
          fso.DeleteFile(myCommandFiles[filenum].name);
        } catch(e) {
          if (e.number !== -2146828218) {
            showErr("Caught exception while deleting commandFile: " + myCommandFiles[filenum].name + " (msg: " + e.message + ", errno: " + e.number + ")");
          }
        }
      }
    }

    return;
  }

  function initAliases(botNum) {
    var aliasStr = "";

    myAliases = {};

    _.each(aliases, function(aliasArray, className) {
      _.each(aliasArray, function(aliasAction, aliasName) {
        if (myAliases[aliasName]) {
          showWarn("Alias already defined in class " + myAliases[aliasName].className + ", skipping: " + aliasName);
        } else {
          aliasStr = aliasAction;
          // If this class is handled by some bot and that bot is not us,
          // send alias meaning to that bot
          if (classAliasesMap[className] && classAliasesMap[className] !== botNum) {
            aliasStr = classAliasesMap[className] + aliasStr;
          }

          myAliases[aliasName] = {
            c: className,
            re: new RegExp("^(" + aliasName + ")( .+|\\d+)?$"),
            name: aliasName,
            act: aliasStr
          };
        }   
      });
    });
  }

  function initJmc() {
    jmc.RegisterHandler("Incoming", "JmcBots.onIncoming()");
    jmc.RegisterHandler("Input", "JmcBots.onInput()");
    jmc.RegisterHandler("Unload", "JmcBots.onUnload()");
    jmc.RegisterHandler("Timer", "JmcBots.onTimer()");
    jmc.RegisterHandler("PreTimer", "JmcBots.onPreTimer()");
    jmc.SetTimer(timersIdShift + TIMERS.BOTS_DISCOVERY, 50, 9999);
    jmc.SetTimer(timersIdShift + TIMERS.COMMAND_FILES, 1, 1);
    jmc.SetTimer(timersIdShift + TIMERS.BOTS_STATUS, 1, 9999);
    initializedJmc = true;
  }

  function cleanupJmc() {
    if (!initializedJmc) {
      return false;
    }

    jmc.KillTimer(TIMERS.BOTS_DISCOVERY);
    jmc.KillTimer(TIMERS.COMMAND_FILES);
    jmc.KillTimer(TIMERS.BOTS_STATUS);
    initializedJmc = false;
  }

  function discoverBots() {
    var currentBots = [];

    currentBots = processBotAliveFiles(myNum, myAliveFilename);
    discoverNewBots(currentBots);
    discoverLostBots(currentBots);
  }

  function processBotAliveFiles(myNum, myAliveFilename) {
    var runDir,
      dirEnumerator,
      dirFile,
      currentBots = [],
      bot;

    try {
      runDir = fso.getFolder(runPathAbsolute);
    } catch (e) {
      showErr("Couldn't get run dir from fso: " + runPathAbsolute + " (msg: " + e.message + ", errno: " + e.number + ")");
    }

    dirEnumerator = new Enumerator(runDir.Files);
    for (; !dirEnumerator.atEnd(); dirEnumerator.moveNext()) {
      try {
        dirFile = dirEnumerator.item();
      } catch (e) {
        consequentFailuresToEnumDir += 1;
        if (consequentFailuresToEnumDir > 2) {
          showErr("Too many consequent failures to enum dir: " + consequentFailuresToEnumDir + " (msg: " + e.message + ", errno: " + e.number + ")");
        }
        return false;
      }

      if (dirFile.Name.substring(dirFile.Name.length - 6) !== ".alive") {
        continue;
      }
      if (myAliveFilename === dirFile.Path) {
        continue;
      }

      bot = processBotAliveFile(dirFile.Path);
      if (!bot) {
        continue;
      }
      bot.role = characters[bot.num].role;

      if (currentBots[bot.num]) {
        showInfo("Conflicting bot, perhaps reinited or parallel run #" + bot.num + " (" + bot.name + ")");
      }

      if (bot.num === myNum) {
        showInfo("Found my doppelganger, skipping: #" + bot.num + " (" + bot.name + ")");
        continue;
      }     
      
      currentBots[bot.num] = bot;
    }

    return currentBots;
  }

  function processBotAliveFile(aliveFilename) {
    var isGoodFile,
      file,
      buf,
      bot;

    // If we can open this file for writing - it means
    // no one else is already has it open. Since active bot
    // always holds this file open exclusively, this file
    // must have been left over from some dead bot
    // and thus is bad. To cleanup we delete it. 
    isGoodFile = false;
    try {
      file = fso.OpenTextFile(aliveFilename, 2 /* ForWriting */, false /* create */);
    } catch(e) {
      if (e.number === -2146828218) {
        isGoodFile = true;
      } else {
        showErr("Caught exception while opening other bot's alive file for writing: " + aliveFilename + " (msg: " + e.message + ", errno: " + e.number + ")");
      }
    }

    if (!isGoodFile) {
      showInfo("Removing left over alive and cmd files: " + aliveFilename);
      try {
        file.close();
        fso.DeleteFile(aliveFilename);
        fso.DeleteFile(aliveFilename.substring(0, aliveFilename.length - 6) + ".lock");
        fso.DeleteFile(aliveFilename.substring(0, aliveFilename.length - 6) + ".commands");
      } catch(e) {
        // Hands in the air
      }
      return false;
    }

    try {
      file = fso.OpenTextFile(aliveFilename, 1 /* ForReading */, /*create:*/false);
      buf = file.readLine();
      file.close();
    } catch(e) {
      showErr("Caught exception while getting data from other bot's alive file: " + aliveFilename + " (msg: " + e.message + ", errno: " + e.number + ")");
      return false;
    }

    bot = JSON.parse(buf);
    return bot;
  }

  function discoverNewBots(currentBots) {
    _.each(currentBots, function(bot, botNum) {
      if (!bot) {
        return false;
      }
      if (myBots[botNum] &&
          myBots[botNum].name === bot.name) {
        return false;
      }

      addBot(bot);
    });

  }

  function discoverLostBots(currentBots) {
    _.each(myBots, function(bot, botNum) {
      if (!bot) {
        return false;
      }
      if (currentBots[botNum] &&
          currentBots[botNum].name === bot.name) {
        return false;
      }

      loseBot(bot);
    });
  }

  function addBot(bot) {
    var commandFilename,
      commandFile;

    if (myBots[bot.num]) {
      loseBot(myBots[bot.num]);
    }

    if (bot.role === ROLES.MASTER) {
      if (masterNum && masterNum !== bot.num) {
        showWarn("Found new master #" + bot.num);
      }
      masterNum = bot.num;
    }

    commandFilename = runPathAbsolute + "\\" + bot.name + "." + myNum + ".commandFile";
    try {
      commandFile = fso.OpenTextFile(commandFilename, 8 /* ForAppending */, /*create:*/false);
    } catch(e) {
      showErr("Caught exception while opening other bot commandFile: " + commandFilename + " (msg: " + e.message + ", errno: " + e.number + ")");
      return false;
    }
    bot.commandFilename = commandFilename;
    bot.commandFile = commandFile;

    showInfo("Found bot #" + bot.num + ": " + characters[bot.num].name + " (" + bot.name + ")");
    myBots[bot.num] = bot;
  }

  function loseBot(bot) {
    if (!bot) {
      return false;
    }

    try {
      bot.commandFile.close();
      fso.DeleteFile(bot.commandFilename);
    } catch(e) {
      if (e.number !== -2146828218) {
        showErr("Caught exception while cleaning up other bot commandFile: " + bot.commandFilename + " (msg: " + e.message + ", errno: " + e.number + ")");
      }
      // NB! Not returning
    }

    showInfo("Lost bot #" + bot.num + ": " + characters[bot.num].name + " (" + bot.name + ")");
    myBots[bot.num] = null;
  }

  function cleanupBots() {
    _.each(myBots, loseBot);
  }

  function processCommandFile() {
    var start = 0,
      finish = 0,
      processingDuration = 0,
      processToProcessTime = 0,
      totalCommandsCount = 0;

    start = new Date().getTime();

    _.reduce(myCommandFiles, processBotCommandFile, totalCommandsCount);

    finish = new Date().getTime();
    processingDuration = finish - start;
    processToProcessTime = finish - lastProcessedTime;
    lastProcessedTime = finish;
  }

  function processBotCommandFile(totalCommandsCount, commandFile) {
    var buf,
      now,
      command,
      commandsCount = 0;

    while (!commandFile.file.AtEndOfStream) {
      try {
        buf = commandFile.file.ReadLine();
      } catch(e) {
        showErr("Caught exception while reading commandFile: " + commandFile.name + " (msg: " + e.message + ", errno: " + e.number + ")");
      }

      if (!buf.length) {
        continue;
      }

      command = JSON.parse(buf);
      now = new Date().getTime();
      if (JmcBotsConfig.debug && parseInt(command[0], 10) !== COMMANDS.BOT_STATUS) {
        showInfo("(" + command.botName + '|' + command.type + ") " + command.text + " (in " + (now - command.time) + "ms)");
      }

      processCommand(command);
      commandsCount += 1;
    } 

    return totalCommandsCount + commandsCount;
  }    

  function processCommand(command) {
    var buf;

    switch(command.type) {
      case COMMANDS.DISCOVER_BOTS:
        discoverBots();
        break;

      case COMMANDS.BOT_STATUS:
        processBotStatus(command.botNum, command.text);
        break;
      
      case COMMANDS.PARSE:
        buf = command.text.replace(/\\/, "\\\\");
        processInput(buf);
        break;

      case COMMANDS.REPORT:
        buf = characters[command.botNum].name + ": " + command.text;
        jmc.showme(buf);
        jmc.WOutput(JmcBotsConfig.windows.bots, buf);
        break;

      case COMMANDS.NEW_MASTER:
        masterNum = command.text;
        myRole = ROLES.SLAVE;
        meIsMaster = false;
        _.each(characters, function(character, key) {
          characters[key].role = ROLES.MASTER;
        });
        characters[masterNum].role = ROLES.MASTER;
        myBots[masterNum].role = ROLES.MASTER;
        showInfo("Changed master to #" + masterNum);
        break;

      default:
        showErr("Unknown command type: " + command.type);
        break;
    }
  }

  function findReports(incoming, incomingRaw) {
    var i, k,
      mud,
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

  function processInput(input, skipAliases, fromJmc) {
    var rc, 
      match = null, 
      botNum = 0,
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
      rc = _.find(myAliases, function(alias){ 
        return processAlias(alias, input);
      });
      if (rc) {
        if (JmcBotsConfig.debug) {
          showInfo("Matched alias");
        }
        return true;
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
        botNum = myNum;
      }

      if (!characters[botNum]) {
        showWarn("No bot #" + botNum);  
      } else {
        command = input.substring(0, input.length - 1) + " " + characters[botNum].name;
        processInput(command);
      }

      jmc.DropEvent();
      return true;
    }

    if (!fromJmc) {
      jmc.Parse(input.replace(/\\/, "\\\\"));
      return true;
    }
    return false;
  }

  function processAlias(alias, input) {
    var match,
      buf,
      effectiveInput;

// jmc.showme(input + "," + alias.act + ","+alias.name);
    match = alias.re.exec(input);
    if (!match) {
      return false;
    }
// jmc.showme("matched inside alias", match[0]);

    buf = input.slice(match[1].length);
// jmc.showme(input);
    if (typeof alias.act === "string") {
      effectiveInput = alias.act + buf;
      processInput(effectiveInput, /*skipAliases:*/true);
      jmc.DropEvent();
      return true;
    } else if (typeof alias.act === "object") {
      switch(alias.act.action) {
        case "autoassist":
          Character.setAutoassist(buf);
          jmc.DropEvent();
          return true;
          break;
        case "autorescue":
          Character.setAutorescue(buf);
          jmc.DropEvent();
          return true;
          break;
        case "becomeMaster":
          myRole = ROLES.MASTER;
          meIsMaster = true;
          masterNum = 0;
          cmdAll(COMMANDS.NEW_MASTER, myNum);
          jmc.DropEvent();
          return true;
          break;
        default:
          showWarn("Unknown action: " + alias.act.action);
          return false;
          break;
      }
    } else {
      showWarn("Unknown action type: " + typeof alias.act.action);
    }
  }

  function cmd(type, botNum, command, cmdAll) {
    var bot = false,
      commandBuf = null;

    commandBuf = {
      botNum: myNum,
      botName: myName,
      type: type,
      time: new Date().getTime(),
      text: command
    };

    if (botNum === myNum) {
      processCommand(commandBuf);
      return;
    }

    bot = myBots[botNum];
    if (!bot) {
      if (!cmdAll) {
        showWarn("Sending cmd to unregistered bot #" + botNum + ", " + type + "|" + command);
      }
      return false;
    }

    try {
      bot.commandFile.WriteLine(JSON.stringify(commandBuf));
      
      if (!cmdAll && JmcBotsConfig.debug) {
        showInfo("Sent to " + bot.name + ": type " + type + ", " + command);
      }
    } catch(e) {
      showErr("Caught exception while writing command to file: " + bot.commandFilename + " (msg: " + e.message + ", errno: " + e.number + ")");
      return false;
    }
  }

  function cmdAll(type, command) {
    _.each(characters, function(character, characterNum) {
      characterNum = parseInt(characterNum, 10);
      if (characterNum === myNum &&
          type !== COMMANDS.PARSE &&
          type !== COMMANDS.BOT_STATUS) {
        return;
      }
      cmd(type, characterNum, command, /*silent:*/true);
    });

    if (JmcBotsConfig.debug) {
      showInfo("Sent: type " + type + ", '" + command + "'");
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
  }

  function processBotStatus(botNum, status) {
    botsStatuses[botNum] = status;
    Character.processPartyMemberStatus(botNum, status);
    Character.makeDecision();
  }

  function displayBotsStatus() {
    _.each(botsStatuses, function(botStatus, botNum) {
      var statusStr,
        color;

      if (!botStatus) {
        return;
      } 

      statusStr = botStatus.health + "/" + botStatus.vitality + " ";
      color = "";
      if (botStatus.health < 75 || botStatus.vitality < 30) {
        color = "black, b yellow";
      } else if (botStatus.health < 30) {
        color = "bold white, b light red";
      }
      jmc.setStatus(botNum, statusStr, color);
      statusStr = "";
    });
  }

  function structureStatus(statusMatch, characterName) {
    var status = {
      healthColorAnsi: statusMatch[1],
      healthColor: statusMatch[2],
      health: statusMatch[3],
      vitalityColorAnsi: statusMatch[4],
      vitalityColor: statusMatch[5],
      vitality: statusMatch[6],
      tnl: statusMatch[7],
      coins: statusMatch[8],
      inFight: !!statusMatch[9],
      inFightTanking: statusMatch[16] === characterName,
      assisterName: statusMatch[11],
      assisterStatusColorAnsi: statusMatch[12],
      assisterStatusColor: statusMatch[13],
      assisterStatus: statusMatch[14],
      combatantName: statusMatch[16],
      combatantStatusColorAnsi: statusMatch[17],
      combatantStatusColor: statusMatch[18],
      combatantStatus: statusMatch[19],
      adversaryName: statusMatch[21],
      adversaryStatusColorAnsi: statusMatch[22],
      adversaryStatusColor: statusMatch[23],
      adversaryStatus: statusMatch[24],
      memTime: statusMatch[26]
    };

    return status;
  }

  /************************************************************************
   *
   *  Event handlers
   *
   ************************************************************************/

  function onIncoming(incomingRaw) {
    var start = 0,
      finish = 0,
      incoming = '',
      statusMatch = null,
      status = {};

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
      statusMatch = statusRegex.exec(incomingRaw);
    }

    if (statusMatch) {
      status = structureStatus(statusMatch, characters[myNum].name);
      Character.processStatus(myNum, status);
      sendBotStatus(status);
    } else {
      findReports(incoming, incomingRaw);
      Character.processIncoming(incoming, incomingRaw);
    }
    
    finish = new Date().getTime() - start;
    jmc.SetStatus(JmcBotsConfig.statusBars.processIncomingTime, finish + "ms");
  }

  function onInput() {
    processInput(jmc.Event, /*skipAliases:*/false, /*fromJmc:*/true);
  }

  function onTimer() {
    if (!initialized) {
      return;
    }

    switch(parseInt(jmc.Event, 10)) {
      case TIMERS.BOTS_DISCOVERY:
        discoverBots();
        break;
      case TIMERS.COMMAND_FILES:
        processCommandFile();
        break;
      case TIMERS.BOTS_STATUS:
        displayBotsStatus();
        break;
    }
  }

  function onPreTimer() {
    if (!initialized) {
      return;
    }

    switch(parseInt(jmc.Event, 10)) {
      case TIMERS.COMMAND_FILES:
        processCommandFile();
        break;
    }
  }

  function onUnload() {
    if (!initialized) {
      return false;
    }

    cleanupAliveFile();
    cmdAll(COMMANDS.DISCOVER_BOTS, "discover bots");
    cleanupBots();
    cleanupCommandFiles();
    cleanupJmc();
  }

  /************************************************************************
   *
   *  Public helpers
   *
   ************************************************************************/

  function parseWithPrompt(command) {
    var input;

    jmc.Parse("#var __input $INPUT");
    input = jmc.GetVar("__input");
    if (input === "$INPUT") {
      input = "";
    } else {
      command += " " + input;
    }
    processInput(command);
  }

  function status() {
    var i, k;

    if (!initialized) {
      jmc.ShowMe("Not initialized.");
      return false;
    }

    jmc.ShowMe("Bot name: " + myName);
    jmc.ShowMe("Bot role: " + myRole);
    jmc.ShowMe("Master num: " + masterNum);    
    jmc.ShowMe("Character name: " + characters[myNum].name);
    jmc.ShowMe("Bots list:");
    for (i = 0, k = myBots.length; i < k; i++) {
      if (!myBots[i]) {
        continue;
      }
      jmc.ShowMe(i + ": " + JSON.stringify(myBots[i]));
    }
  }

  function benchmark(botNum) {
    var start, 
      finish,
      i, k,
      numCommands = 10000;

      start = new Date().getTime();
      for (i = 0, k = numCommands; i < k; i++) {
        cmd(COMMANDS.PARSE, botNum, "#showme TEST" + i);
      }
      finish = new Date().getTime() - start;

    jmc.ShowMe(numCommands + " in " + finish + "ms (" + (numCommands / finish * 1000).toFixed(2) + " cmd/s)");
  }

  /************************************************************************
   *
   *  Public interface
   *
   ************************************************************************/
  JmcBots.init = init;

  JmcBots.onIncoming = onIncoming;
  JmcBots.onInput = onInput;
  JmcBots.onTimer = onTimer;
  JmcBots.onPreTimer = onPreTimer;
  JmcBots.onUnload = onUnload;

  JmcBots.showErr = showErr;
  JmcBots.showWarn = showWarn;
  JmcBots.showInfo = showInfo;

  JmcBots.processInput = processInput;
  JmcBots.parseWithPrompt = parseWithPrompt;
  JmcBots.status = status;
  JmcBots.benchmark = benchmark;

}());

Character = {};

(function() {

  var mud,
    myNum = 0,
    partyMembers = {},
    me = null,
    autoassistEnabled = jmc.GetVar("__autoassistEnabled"),
    autorescueEnabled = jmc.GetVar("__autorescueEnabled"),
    skillsReg = /^Вы вновь можете использовать умение "([^"]+)"/,
    skillsUsed = {},
    battleLagUntil = 0;

  function init(parameters) {
    if (!parameters.mud) {
      JmcBots.showErr("No mud passed to Character.init");
      return false;
    }
    mud = parameters.mud;

    if (!parameters.num || parameters.num < 1) {
      JmcBots.showErr("Bad num passed to Character.init: " + parameters.num);
      return false;
    }
    myNum = parameters.num;

    if (!parameters.characters) {
      JmcBots.showErr("No characters passed to Character.init");
      return false;
    }

    for (var characterNum in parameters.characters) {
      if (parameters.characters.hasOwnProperty(characterNum)) {
        partyMembers[characterNum] = {
          name: parameters.characters[characterNum].name,
          className: parameters.characters[characterNum].className,
          health: -1,
          vitality: -1,
          tnl: -1,
          coins: -1,
          inFight: false
        };

        if (parseInt(characterNum, 10) === myNum) {
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
      newAutoassistEnabled = !!parseInt(parameters, 10);
    }

    autoassistEnabled = newAutoassistEnabled;
    jmc.ShowMe("Autoassist: " + autoassistEnabled);
    jmc.SetVar("__autoassistEnabled", autoassistEnabled);
  }

  function setAutorescue(parameters) {
    var newAutorescueEnabled = false;

    if (!parameters) {
      newAutorescueEnabled = !autorescueEnabled; 
    } else {
      newAutorescueEnabled = !!parseInt(parameters, 10);
    }

    autorescueEnabled = newAutorescueEnabled;
    jmc.ShowMe("Autorescue: " + autorescueEnabled);
    jmc.SetVar("__autorescueEnabled", autorescueEnabled);
  }

  function processStatus(botNum, status) {
    _.extend(partyMembers[botNum], status);
  }

  function processPartyMemberStatus(botNum, status) {
    processStatus(botNum, status);
  }

  function processIncoming(incoming, incomingRaw) {
    var match;

    match = skillsReg.exec(incoming);
    if (match) {
      skillsUsed[match[1]] = 0;
    }
  }

  function makeDecision() {
    var logic = false,
      rc = false;

    logic = getLogic(me.className);
    if (!logic) {
      JmcBots.showWarn("No logic found for class " + me.className);
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
        return mageLogic;
        break;
      case "archer":
        return archerLogic;
        break;
      case "fighter":
        return fighterLogic;
        break;
    }
  }

  function mageLogic() {
    var rc,
      now = new Date().getTime();

    if (autoassistEnabled &&
        !me.inFight
        ) {
      rc = _.find(partyMembers, function(partyMember, botNum) {
        if (parseInt(botNum, 10) === myNum) {
          return false;
        }
        if (partyMember.inFight  && now > battleLagUntil) {
          if (now > skillsUsed['помочь'] || !skillsUsed['помочь']) {
            JmcBots.processInput(mud.commands.assist + " " + partyMember.name);
            skillsUsed['помочь'] = now + 500;
            battleLagUntil = now + 1000;
            return true;
          }
        }
      });
      if (rc) {
        return true;
      }
    }
  }

  function archerLogic() {
    var rc,
      now = new Date().getTime();

    if (autoassistEnabled &&
        !me.inFight
        ) {
      rc = _.find(partyMembers, function(partyMember, botNum) {
        if (parseInt(botNum, 10) === myNum) {
          return false;
        }
        if (partyMember.inFight) {
          JmcBots.processInput(mud.commands.assist + " " + partyMember.name);
          return true;
        }
      });
      if (rc) {
        return true;
      }
    }

    if (me.inFight && now > battleLagUntil) {
jmc.showme("can use battle skill " + battleLagUntil + " " + JSON.stringify(skillsUsed));
      if (now > skillsUsed['меткий выстрел'] || !skillsUsed['меткий выстрел']) {
        JmcBots.processInput("меткий");
        skillsUsed['меткий выстрел'] = now + 10000;
        battleLagUntil = now + 3000;
      } else if (now > skillsUsed['ядовитый выстрел'] || !skillsUsed['ядовитый выстрел']) {
        JmcBots.processInput("ядовитый");
        skillsUsed['ядовитый выстрел'] = now + 10000;
        battleLagUntil = now + 1500;
      }
    }

    return false;
  }

  function fighterLogic() {
    var rc,
      now = new Date().getTime();

    if (autoassistEnabled &&
        !me.inFight
        ) {
      rc = _.find(partyMembers, function(partyMember, botNum) {
        if (parseInt(botNum, 10) === myNum) {
          return false;
        }
        if (partyMember.inFight  && now > battleLagUntil) {
          if (now > skillsUsed['помочь'] || !skillsUsed['помочь']) {
            JmcBots.processInput(mud.commands.assist + " " + partyMember.name);
            skillsUsed['помочь'] = now + 500;
            battleLagUntil = now + 1000;
            return true;
          }
        }
      });
      if (rc) {
        return true;
      }
    }

    if (autorescueEnabled) {
      rc = _.find(partyMembers, function(partyMember, botNum) {
        if (parseInt(botNum, 10) === myNum) {
          return false;
        }

        if (partyMember.inFight && partyMember.inFightTanking && now > battleLagUntil) {
jmc.showme("can use battle skill " + battleLagUntil + " " + JSON.stringify(skillsUsed));
          if (now > skillsUsed['спасти'] || !skillsUsed['спасти']) {
            JmcBots.processInput(mud.commands.rescue + " " + partyMember.name);
            skillsUsed['спасти'] = now + 6000;
            battleLagUntil = now + 3000;
            return true;
          }
        }
      });
      if (rc) {
        return true;
      }
    }

  }

  Character.init = init;
  Character.setAutoassist = setAutoassist;
  Character.setAutorescue = setAutorescue;
  Character.processStatus = processStatus;
  Character.processPartyMemberStatus = processPartyMemberStatus;
  Character.processIncoming = processIncoming;
  Character.makeDecision = makeDecision;

}());

function include(filename) {
  var fso, 
    file,
    fileContents;

  fso = new ActiveXObject("Scripting.FileSystemObject");

  try {
    file = fso.OpenTextFile(filename, 1 /* ForReading */, /*create:*/false);
    fileContents = file.ReadAll();
  } catch(e) {
    return false;
  } finally {
    file.close();
  }

  /* jshint ignore: start */
  eval(fileContents);
  /* jshint ignore: end */
  return true;
}
