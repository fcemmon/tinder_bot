// controls the browser, tinder page, takes actions on the page
import playwright, { Page, Browser } from "playwright";
import fs from "fs";
import GoLogin from "gologin";
import path from "path";
import { tlog, terr, delay, saveJson, waitUntil } from "./utils";

import {
  AccountBannedError,
  AccountLoggedOutError,
  AccountUnderReviewError,
  AgeRestrictedError,
  CaptchaRequiredError,
  IdentityVerificationRequired,
  OutOfLikesError,
  ProfileVerificationError,
  RanOutOfLikesError,
} from "./errors";
import { SwipeJob } from "./swipeJob";

const DEFAULT_TIMEOUT = 0;

export default interface TinderPage {
  page: Page;
  job: SwipeJob;
  GL: GoLogin;
  browser: Browser;
  savedProfile: any;
  browserContext: any;
}

export default class TinderPage {
  options: any;
  lastMatchHref: any;
  desiredURL!: string;
  constructor(job: SwipeJob, options: { profileID: string; apiToken: string }) {
    this.job = job;
    this.options = options;
  }

  async start() {
    let browserOptions = [];
    // if (this.options.disableImages) {
    browserOptions.push("--blink-settings=imagesEnabled=false");
    // }
    // let apiToken =
    //   "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2MjczMzJkMTc5ZTUwYTUyZTIwODI4ODQiLCJ0eXBlIjoiZGV2Iiwiand0aWQiOiI2MmZkN2M0YzYzODJiMTg4Njg0MTM0NjAifQ.phVgL2B0iy3vJde4ku7k0xcZTXXkvxNeJz-HnRIU-VY";
    this.GL = new GoLogin({
      autoUpdateBrowser: false,
      token: this.options.apiToken,
      // token: apiToken,
      profile_id: this.options.profileID,
      extra_params: browserOptions,
    });
    const { status, wsUrl } = await this.GL.start();

    // tlog('starting browser', wsUrl.toString())
    this.browser = await playwright.chromium.connectOverCDP(wsUrl.toString());
    let contexts = this.browser.contexts();
    this.browserContext = contexts[0];
    let context = contexts[0];
    await context.clearCookies();
    let pages = await context.pages();
    const vis_results = await Promise.all(
      pages.map(async (p, index) => {
        // if (pages.length - 1 === index) {
        //   tlog("don't close tinder.com page");
        //   this.page = p;
        //   return;
        // }
        // tlog("closing tinder.com page");
        p.close();
      })
    );
    // await this.page.route("**", (route) => route.continue());
    // await this.page.route("**/*.{png,jpg,jpeg}", (route) => route.abort());
    // this.page.setDefaultNavigationTimeout(DEFAULT_TIMEOUT);
    // this.page.setDefaultTimeout(DEFAULT_TIMEOUT);
  }

  async checkGoldProfile(retry: number = 0) {
    if (!this.savedProfile) {
      try {
        const [response] = await Promise.all([
          this.page.waitForResponse(
            (response) => {
              return response.url().includes("https://api.gotinder.com/v2/profile?") && response.status() === 200;
            },
            { timeout: 30000 }
          ),
        ]);
        retry = retry + 1;
        const resJson = await response.json();
        let parsed = await saveJson(this.job.jobID, JSON.stringify(resJson));
        console.log(parsed);
        if (parsed) {
          this.job.profile = parsed;
          if (!parsed.gold) {
            await this.page.close();
            await this.browserContext.close();
          }
        }
        this.savedProfile = true;
      } catch (error) {
        console.log(this.page.url(), "&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&");
        tlog(`retry: ${retry}`);
        //@ts-ignore
        console.log(error.response, "^^^^^");
        //timeoutError if retry is 0
        //@ts-ignore
        if (retry === 0 && error.name === "TimeoutError") {
          await this.checkGoldProfile(1);
        }
        //check responding
        if (
          !this.savedProfile &&
          retry >= 1 &&
          (this.page.url().includes("/app/recs") || this.page.url().includes("/app/likes-you"))
        ) {
          tlog("Responding gologin");
          await this.page.close();
          await this.browserContext.close();
        }
      }
    }
  }

