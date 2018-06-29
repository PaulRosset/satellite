const app = require("express")();
const multer = require("multer");
const server = require("http").Server(app);
const io = require("socket.io")(server);
const fs = require("fs");
const path = require("path");
const yargs = require("yargs")
  .option("pluginsDestDir", {
    default: "./.plugins/"
  })
  .option("port", {
    alias: "p",
    default: 8000
  }).argv;
const chalk = require("chalk");
const { exec } = require("child_process");
const yaml = require("js-yaml");
const EventEmitter = require("events");

const pluginsDestPath = path.resolve(yargs.pluginsDestDir);

function createPluginsDir(cb) {
  fs.mkdir(pluginsDestPath, 0755, function(err) {
    if (err) {
      if (err.code == "EEXIST") {
        console.log(chalk.green("Plugins folder already created"));
        cb(null);
      }
      // ignore the error if the folder already exists
      else {
        cb(err);
        console.error(
          chalk.red(
            "Impossible to create plugins dir",
            chalk.red(err.toString())
          )
        );
      } // something else went wrong
    } else {
      console.log(chalk.green("Plugins folder created at " + pluginsDestPath));
      cb(null);
    } // successfully created folder
  });
}

const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, pluginsDestPath);
  },
  filename: function(req, file, cb) {
    if (req.body.pluginName) cb(null, req.body.pluginName);
    else cb(new Error("Wrong pluginName field"));
  }
});

const upload = multer({ storage });

function isValidPluginName(pluginName) {
  return pluginName.split("").reduce((red, c) => {
    if (red === true) return /^[A-Z]|[a-z]|\-|\.$/.test(pluginName);
    else return red;
  }, true);
}

const pluginList = {
  list: {},
  addPlugin(pluginName, commands) {
    this.list = { ...this.list, [pluginName]: { commands } };
    this.emitter.emit("new plugin", { plugins: this.list });
  },
  getCommands() {
    return Object.keys(this.list).reduce(
      (red, pluginName) => [...red, ...this.list[pluginName].commands],
      []
    );
  },
  emitter: new EventEmitter()
};

app.post("/plugins/load", upload.single("plugin"), (req, res) => {
  const pluginName = req.body.pluginName;
  const pluginPath = req.file.path;
  const unzippedPluginPath = path.join(
    pluginsDestPath,
    pluginName.replace(/\.[^/.]+$/, "")
  );
  if (isValidPluginName(pluginName)) {
    exec(
      `rm -rf ${unzippedPluginPath} && unzip ${pluginPath} -d ${unzippedPluginPath}`,
      (err, stdout, stderr) => {
        if (err) {
          console.log(
            chalk.red(`Failed to unzip ${pluginPath} at ${unzippedPluginPath}`)
          );
          console.log(chalk.red(err.toString()));
          res.status(500);
          res.end();
        } else {
          console.log(
            chalk.cyan(`Unzipped ${pluginName} at ${unzippedPluginPath}`)
          );
          const configPath = path.join(
            unzippedPluginPath,
            "features",
            "cli",
            "config.yml"
          );
          try {
            const pluginConfig = yaml.safeLoad(
              fs.readFileSync(`${configPath}`, "utf8")
            );
            pluginList.addPlugin(pluginName, pluginConfig);
            res.send("Ok");
          } catch (e) {
            console.log(
              chalk.red("Impossible to read CLI config: "),
              chalk.red(e.toString())
            );
            res.status(500);
            res.send("Impossible to load CLI config at " + configPath);
          }
        }
      }
    );
  } else {
    res.status(500);
    res.write("Invalid plugin name => " + pluginName);
    res.end();
  }
});

function createSocketCLIUpdater(socket) {
  return function updater() {
    socket.emit("cli-config", {
      commands: pluginList.getCommands()
    });
  };
}

createPluginsDir(err => {
  if (err == null) {
    server.listen(yargs.port);
    console.log(chalk.green(`Listening on port ${yargs.port}...`));
    io.on("connection", function(socket) {
      console.log(
        chalk.cyan(`Connected to client at ${socket.conn.remoteAddress}`)
      );
      const updateCLI = createSocketCLIUpdater(socket);
      updateCLI();

      pluginList.emitter.on("new plugin", updateCLI);
      socket.on("command", function(data) {
        console.log(
          chalk.cyan(
            `Received command "${chalk.yellow(
              data.type
            )}" with args ${JSON.stringify(data.args)}`
          )
        );
      });
      socket.on("disconnect", function() {
        pluginList.emitter.removeListener("new plugin", updateCLI);
        console.log(
          chalk.yellow(
            `Disconnected from client at ${socket.conn.remoteAddress}`
          )
        );
        io.emit("user disconnected");
      });
    });
  }
});