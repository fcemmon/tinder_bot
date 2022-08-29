const puppeteer = require("puppeteer-core");
const GoLogin = require("gologin");

(async () => {
  const GL = new GoLogin({
    token:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2MTBlNTYyZjU0OTRhOTliNmVkNGJiZDUiLCJ0eXBlIjoiZGV2Iiwiand0aWQiOiI2Mjc0NDI2MWZiNTdlZmMyNDMyMDgxZTMifQ.dAD_3NmUnp7rhlerc0sWi5zIzlOgglDUc8Q7d7AXrzg",
    profile_id: "6281354d6d1cd3542429468e",
    skipOrbitaHashChecking: true,
  });

  const { status, wsUrl } = await GL.start().catch((e) => {
    console.trace(e);
    return { status: "failure" };
  });

  if (status !== "success") {
    console.log("Invalid status");
    return;
  }

  const browser = await puppeteer.connect({
    browserWSEndpoint: wsUrl.toString(),
    ignoreHTTPSErrors: true,
  });

  const page = await browser.newPage();
  await page.goto("https://myip.link/mini");
  console.log(await page.content());
  await browser.close();
  await GL.stop();
})();
