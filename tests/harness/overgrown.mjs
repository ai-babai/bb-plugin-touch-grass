// Use wall time, including periods when Chromium would have suspended rendering.
export async function ageMeadow(m, minutes) {
  await m.page.clock.fastForward(minutes * 60_000);
  await m.run(180);
}

export async function chooseOvergrown(m) {
  await m.toggle.click();
  await m.page.getByRole("button", { name: /заросли|overgrown/i }).click();
  await m.toggle.click();
  await m.run(180);
}

const SIZE_NAMES = { compact: /компактный|compact/i, full: /высокий|tall/i, overgrown: /заросли|overgrown/i };

/** Picks a size on the back of the card and turns back to the meadow. */
export async function chooseSize(m, size) {
  await m.toggle.click();
  await m.page.getByRole("button", { name: SIZE_NAMES[size] }).click();
  await m.toggle.click();
  await m.run(180);
  await m.page.waitForTimeout(550); // the card flip runs on the real clock
}
