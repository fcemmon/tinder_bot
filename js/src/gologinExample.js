const puppeteer = require("puppeteer-core");
const GoLogin = require("gologin");

(async () => {
  const GL = new GoLogin({
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2MjczMzJkMTc5ZTUwYTUyZTIwODI4ODQiLCJ0eXBlIjoiZGV2Iiwiand0aWQiOiI2MzVhYWJjYTY4OTJlZjgzOTZmMDkzZWEifQ.Ktxv-3IfcNWOY8tR9QdEmpypiTLDgkXSaA6k_gqAK9o',
        profile_id: '63367c3b33c0e416f5bd1136',
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
