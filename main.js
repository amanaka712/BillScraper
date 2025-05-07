import { Actor, launchPuppeteer, openDataset } from 'apify';

await Actor.init();

const browser = await launchPuppeteer({ headless: 'new' });
const page = await browser.newPage();
const dataset = await openDataset();

const keywords = ['abortion', 'contraception', 'birth control', 'reproductive'];
const baseUrl = 'https://open.pluralpolicy.com/oh/bills/';

await page.goto(baseUrl, { waitUntil: 'networkidle2' });
console.log('Opened base page');

let hasNext = true;
let pageCount = 0;

while (hasNext) {
    pageCount++;
    console.log(\`Scraping page \${pageCount}\`);

    await page.waitForSelector('a[data-test="bill-title-link"]');
    const billLinks = await page.$$eval('a[data-test="bill-title-link"]', links => links.map(a => a.href));

    for (const link of billLinks) {
        const billPage = await browser.newPage();
        await billPage.goto(link, { waitUntil: 'networkidle2' });
        await billPage.waitForTimeout(2000);

        const data = await billPage.evaluate(() => {
            const title = document.querySelector('h1[data-test="bill-title"]')?.innerText || '';
            const status = document.querySelector('[data-test="bill-status-chip"]')?.innerText || '';
            const dateIntroduced = document.querySelector('[data-test="bill-date-introduced"]')?.innerText || '';
            const sponsors = Array.from(document.querySelectorAll('[data-test="bill-sponsor"]')).map(el => el.innerText.trim()).join(', ');
            const summary = document.querySelector('[data-test="bill-summary"]')?.innerText || '';
            return { title, status, dateIntroduced, sponsors, summary };
        });

        data.url = link;

        const text = \`\${data.title} \${data.summary}\`.toLowerCase();
        const isRelevant = keywords.some(keyword => text.includes(keyword));

        if (isRelevant) {
            console.log(\`✅ Saving relevant bill: \${data.title}\`);
            await dataset.pushData(data);
        } else {
            console.log(\`❌ Skipping unrelated bill: \${data.title}\`);
        }

        await billPage.close();
    }

    const nextButton = await page.$('button[aria-label="Go to next page"]:not([disabled])');
    if (nextButton) {
        await nextButton.click();
        await page.waitForTimeout(3000);
    } else {
        hasNext = false;
    }
}

await browser.close();
console.log('🎉 Done scraping.');
await Actor.exit();