  async stop() {
    if (this.browser) {
      try {
        tlog("found browser, closing");
        await this.page.close();
        await this.browserContext.close();
        await this.browser.close();
        tlog("done closing browser");
      } catch (e) {
        tlog("failed closing browser ");
      } finally {
        tlog("after closing browser ");
      }
    }

    try {
      tlog("stopping GL");
      await this.GL.stop();
      tlog("done stopping GL");
    } catch (e) {
      tlog("failed GL stop");
    } finally {
      tlog("after GL stop");
    }
  }

  async lastMatch(startIndex: number) {
    let match = await this.page.evaluate((startIndex) => {
      let lMatch = document.querySelector('a.matchListItem[href^="/app/messages"]') as HTMLAnchorElement | null;
      if (!lMatch) {
        return;
      }
      let lastHref = lMatch.href;
      lastHref = lastHref.replace("file://", "");
      lastHref = lastHref.replace("https://tinder.com", "");
      let selector = `a.matchListItem[href="${lastHref}"] span div div`;
      // console.log("looking for selector", selector)
      let node = document.querySelector(selector) as HTMLElement | null;
      let nameByHref;
      if (node) {
        nameByHref = node.innerText;
        // console.log("last match", nameByHref, lastHref)
        return [nameByHref, lastHref];
      }
    }, startIndex);

    if (match != null && this.lastMatchHref != match[1]) {
      this.lastMatchHref = match[1];
      return match;
    } else {
      // tlog("TP: no match found");
      return;
    }
  }

  getURL() {
    return this.page.url();
  }

  // checks
  async checkAndHandleErrors() {
    if (this.options.debug) {
      tlog("check and handle errors called");
    }
    const url = await this.page.url();
    tlog("checkAndHandleErrors: URL", url);
    if (url.includes("app/banned")) {
      throw new AccountBannedError();
    }
    if (url.includes("verify/identity")) {
      throw new IdentityVerificationRequired();
    }
    if (url.includes("verify/challenge")) {
      throw new CaptchaRequiredError();
    }

    await this.checkCaptchaRequired();

    // if (await this.checkActiveTabError()) {
    //   await tlog("handling active tab error");
    //   await this.handleActiveTabError();

    //   tlog("redo check and handle errors");
    //   await this.checkAndHandleErrors();

    //   return true;
    // }
    if (await this.checkAgeRestricted()) {
      throw new AgeRestrictedError();
    }

    if (url == "https://tinder.com/") {
      throw new AccountLoggedOutError();
    }
    await this.handleErrorPopup(); // move to check and handle errors
    await this.checkAccountUnderReview();

    console.log("CHECK UNDER REVIEW HERE");
    await this.checkProfileUnderReview();
    console.log("DONE: CHECK UNDER REVIEW HERE");

    // if (!url.startsWith(this.desiredURL)) {
    //   tlog(`navigated away from desired page to: ${this.desiredURL} -- redirecting.`);
    //   await this.page.goto(this.desiredURL, { waitUntil: "networkidle" });
    //   return;
    // }
    if (await this.checkBoostingUp()) {
      throw new OutOfLikesError();
    }

    tlog("check out of likes");
    if (await this.checkOutOfLikes()) {
      throw new OutOfLikesError();
    }
    // tlog(`current url*****${url}`);
    // if (url.includes("/app/matches")) {
    //   await this.goLikesYouPage();
    // }
  }

  async checkOutOfLikes() {
    let likesPageOutOfLikes = await this.page.evaluate(() => {
      let likesPage = document.querySelector('[data-testid="likesYouScroller"]');
      if (likesPage) {
        return likesPage.innerHTML.includes("your chances");
      }
    });
    return likesPageOutOfLikes;
  }

  async checkBoostingUp() {
    try {
      tlog("checkBoostingUp");
      const element = await this.page.waitForSelector("main", { timeout: 30000 });
      const searchText = await element.innerHTML();
      if (searchText.toString().includes("Increase")) {
        return true;
      }
    } catch (error) {
      console.log(error);
      return true;
    }
  }

  async checkProfileUnderReview() {
    const isUnderReview = await this.page.evaluate(async () => {
      let h3s = document.querySelectorAll<HTMLElement>("h3") as NodeList;
      console.log("check under review", h3s.length);
      let any = false;
      if (h3s != null) {
        h3s.forEach((e) => {
          console.log((e as HTMLElement).innerText);
          if ((e as HTMLElement).innerText.toLowerCase() == "your account is under review") {
            any = true;
          }
        });
      }
      return any;
    });
    console.log("under review?", isUnderReview);
    if (isUnderReview) {
      throw new AccountUnderReviewError();
    }
  }

