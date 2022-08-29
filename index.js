const express = require("express");
const cors = require("cors");
require("dotenv").config();
const cron = require("node-cron");
const { getJobIds } = require("./utils/db");
const { spawn, exec, spawnSync, execSync } = require("child_process");

const startServer = () => {
  const app = express();
  const port = process.env.PORT || 5000;
  app.use(cors());
  let count = 0;
  cron.schedule(
    "* * * * * *",
    () => {
      getJobIds(count).then((jobIds) => {
        console.log("Running a job at 01:00", jobIds);
        if (count > 180) {
          count = 0;
        }
        if (jobIds && jobIds.length > 0) {
          console.log(jobIds.length);
          jobIds.forEach(({ id, delay }, index) => {
            setTimeout(() => {
              console.log(id);
              const child = spawn("ts-node", ["js/src/runJob.ts", `${id}`, `--debug`], {
                shell: true,
                detached: true,
                // stdio: "ignore",
              });
              // const child = exec(`ts-node js/src/runJob.ts ${id} --debug`, (error) => {
              //   console.log(error); // an AbortError
              // });
            }, (index + 1) * 1000);
          });
        }
      });
      count++;
    },
    {
      scheduled: true,
      timezone: "America/Sao_Paulo",
    }
  );

  app.listen(port, () => {
    console.log(`server is running on port:${port}`);
  });
};
startServer();
