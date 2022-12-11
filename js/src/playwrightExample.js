const playwright = require('playwright')
const { snapshot } = require("process-list");
const GoLogin = require("gologin");

;(async () => {
  const sleep = async (millis) => {
    return new Promise((resolve) => setTimeout(resolve, millis));
  };
  
  const GL = new GoLogin({
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2MjdlMWZmNTRiODM0NDQzNzMzZDFmZjYiLCJ0eXBlIjoiZGV2Iiwiand0aWQiOiI2MzQ5ZDY3NDEzYWZjOTJhMjI3Mzc3MTAifQ.JSkdeMElwFW2QV6p7K5lyV9IZuCFYc3Vpu5M7fAAeqc',
        profile_id: '6311a424409546439766d916',
    skipOrbitaHashChecking: true,
  });

  const { status, wsUrl } = await GL.start().catch((e) => {
    console.trace(e);
    return { status: "failure" };
  });

  const browser = await playwright.chromium.connectOverCDP(wsUrl);
  // await page.goto('https://danube-webshop.herokuapp.com')
  await sleep(5000)
  const tasks = await snapshot('pid', 'name');
  const filters = tasks.filter( t => t.name.includes('chrome'))
console.log(filters);
  await sleep(100000)
  await browser.close()
})()