  async checkAccountUnderReview() {
    const element = await this.page.$('div[data-testid="dialog"] div[data-testid="subtitle-0"] span');
    if (element !== null) {
      const text = await this.page.evaluate((element) => element.textContent, element);
      if (
        text ==
        "You’ve been reported by users too many times. We will be reviewing your account to determine what actions need to be made."
      ) {
        throw new AccountUnderReviewError();
      }
    }
  }

  async checkActiveTabError() {
    const element = await this.page.$("h3");
    if (element !== null) {
      const text = await this.page.evaluate((element) => element.textContent, element);
      if (text) {
        return text.toLowerCase().includes("opened the app in a new tab");
      }
    }
  }

  async checkAgeRestricted() {
    const element = await this.page.$("h3");
    if (element !== null) {
      const text = await this.page.evaluate((element) => element.textContent, element);
      if (text) {
        return text.toLowerCase().includes("age restricted");
      }
    }
  }

  async checkCaptchaRequired() {
    return await this.page.evaluate(() => {
      let el = document.querySelector("p#home_children_body") as HTMLElement | null;
      if (el != null && el.innerText == " Please solve this puzzle so we know you are a real person") {
        throw new CaptchaRequiredError();
      }
    });
  }

  // TODO rec specific
  async navigateToRecsPage(retries: number = 0) {
    tlog("navigating to Recs");
    this.desiredURL = "https://tinder.com/app/recs";
    this.page = await this.browserContext.newPage();
    let pages = this.browserContext.pages();
    const vis_results = await Promise.all(
      pages.map(async (p: any, index: number) => {
        if (pages.length - 1 === index) {
          tlog("don't close tinder.com page");
          this.page = p;
          return;
        }
        tlog("closing tinder.com page");
        p.close();
      })
    );
    await Promise.all([
      this.page.goto(this.desiredURL, { waitUntil: "networkidle", timeout: DEFAULT_TIMEOUT }),
      this.checkGoldProfile(),
      this.page.waitForNavigation({ waitUntil: "networkidle", timeout: DEFAULT_TIMEOUT }),
    ]);
    tlog("Done checking gold profile");
    await this.checkAndHandleErrors();
    tlog("wait for recsCardboard");
    try {
      await this.page.waitForSelector("div.recsCardboard__cards");
    } catch (e) {
      terr("error: navigate to recs page");
      if (retries < 2) {
        tlog("navigation retries", retries);
        await this.checkAndHandleErrors();
        await this.navigateToRecsPage(retries + 1);
      }
    } finally {
      await this.checkAndHandleErrors();
    }
  }

  // likes specific
  async queryLikes() {
    try {
      tlog("start queryLikes");
      let likes = await this.page.waitForSelector("main .Expand nav span", { timeout: 30000 });
      tlog(await likes.innerText());
      let likesNumber = (await likes.innerText()).replace(/[^.\d]/g, "");
      tlog(`likes is ${likesNumber}`);
      const resultNum = likesNumber ? parseInt(likesNumber) : null;
      if (!resultNum || resultNum <= 1) {
        tlog("ran out of likes");
        throw new OutOfLikesError();
      } else {
        tlog("could not read liked by count");
      }
      return resultNum;
    } catch (error) {
      console.log(error);
      return null;
    }
  }

