import { test, expect } from '@playwright/test';

const surveyUrl = 'https://formspree.io/library/feedback/customer-satisfaction-survey/';

async function openSurvey(page) {
  await page.goto(surveyUrl, { waitUntil: 'domcontentloaded' });
  await page.locator('iframe').waitFor({ state: 'visible' });
  return page.frameLocator('iframe');
}

async function setRangeValue(frame, selector, value) {
  await frame.locator(selector).evaluate((element, newValue) => {
    element.value = String(newValue);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

test('validates required survey fields before submission', async ({ page }) => {
  const frame = await openSurvey(page);

  const requiredFields = [
    'input[name="full-name"]',
    'input[name="email-address"]',
    'input[name="phone-number"]',
    'input[name="purchase-date"]',
  ];

  for (const selector of requiredFields) {
    const field = frame.locator(selector);
    await expect(field).toBeVisible();
    await expect(field).toHaveAttribute('required', '');
    await expect(field).toHaveAttribute('placeholder', /.+/);
  }

  const emptyName = frame.locator('input[name="full-name"]');
  await emptyName.fill('');
  await expect(emptyName.evaluate((element) => element.checkValidity())).resolves.toBe(false);
});

test('submits the satisfaction survey and reaches a thank-you page', async ({ page }) => {
  await page.route('https://formspree.io/f/*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<html><body><h1>Thank you!</h1><p>Your feedback has been received.</p></body></html>',
    });
  });

  const frame = await openSurvey(page);

  await frame.locator('input[name="full-name"]').fill('Jane Doe');
  await frame.locator('input[name="email-address"]').fill('jane.doe@example.com');
  await frame.locator('input[name="phone-number"]').fill('9876543210');
  await frame.locator('input[name="purchase-date"]').fill('2026-07-16');

  await frame.locator('#quality-rating-excellent').check();
  await frame.locator('#ease-of-use-very-good').check();
  await frame.locator('#customer-service-excellent').check();

  await setRangeValue(frame, '#overall-satisfaction', '5');
  await setRangeValue(frame, '#nps-score', '10');

  await frame.locator('textarea[name="like-most"]').fill('Fast and helpful service');
  await frame.locator('textarea[name="improvement-suggestions"]').fill('Nothing major');
  await frame.locator('textarea[name="additional-comments"]').fill('Keep up the good work');
  await frame.locator('input[name="follow-up-consent"]').check();

  const requestPromise = page.waitForRequest((request) => request.url().includes('formspree.io/f/'));
  await frame.locator('form').evaluate((form) => form.requestSubmit());
  const request = await requestPromise;

  expect(request.method()).toBe('POST');
  await expect(page.locator('body')).toContainText('Thank you', { timeout: 20000 });
});