import { test, expect } from '@playwright/test';

test('production page loads its assets and stays within the viewport', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('a[href="https://github.com/jpitty03/PGRazor/releases/latest"]').first()).toBeVisible();
  for (const image of await page.locator('img').all()) {
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate(img => img.complete && img.naturalWidth > 0)).toBeTruthy();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  expect(errors).toEqual([]);
});

test('in-page navigation points to existing content', async ({ page }) => {
  await page.goto('./');
  const missing = await page.locator('a[href^="#"]').evaluateAll(links =>
    links.map(link => link.getAttribute('href')).filter(href => href.length < 2 || !document.getElementById(href.slice(1)))
  );
  expect(missing).toEqual([]);
});

test('defaults to dark and remembers the chosen theme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('settings guide and screenshot viewer work with the keyboard', async ({ page }) => {
  await page.goto('./');
  const catching = page.getByRole('tab', { name: 'Catching', exact: true });
  await catching.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Explore', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: 'Explore', exact: true })).toBeVisible();
  const shot = page.locator('.shot-btn').first();
  await shot.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(shot).toBeFocused();
});
