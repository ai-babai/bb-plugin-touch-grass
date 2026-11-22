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