  // likes specific
  async navigateToLikesPage() {
    tlog("navigating to likes-you");
    this.desiredURL = "https://tinder.com/app/likes-you";

    // await this.page.setViewportSize({ width: 1024, height: 768 });
    // await this.page.route(/(\.png$)|(\.jpg$)/, (route) => route.abort());
    this.page = await this.browserContext.newPage();
    let pages = this.browserContext.pages();
    const vis_results = await Promise.all(
      pages.map(async (p: any, index: number) => {
        if (pages.length - 1 === index) {
          tlog("don't close tinder.com page");
          this.page = p;
          return;
        }
        tlog("closing tinder.com page");
        p.close();
      })
    );
    //added
    await this.page.route("**/*.{png,jpg,jpeg,gif,mov, mp4, avi,ogg,swf,webm}", (route) => route.abort());
    this.page.setDefaultNavigationTimeout(DEFAULT_TIMEOUT);
    this.page.setDefaultTimeout(DEFAULT_TIMEOUT);
    ////
    await Promise.all([
      this.page.goto(this.desiredURL, { waitUntil: "networkidle", timeout: DEFAULT_TIMEOUT }),
      this.checkGoldProfile(),
      this.page.waitForNavigation({ waitUntil: "networkidle", timeout: DEFAULT_TIMEOUT }),
    ]);

    tlog("DONE - navigating to likes-you");

    let currentUrl = this.getURL();
    console.log(currentUrl, "**current url**");
    await this.checkAndHandleErrors();
    if (!currentUrl.includes("tinder.com/app/likes-you")) {
      tlog(`tinder.com navigated away from desired page to: ${currentUrl} -- redirecting.`);
      await this.goLikesYouPage();
      await delay(2000);
    }
  }

  async goLikesYouPage() {
    try {
      const matchesTab = await this.page.waitForSelector("div[role=tablist] > div > button", { timeout: 30000 });
      console.log(await matchesTab.innerText(), "^^^^^^^^^^^^^^^^^^^^");
      matchesTab.click();
      const likesItem = await this.page.waitForSelector('a.matchListItem[href^="/app/likes-you"]', {
        timeout: 30000,
      });
      await likesItem.click();
    } catch (error) {
      console.log(error);
      throw new OutOfLikesError();
    }
  }

  // recommended specific
  async waitForGamepadLikes() {
    try {
      tlog("wait for likes button");
      await this.page.waitForFunction(
        () => {
          let hiddenSpans = document.querySelectorAll("span.Hidden");
          let p0 = [...hiddenSpans].filter((x) => (x as HTMLElement).innerText == "LIKE")[0];
          let p1;
          let p2;
          let p3;

          if (p0 != null) {
            p1 = p0.parentElement;
            if (p1 != null) {
              p2 = p1.parentElement;
              if (p2 != null) {
                p3 = p2.parentElement;
                if (p3 != null && p3.getAttribute("aria-disabled") != "true") {
                  return true;
                }
              }
            }
          }

          return false;
        },
        { timeout: 1000 }
      );
    } catch (e) {
      await this.checkAndHandleErrors();

      tlog("catch error waitForFunction likeButton");
      // if the button exists and is disabled throw appropriate error
      let gamepadDisabled = await this.page.evaluate(() => {
        let el = document.querySelectorAll(".recsCardboard__cardsContainer button")[13];
        let disabled;
        if (el) {
          disabled = el.getAttribute("aria-disabled");
        }
        return [!!el, disabled];
      });

      let outOfMatches = await this.page.evaluate(() => {
        let globalEl = document.querySelector('[aria-busy="true"] ~div div') as HTMLElement | null;
        let globalError;
        let runOutPotential;

        if (globalEl) {
          globalError = globalEl.innerText.includes("Go global and see people around the world.");
          runOutPotential = globalEl.innerText.includes("out of potential matches");
        }

        let unableToFindMatches = document.querySelector('[aria-busy="true"] ~div') as HTMLElement | null;
        let unableToMatchError;
        if (unableToFindMatches) {
          unableToMatchError = unableToFindMatches.innerText.includes("find any potential matches");
        }

        let allHtml = document.querySelector(".recsCardboard__cards");
        let allHtmlErr;
        if (allHtml) {
          allHtmlErr =
            allHtml.innerHTML.includes("run out of potential matches") ||
            allHtml.innerHTML.includes("unable to find any potential matches") ||
            allHtml.innerHTML.includes("Go global and see people around the world");
        }

        return globalError || runOutPotential || unableToMatchError || allHtmlErr;
      });

      if (gamepadDisabled[1]) {
        tlog("throw specific error here");
        throw new OutOfLikesError();
      } else if (outOfMatches) {
        tlog("error: Go global and see people around the world.");
        throw new OutOfLikesError();
      } else {
        tlog("throw unhandled timeout error");
        throw e;
      }
    }
  }

