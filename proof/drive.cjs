// Drives the proof with a real pointer in headless Chrome and saves a picture of each state.
// Needs playwright-core; run from a folder that has it: node drive.cjs <url> <outDir>
const { chromium } = require('playwright-core');

(async () => {
    const [url, out] = process.argv.slice(2);
    const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
    const page = await browser.newPage({ viewport: { width: 900, height: 800 }, colorScheme: 'dark' });
    const errors = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url);

    const shot = async (name) => {
        await page.waitForTimeout(800);
        await page.screenshot({ path: `${out}/${name}.png` });
    };
    const visible = (cls) => page.$$eval(`.${cls}`, (els) => els.filter((e) => getComputedStyle(e).opacity === '1').map((e) => e.textContent));
    const report = async (name) => console.log(name, JSON.stringify({ caption: await visible('cap'), hint: await visible('hint'), crumb: await visible('crumb') }));
    const center = async (sel) => {
        const box = await page.locator(sel).first().boundingBox();
        return [box.x + box.width / 2, box.y + box.height / 2];
    };

    await shot('0-rest');
    await report('rest');

    const hit = await page.locator('.h2').boundingBox();
    await page.mouse.move(hit.x + hit.width / 2, hit.y + hit.height - 12);
    await shot('1-hover-layer');
    await report('hover hooks layer');

    await page.mouse.down();
    await page.mouse.up();
    await page.mouse.move(10, 10);
    await shot('2-open-layer');
    await report('opened hooks');

    await page.mouse.move(...(await center('.p2-1')));
    await shot('3-hover-part');
    await report('hover prompt.submit');

    await page.mouse.down();
    await page.mouse.up();
    await page.mouse.move(10, 10);
    await shot('4-open-part');
    await report('opened prompt.submit');

    const step = await page.locator('.s2-1-1 .shit').boundingBox();
    await page.mouse.move(step.x + step.width / 2, step.y + step.height - 14);
    await shot('5-hover-step');
    await report('hover step 2');

    await page.mouse.move(40, 300);
    await page.mouse.down();
    await page.mouse.up();
    await shot('6-up-to-layer');
    await report('clicked empty space');

    const back = await page.locator('.back').boundingBox();
    await page.mouse.click(back.x + back.width / 2, back.y + back.height / 2);
    await page.mouse.move(10, 10);
    await shot('7-back-to-stack');
    await report('clicked back');

    // The tallest case: a part with four steps.
    const drawing = await page.locator('.h1').boundingBox();
    await page.mouse.click(drawing.x + drawing.width / 2, drawing.y + drawing.height - 12);
    await page.waitForTimeout(600);
    await page.mouse.click(...(await center('.p1-0')));
    await page.mouse.move(10, 10);
    await shot('8-four-steps');
    await report('opened Typst');

    console.log('console errors:', errors.length ? errors : 'none');
    await browser.close();
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
