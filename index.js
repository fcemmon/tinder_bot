const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { runJobs } = require("./utils/scheduledJob");
const {Window, WindowStates, SWP, AncestorFlags, HWND} = require('win-control');
const { snapshot } = require("process-list");

const showInfo = w => {
  if (!w) {
    console.log('Window not found')
    return
  }

  console.log('pid: ', w.getPid())
  console.log('classname: ', w.getClassName())
}

const checkRunningWindows = async () => {
  const tasks = await snapshot('pid', 'name');
  const filters = tasks.filter(t => t.name.includes("chrome"))
  return filters;
}

const startServer = () => {
  const app = express();
  const port = process.env.PORT || 5000;
  app.use(cors());
  let count = 0;
  let delayCount = 2;
  setInterval(() => {
    checkRunningWindows().then((list) => {
      for (var p of list) {
        try {
          const win = Window.getByPid(p.pid);
          if (win)
            win.setShowStatus(WindowStates.FORCEMINIMIZE)
        } catch (e) {
          console.log(e)
        }
      }
    })
  }, 2000);

  runJobs().then();

  app.listen(port, () => {
    console.log(`server is running on port:${port}`);
  });
};
startServer();
