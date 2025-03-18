import Audic from 'audic';
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import { exec } from 'child_process';

const passCaptcha = async () => {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      timeout: 120000,
      defaultViewport: {
        width: 1920,
        height: 1080,
      },
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
      ],
    });
    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(120000);
    await page.setDefaultTimeout(120000);

    // Add user agent
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Wait longer for initial load
    await page.goto('https://ita-schengen.idata.com.tr/tr', {
      waitUntil: 'networkidle0',
      timeout: 120000,
    });
    await page.setViewport({ width: 1920, height: 1080 });

    // Değiştirilmiş captcha image seçici
    await page.waitForSelector('.imageCaptcha', { timeout: 120000 });
    const imageElement = await page.$('.imageCaptcha');
    const image = await imageElement.evaluate((el) => el.src);

    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');

    await new Promise((resolve, reject) => {
      fs.writeFile('captcha.png', imageBuffer, async (err) => {
        if (err) {
          console.error(err);
          reject(err);
          return;
        }

        exec('python extract-numbers.py', async (error, stdout, stderr) => {
          if (error) {
            console.error(`Error executing Python script: ${error}`);
            reject(error);
            return;
          }
          if (stderr) {
            console.error(`Python script stderr: ${stderr}`);
            reject(stderr);
            return;
          }

          try {
            const captchaNumber = stdout.trim();
            console.log(`Captcha number: ${captchaNumber}`);
            if (isNaN(captchaNumber)) {
              throw new Error('Invalid captcha number');
            }

            await page.waitForSelector('#mailConfirmCodeControl');
            await page.type('#mailConfirmCodeControl', captchaNumber);

            await Promise.all([
              page.click('#confirmationbtn'),
              Promise.race([
                page.waitForNavigation({ waitUntil: 'networkidle0' }),
                page.waitForSelector('.swal2-modal.show-swal2.visible', {
                  timeout: 5000,
                }),
              ]),
            ]);

            const errorPopup = await page.$('.swal2-modal.show-swal2.visible');
            if (errorPopup) {
              console.log('Captcha verification failed, retrying...');
              await browser.close();
              await passCaptcha();
              return;
            }

            await page.waitForSelector('#city');
            await page.select('#city', '34');
            await page.select('#office', '1');
            await page.select('#getapplicationtype', '2');
            await page.select('#officetype', '1');
            await page.select('#totalPerson', '1');

            const checkAvailableDates = async () => {
              const makeRequest = async (retryCount = 0) => {
                if (retryCount > 5) {
                  console.log('Max retry count reached, restarting process...');
                  await browser.close();
                  await passCaptcha();
                  return;
                }

                try {
                  // Form elemanlarını tekrar seç ve değiştir
                  await page.select('#totalPerson', '2');
                  await page.select('#totalPerson', '1');

                  // İsteği puppeteer üzerinden yapalım
                  const response = await page.evaluate(async () => {
                    const csrfToken = document
                      .querySelector('meta[name="csrf-token"]')
                      .getAttribute('content');
                    const result = await fetch(
                      'https://ita-schengen.idata.com.tr/tr/getavailablefirstdate',
                      {
                        headers: {
                          accept: '*/*',
                          'accept-language':
                            'en-US,en;q=0.9,tr-TR;q=0.8,tr;q=0.7',
                          'content-type':
                            'application/x-www-form-urlencoded; charset=UTF-8',
                          'x-csrf-token': csrfToken,
                          'x-requested-with': 'XMLHttpRequest',
                        },
                        body: 'serviceType=1&totalPerson=1&getOfficeID=1&calendarType=2&getConsular=2',
                        method: 'POST',
                      }
                    );
                    return await result.json();
                  });

                  if (response.hasOwnProperty('isAvailable')) {
                      if (response.isAvailable != false) {
                        await playSounds();
                      }
                    console.log('isAvailable:', response.isAvailable);
                    await new Promise((resolve) => setTimeout(resolve, 300000));
                    return makeRequest(0);
                  }

                  console.log(`Invalid response, retrying...`);
                  await new Promise((resolve) => setTimeout(resolve, 5000));
                  return makeRequest(retryCount + 1);
                } catch (error) {
                  console.error('Error:', error);
                  await new Promise((resolve) => setTimeout(resolve, 1000));
                  return makeRequest(retryCount + 1);
                }
              };

              await makeRequest();
            };

            await checkAvailableDates();
            // setInterval(checkAvailableDates, 3000);

            resolve();
          } catch (err) {
            reject(err);
          }
        });
      });
    });
  } catch (err) {
    console.error('Error:', err);
    if (browser) {
      await browser.close();
    }
    await passCaptcha();
  }
};

const playSounds = async () => {
  const audic = new Audic('alarm.mp3');
  await audic.play();
  setTimeout(() => {
    audic.destroy();
  }, 5000);
};

passCaptcha();
