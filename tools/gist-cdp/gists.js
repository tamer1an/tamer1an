// Read-only CDP access to https://gist.github.com via the dedicated agent Chrome profile
// (F:\gems\chrome-agent-profile, CDP on 127.0.0.1:9222) — never the user's everyday profile.
//
//   node gists.js status          → logged-in GitHub user in that profile, or "anonymous"
//   node gists.js list [user]     → gist URLs + titles from https://gist.github.com/<user>
//
// Creating (secret) gists is deliberately not here: it publishes content and needs the user's go-ahead.
import puppeteer from 'puppeteer-core';

const CDP = process.env.CDP_URL ?? 'http://127.0.0.1:9222';

async function withPage(fn) {
  const browser = await puppeteer.connect({ browserURL: CDP, defaultViewport: null });
  const page = await browser.newPage();
  try {
    return await fn(page);
  } finally {
    await page.close();
    browser.disconnect(); // leave the browser running
  }
}

const [cmd, user = 'tamer1an'] = process.argv.slice(2);

if (cmd === 'status') {
  const login = await withPage(async (page) => {
    await page.goto('https://gist.github.com/', { waitUntil: 'domcontentloaded' });
    return page.evaluate(() => document.querySelector('meta[name="user-login"]')?.content || null);
  });
  console.log(login ?? 'anonymous');
} else if (cmd === 'list') {
  const gists = await withPage(async (page) => {
    await page.goto(`https://gist.github.com/${user}`, { waitUntil: 'domcontentloaded' });
    return page.$$eval(`a[href^="/${user}/"]`, (as) => [
      ...new Map(as.filter((a) => /\/[0-9a-f]{20,}$/.test(a.getAttribute('href'))).map((a) => [a.href, a.textContent.trim()])).entries(),
    ]);
  });
  for (const [url, title] of gists) console.log(`${url}  ${title}`);
  console.error(`${gists.length} gists on the first page of https://gist.github.com/${user}`);
} else {
  console.log('usage: node gists.js status | list [user]');
}