  async clickPass() {
    await this.page.waitForFunction(() => {
      let hiddenSpans = document.querySelectorAll("span.Hidden");
      let p1 = [...hiddenSpans].filter((x) => (x as HTMLElement).innerText == "NOPE")[0].parentElement;
      let p2;
      let p3;
      if (p1 != null) {
        p2 = p1.parentElement;
        if (p2 != null) {
          p3 = p2.parentElement;
          if (p3 != null && p3.getAttribute("aria-disabled") != "true") {
            if (p3 != null) {
              p3.click();
              return true;
            }
          }
        }
      }
      return false;
    });
  }

  async clickLike() {
    await this.page.waitForFunction(() => {
      let hiddenSpans = document.querySelectorAll("span.Hidden");
      let p1 = [...hiddenSpans].filter((x) => (x as HTMLElement).innerText == "LIKE")[0].parentElement;
      let p2;
      let p3;
      if (p1 != null) {
        p2 = p1.parentElement;
        if (p2 != null) {
          p3 = p2.parentElement;
          if (p3 != null && p3.getAttribute("aria-disabled") != "true") {
            if (p3 != null) {
              p3.click();
              return true;
            }
          }
        }
      }
      return false;
    });
  }

  // actions
  async handleErrorPopup() {
    const selector = '[data-testid="onboarding__errorTitle"]';
    if ((await this.page.$(selector)) !== null) {
      tlog("detected errorTitle - pressing escape");
      await this.page.keyboard.press("Escape");
    }
  }

  async handleActiveTabError() {
    await this.page.evaluate(() => {
      let el = document.querySelector('button[data-testid="reload"]') as HTMLElement | null;
      if (el != null) {
        el.click();
      }
    });
    await delay(10000);
    // await this.page.waitForNavigation()
  }

  async dragAndDrop() {
    tlog("start drag and drop");
    await this.checkAndHandleErrors();
    tlog("Done checking error on dragAndDrop", this.page.url());
    try {
      const likesYouCard = await this.page.waitForSelector('[data-testid="likesYouCard"] div', { timeout: 3000 });
      let boundingBox;
      console.log("likesYouCard Element");
      // TODO handle null case
      if (likesYouCard) {
        boundingBox = await likesYouCard.boundingBox();
        console.log(boundingBox, "got likeyou");
        if (boundingBox) {
          await this.page.mouse.move(boundingBox.x + boundingBox.width / 2, boundingBox.y + boundingBox.height / 2);
          await this.page.mouse.down();
          await this.page.mouse.move(1000, 19);
          await this.page.mouse.up();
        }
      }

      // wait for card to stop moving
      // await this.page.waitForFunction(
      //   () => {
      //     let el = document.querySelectorAll('[data-testid="likesYouCard"]')[0] as HTMLElement | null;
      //     console.log(el, "fucntion&&&&7");
      //     if (el) {
      //       return el.style.transform == "translate3d(0px, 0px, 0px) rotate(0deg) scale(1, 1)";
      //     }
      //   },
      //   { timeout: 1000 }
      // );
      await delay(800);
    } catch (error) {
      console.log(error);
      return;
    }
  }

  async viewProfile() {
    const page = this.page;
    try {
      await delay(2000);
      console.log("start viewProfile");
      const profileItem = await this.page.$('[data-testid="likesYouCard"] div');
      if (profileItem) {
        await delay(2000);
        await profileItem.click();
        await page.waitForLoadState("domcontentloaded");
      }

      for (let i = 0; i < 3; i++) {
        await delay(2000);
        const profile = await page.$(
          `//div/div[1]/div/main/div[1]/div/div/div[2]/div[2]/div/div[1]/div/div[1]/span/div/div[2]/button[${i + 1}]`
        );
        if (profile) {
          await profile.click();
          await page.waitForLoadState("domcontentloaded");
          if (i === 2) {
            try {
              const likeSwiper = await page.$(
                "//div/div[1]/div/main/div[1]/div/div/div[2]/div[2]/div/div[2]/div/div/div[4]/button"
              );
              await page.waitForLoadState("domcontentloaded");
              await delay(2000);
              if (likeSwiper) {
                await likeSwiper.click();
              }
            } catch (error) {
              console.log(error, "error");
              process.exit();
            }
          }
        }
      }
    } catch (error) {
      console.log(error);
      process.exit();
    }
  }
}
