const { spawn, exec, spawnSync, execSync } = require("child_process");
const { getJobIds } = require("./db");

exports.runJobs = async () => {
  const processJobs = async () => {
    try {
      const jobIds =await getJobIds();
      if (jobIds && jobIds.length > 0) {
        console.log(jobIds.length);
        const child = spawn("ts-node", ["js/src/runJob.ts", `${jobIds[0].id}`, `--debug`], {
          shell: true,
          detached: true,
          // stdio: "ignore",
        });
        await sleep(60 * 1000);
      } else {
        await sleep(2 * 1000);
      }
    } catch(e) {
      console.log(e)
      await sleep(10 * 1000)
    }
    await processJobs();
  }

  await processJobs();
};

const sleep = async (millis) => {
  return new Promise((resolve) => setTimeout(resolve, millis));
};