const english = {
  meadow: "This chat’s meadow", compact: "Compact", full: "Tall",
  size: "Size", sizeGroup: "Meadow height", guests: "Visitors", guestGroup: "Meadow visitors",
  bee: "Bee", butterfly: "Butterfly", visiting: "enabled", away: "disabled",
  settings: "Meadow settings", back: "Back to meadow",
  scythe: "Scythe", takeScythe: "Pick up the scythe to cut a path",
  usingScythe: "Drag at the height you want to cut. Select the scythe again or press Esc to put it away.",
  mower: "Mow the lawn", brush: "Brush a firefly back and forth to grow a flower",
};

const russian: typeof english = {
  meadow: "Луг этого чата", compact: "Компактный", full: "Высокий",
  size: "Размер", sizeGroup: "Размер луга", guests: "Гости", guestGroup: "Гости луга",
  bee: "Пчела", butterfly: "Бабочка", visiting: "прилетает", away: "не прилетает",
  settings: "Настройки луга", back: "Вернуться к лугу",
  scythe: "Коса: косить вручную", takeScythe: "Взять косу и косить самому",
  usingScythe: "Проведи на высоте среза. Нажми косу ещё раз или Esc, чтобы убрать.",
  mower: "Газонокосилка: покосить луг", brush: "Погладь огонёк туда-сюда, чтобы вырастить цветок",
};

export function meadowCopy(language: string) {
  return language.toLowerCase().split("-")[0] === "ru" ? russian : english;
}

export const copy = meadowCopy(document.documentElement.lang || navigator.language);
