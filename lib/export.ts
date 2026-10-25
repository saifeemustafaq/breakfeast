import { ingredientsWith } from "./ingredients";
import { NUTRIENTS, NUTRIENT_KEYS, averageNutrition, formatAmount, percentDV, recipeNutrition, topMicros, type NutrientKey } from "./nutrition";
import { analyzePatterns } from "./patterns";
import {
  AISLE_ORDER,
  ALL_INGREDIENTS,
  INGREDIENTS,
  RECIPE_BY_ID,
  cookedAheadItems,
  preferenceScore,
  prepKinds,
  visibleRecipes,
  type PrepKind,
  type Recipe,
} from "./recipes";
import { rememberedInStock } from "./stock";
import { DAY } from "./time";
import type { AppState, HistoryEntry } from "./types";

// ---------------------------------------------------------------------------
// Model

/** One export as structured blocks, so text, Markdown, CSV and print all come from the same build. */
export type Block =
  | { kind: "title"; text: string; sub?: string }
  | { kind: "heading"; text: string }
  | { kind: "subheading"; text: string }
  | { kind: "text"; text: string; muted?: boolean }
  | { kind: "list"; items: string[]; style?: "check" | "numbered" }
  | { kind: "table"; columns: string[]; rows: string[][] }
  | { kind: "break" };

type Table = { columns: string[]; rows: string[][] };
export type Doc = { title: string; blocks: Block[]; csv?: Table; count: number; countLabel: string };

export type PresetId =
  | "shopping"
  | "pantry"
  | "diary"
  | "nutrition"
  | "patterns"
  | "recipes"
  | "calendar"
  | "allergy"
  | "backup";

export type Format = "text" | "markdown" | "csv" | "print" | "ics" | "json";

export const FORMAT_LABELS: Record<Format, string> = {
  text: "Text",
  markdown: "Markdown",
  csv: "Spreadsheet (CSV)",
  print: "Print or PDF",
  ics: "Calendar",
  json: "Backup file",
};

const EXTENSION: Record<Format, string> = { text: "txt", markdown: "md", csv: "csv", print: "txt", ics: "ics", json: "json" };
const MIME: Record<Format, string> = {
  text: "text/plain",
  markdown: "text/markdown",
  csv: "text/csv",
  print: "text/plain",
  ics: "text/calendar",
  json: "application/json",
};

export const PRESETS: { id: PresetId; label: string; blurb: string; slug: string; formats: Format[] }[] = [
  { id: "shopping", label: "Shopping list", blurb: "Your cart by aisle, ready to tick off", slug: "shopping-list", formats: ["text", "print", "csv", "markdown"] },
  { id: "pantry", label: "Pantry inventory", blurb: "What's in, what's out, what expired", slug: "pantry", formats: ["text", "print", "csv", "markdown"] },
  { id: "diary", label: "Breakfast diary", blurb: "Every breakfast with your ratings", slug: "breakfast-diary", formats: ["csv", "print", "text", "markdown"] },
  { id: "nutrition", label: "Nutrition report", blurb: "Averages against daily values", slug: "nutrition-report", formats: ["print", "text", "csv", "markdown"] },
  { id: "patterns", label: "Your patterns", blurb: "Favorites, skips and what fuels you", slug: "patterns", formats: ["print", "text", "markdown"] },
  { id: "recipes", label: "Recipe book", blurb: "Pick recipes, print them as cards", slug: "recipes", formats: ["print", "text", "markdown"] },
  { id: "calendar", label: "Meal plan to calendar", blurb: "Breakfasts and prep reminders", slug: "meal-plan", formats: ["ics"] },
  { id: "allergy", label: "Allergy card", blurb: "What to avoid and what's safe", slug: "allergy-card", formats: ["print", "text", "markdown"] },
  { id: "backup", label: "Full backup", blurb: "Everything, as one data file", slug: "backup", formats: ["json"] },
];

export const PRESET_BY_ID = Object.fromEntries(PRESETS.map((p) => [p.id, p])) as Record<PresetId, (typeof PRESETS)[number]>;

export type RangeKind = "7" | "30" | "90" | "all" | "custom";

export type DiaryColumn = "date" | "breakfast" | "prep" | "taste" | "feel" | "again" | "note" | "kcal" | "protein" | "fiber";

export const DIARY_COLUMNS: { id: DiaryColumn; label: string }[] = [
  { id: "date", label: "Date" },
  { id: "breakfast", label: "Breakfast" },
  { id: "prep", label: "Prep" },
  { id: "taste", label: "Taste" },
  { id: "feel", label: "Felt afterward" },
  { id: "again", label: "Want again" },
  { id: "note", label: "Note" },
  { id: "kcal", label: "Calories" },
  { id: "protein", label: "Protein (g)" },
  { id: "fiber", label: "Fiber (g)" },
];

export type ExportOptions = {
  range: RangeKind;
  /** YYYY-MM-DD, for a custom range. */
  from: string;
  to: string;
  /** Rating notes and recipe notes are personal, so they're left out unless asked for. */
  notes: boolean;
  groupBy: "aisle" | "breakfast";
  batch: boolean;
  forWhich: boolean;
  pantryShow: "all" | "in" | "out";
  lastChecked: boolean;
  diaryColumns: DiaryColumn[];
  perDay: boolean;
  withDiary: boolean;
  recipeIds: number[];
  recipeNutrition: boolean;
  onePerPage: boolean;
  calendarIds: number[];
  /** YYYY-MM-DD of the first breakfast. */
  start: string;
  /** HH:MM, local. */
  time: string;
  prepReminder: boolean;
  prepTime: string;
  forName: string;
  safeList: boolean;
  tomorrow: boolean;
};

export type ExportData = { state: AppState; history: HistoryEntry[]; now: number };

export function defaultOptions(state: AppState, now: number): ExportOptions {
  const today = ymd(new Date(now));
  return {
    range: "30",
    from: ymd(new Date(now - 30 * DAY)),
    to: today,
    notes: false,
    groupBy: "aisle",
    batch: true,
    forWhich: false,
    pantryShow: "all",
    lastChecked: false,
    diaryColumns: ["date", "breakfast", "taste", "feel", "again", "kcal", "protein"],
    perDay: false,
    withDiary: false,
    recipeIds: state.upcoming ? [state.upcoming.recipeId] : [],
    recipeNutrition: true,
    onePerPage: true,
    calendarIds: state.upcoming ? [state.upcoming.recipeId] : [],
    start: ymd(new Date(now + DAY)),
    time: "08:00",
    prepReminder: true,
    prepTime: "20:00",
    forName: "",
    safeList: true,
    tomorrow: !!state.upcoming,
  };
}

// ---------------------------------------------------------------------------
// Dates

const pad = (n: number) => String(n).padStart(2, "0");
/** Local calendar date as YYYY-MM-DD. */
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
const LONG = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
const SHORT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const time24 = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function inRange(h: HistoryEntry, o: ExportOptions, now: number) {
  const at = Date.parse(h.madeAt);
  if (o.range === "all") return true;
  if (o.range === "custom") {
    const day = ymd(new Date(at));
    return day >= o.from && day <= o.to;
  }
  return at >= now - Number(o.range) * DAY;
}

function rangeLabel(o: ExportOptions) {
  if (o.range === "all") return "All time";
  if (o.range === "custom") return `${LONG.format(parseYmd(o.from))} to ${LONG.format(parseYmd(o.to))}`;
  return `Last ${o.range} days`;
}

// ---------------------------------------------------------------------------
// Builders

const PREP_LABEL: Record<PrepKind, string> = { overnight: "Overnight", cookedAhead: "Cooked ahead", none: "No prep" };
const prepLabel = (r: Recipe) => prepKinds(r).map((k) => PREP_LABEL[k]).join(", ");
const recipeName = (id: number) => RECIPE_BY_ID[id]?.name ?? `Breakfast #${id}`;
const one = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function shopping({ state, now }: ExportData, o: ExportOptions): Doc {
  const ings = ingredientsWith(state.custom);
  const items = state.cart.filter((i) => ings[i.ingredientId]);
  const buy = items.filter((i) => i.kind === "buy");
  const cook = o.batch ? items.filter((i) => i.kind === "cook") : [];
  const forText = (ids: number[]) =>
    o.forWhich && ids.length ? ` (for ${ids.map(recipeName).join(", ")})` : "";

  const blocks: Block[] = [
    {
      kind: "title",
      text: "Shopping list",
      sub: `${buy.length} to buy${cook.length ? `, ${cook.length} to batch-cook` : ""} · ${LONG.format(now)}`,
    },
  ];
  if (!buy.length && !cook.length) blocks.push({ kind: "text", text: "The cart is empty.", muted: true });

  if (o.groupBy === "aisle") {
    for (const aisle of AISLE_ORDER) {
      const group = buy.filter((i) => ings[i.ingredientId].aisle === aisle);
      if (!group.length) continue;
      blocks.push(
        { kind: "heading", text: aisle },
        { kind: "list", style: "check", items: group.map((i) => ings[i.ingredientId].name + forText(i.forRecipes)) },
      );
    }
  } else {
    const groups = new Map<string, string[]>();
    for (const i of buy) {
      const names = i.forRecipes.filter((r) => RECIPE_BY_ID[r]).map(recipeName);
      for (const key of names.length ? names : ["Other items"]) {
        groups.set(key, [...(groups.get(key) ?? []), ings[i.ingredientId].name]);
      }
    }
    const keys = [...groups.keys()].sort((a, b) => (a === "Other items" ? 1 : b === "Other items" ? -1 : a.localeCompare(b)));
    for (const key of keys) blocks.push({ kind: "heading", text: key }, { kind: "list", style: "check", items: groups.get(key)! });
  }

  if (cook.length) {
    blocks.push(
      { kind: "heading", text: "Batch cook" },
      {
        kind: "list",
        style: "check",
        items: cook.map((i) => {
          const ing = ings[i.ingredientId];
          return ing.batch
            ? `${ing.name} (about ${ing.batch.minutes} min, keeps ${ing.batch.keepsDays} days): ${ing.batch.howTo}`
            : ing.name;
        }),
      },
    );
  }

  return {
    title: "Shopping list",
    blocks,
    count: buy.length + cook.length,
    countLabel: "items",
    csv: {
      columns: ["Aisle", "Item", "Type", "For breakfasts", "Added"],
      rows: [...buy, ...cook].map((i) => [
        ings[i.ingredientId].aisle,
        ings[i.ingredientId].name,
        i.kind === "cook" ? "Batch cook" : "Buy",
        i.forRecipes.map(recipeName).join("; "),
        ymd(new Date(i.addedAt)),
      ]),
    },
  };
}

function pantry({ state, now }: ExportData, o: ExportOptions): Doc {
  const ings = ingredientsWith(state.custom);
  const own = new Set(state.custom.map((c) => c.id));
  const all = [...ALL_INGREDIENTS, ...state.custom.map((c) => ings[c.id])];
  const status = (id: string) => {
    const entry = state.stock[id];
    if (rememberedInStock(id, state.stock, now)) return "In stock";
    if (entry?.inStock && ings[id].batch) return "Expired batch";
    return entry ? "Out" : "Not checked yet";
  };
  const shown = all.filter((i) =>
    o.pantryShow === "all" ? true : o.pantryShow === "in" ? status(i.id) === "In stock" : status(i.id) !== "In stock",
  );
  const stocked = all.filter((i) => status(i.id) === "In stock").length;
  const checked = (id: string) => (state.stock[id] ? SHORT.format(new Date(state.stock[id].updatedAt)) : "");
  const name = (id: string) => ings[id].name + (own.has(id) ? " (your item)" : "");

  const blocks: Block[] = [
    {
      kind: "title",
      text: o.pantryShow === "in" ? "In the pantry" : o.pantryShow === "out" ? "Out of stock" : "Pantry inventory",
      sub: `${stocked} of ${all.length} in stock · ${LONG.format(now)}`,
    },
  ];
  if (!shown.length) blocks.push({ kind: "text", text: "Nothing to list.", muted: true });
  for (const aisle of AISLE_ORDER) {
    const group = shown.filter((i) => i.aisle === aisle);
    if (!group.length) continue;
    blocks.push(
      { kind: "heading", text: aisle },
      {
        kind: "table",
        columns: o.lastChecked ? ["Item", "Status", "Last checked"] : ["Item", "Status"],
        rows: group.map((i) => (o.lastChecked ? [name(i.id), status(i.id), checked(i.id)] : [name(i.id), status(i.id)])),
      },
    );
  }

  return {
    title: "Pantry inventory",
    blocks,
    count: shown.length,
    countLabel: "ingredients",
    csv: {
      columns: ["Aisle", "Item", "Status", "Your own item", "Last checked"],
      rows: shown.map((i) => [
        i.aisle,
        ings[i.id].name,
        status(i.id),
        own.has(i.id) ? "Yes" : "",
        state.stock[i.id] ? ymd(new Date(state.stock[i.id].updatedAt)) : "",
      ]),
    },
  };
}

function diaryValue(h: HistoryEntry, col: DiaryColumn, raw: boolean): string {
  const r = RECIPE_BY_ID[h.recipeId];
  const at = new Date(h.madeAt);
  switch (col) {
    case "date":
      return raw ? `${ymd(at)} ${time24(at)}` : LONG.format(at);
    case "breakfast":
      return recipeName(h.recipeId);
    case "prep":
      return r ? prepLabel(r) : "";
    case "taste":
    case "feel":
    case "again":
      return h[col] === undefined ? "" : String(h[col]);
    case "note":
      return h.note ?? "";
    case "kcal":
      return r ? String(Math.round(recipeNutrition(r).totals.kcal)) : "";
    case "protein":
    case "fiber":
      return r ? one(Math.round(recipeNutrition(r).totals[col] * 10) / 10) : "";
  }
}

function diary({ history, now }: ExportData, o: ExportOptions): Doc {
  const entries = history.filter((h) => inRange(h, o, now));
  const cols = o.diaryColumns.filter((c) => c !== "note" || o.notes);
  const labels = cols.map((c) => DIARY_COLUMNS.find((d) => d.id === c)!.label);
  const rated = entries.filter((h) => h.taste !== undefined);
  const avg = (k: "taste" | "feel" | "again") =>
    rated.length ? (rated.reduce((a, h) => a + (h[k] ?? 0), 0) / rated.length).toFixed(1) : null;

  const blocks: Block[] = [
    { kind: "title", text: "Breakfast diary", sub: `${rangeLabel(o)} · ${entries.length} breakfasts` },
  ];
  if (rated.length) {
    blocks.push({
      kind: "text",
      text: `${rated.length} rated. Average taste ${avg("taste")}, felt afterward ${avg("feel")}, want again ${avg("again")} (out of 5).`,
    });
  }
  if (!entries.length) blocks.push({ kind: "text", text: "No breakfasts in this period.", muted: true });
  else blocks.push({ kind: "table", columns: labels, rows: entries.map((h) => cols.map((c) => diaryValue(h, c, false))) });

  return {
    title: "Breakfast diary",
    blocks,
    count: entries.length,
    countLabel: "breakfasts",
    csv: { columns: labels, rows: entries.map((h) => cols.map((c) => diaryValue(h, c, true))) },
  };
}

function nutritionTotals(entries: HistoryEntry[], perDay: boolean) {
  if (!perDay) return { ...averageNutrition(entries.map((h) => h.recipeId)), days: 0 };
  const byDay = new Map<string, number[]>();
  for (const h of entries) {
    if (!RECIPE_BY_ID[h.recipeId]) continue;
    const day = ymd(new Date(h.madeAt));
    byDay.set(day, [...(byDay.get(day) ?? []), h.recipeId]);
  }
  const totals = Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 0])) as Record<NutrientKey, number>;
  for (const ids of byDay.values()) {
    for (const id of ids) {
      const n = recipeNutrition(RECIPE_BY_ID[id]).totals;
      for (const k of NUTRIENT_KEYS) totals[k] += n[k];
    }
  }
  if (byDay.size) for (const k of NUTRIENT_KEYS) totals[k] /= byDay.size;
  return { count: [...byDay.values()].flat().length, totals, days: byDay.size };
}

const amountText = (k: NutrientKey, amount: number) =>
  NUTRIENTS[k].unit === "kcal" ? `${formatAmount(k, amount)} kcal` : formatAmount(k, amount);

function nutrition({ history, now }: ExportData, o: ExportOptions): Doc {
  const entries = history.filter((h) => inRange(h, o, now));
  const { count, totals, days } = nutritionTotals(entries, o.perDay);
  const blocks: Block[] = [
    {
      kind: "title",
      text: "Nutrition report",
      sub: `${rangeLabel(o)} · ${count} breakfasts${o.perDay ? ` over ${days} days` : ""}`,
    },
  ];
  if (!count) {
    blocks.push({ kind: "text", text: "No breakfasts in this period.", muted: true });
    return { title: "Nutrition report", blocks, count: 0, countLabel: "breakfasts" };
  }

  blocks.push({
    kind: "text",
    text: `Breakfast only, averaged per ${o.perDay ? "day" : "breakfast"}, against adult Daily Values. Values come from USDA FoodData Central.`,
    muted: true,
  });
  const rows = NUTRIENT_KEYS.map((k) => {
    const pct = percentDV(k, totals[k]);
    return [NUTRIENTS[k].label, amountText(k, totals[k]), pct === null ? "" : `${pct}%`];
  });
  blocks.push({ kind: "heading", text: "Averages" }, { kind: "table", columns: ["Nutrient", "Average", "% Daily Value"], rows });

  const micros = NUTRIENT_KEYS.filter((k) => NUTRIENTS[k].kind === "micro");
  const strong = micros.filter((k) => (percentDV(k, totals[k]) ?? 0) >= 20);
  const low = micros.filter((k) => (percentDV(k, totals[k]) ?? 0) < 5);
  if (strong.length) {
    blocks.push(
      { kind: "heading", text: "Strong points" },
      { kind: "list", items: strong.map((k) => `${NUTRIENTS[k].label}: ${percentDV(k, totals[k])}% of the Daily Value`) },
    );
  }
  if (low.length) {
    blocks.push(
      { kind: "heading", text: "Running low at breakfast" },
      { kind: "list", items: low.map((k) => `${NUTRIENTS[k].label}: ${percentDV(k, totals[k])}%`) },
    );
  }
  if (o.withDiary) {
    blocks.push(
      { kind: "heading", text: "Breakfasts" },
      {
        kind: "table",
        columns: ["Date", "Breakfast", "Calories", "Protein"],
        rows: entries.map((h) => [
          diaryValue(h, "date", false),
          recipeName(h.recipeId),
          diaryValue(h, "kcal", false),
          RECIPE_BY_ID[h.recipeId] ? formatAmount("protein", recipeNutrition(RECIPE_BY_ID[h.recipeId]).totals.protein) : "",
        ]),
      },
    );
  }

  return {
    title: "Nutrition report",
    blocks,
    count,
    countLabel: "breakfasts",
    csv: {
      columns: ["Nutrient", "Unit", "Average", "% Daily Value"],
      rows: NUTRIENT_KEYS.map((k) => [
        NUTRIENTS[k].label,
        NUTRIENTS[k].unit,
        (Math.round(totals[k] * 10) / 10).toString(),
        percentDV(k, totals[k])?.toString() ?? "",
      ]),
    },
  };
}

function patterns({ state, history, now }: ExportData, o: ExportOptions): Doc {
  const p = analyzePatterns(history.filter((h) => inRange(h, o, now)), state.stats, state.disliked);
  const score = (id: number) => preferenceScore(state.stats[id]);
  const compare = (c: (typeof p.traits)[number]) =>
    `${c.label}: ${c.best.value} (${c.best.avg.toFixed(1)} over ${c.best.count}) beats ${c.worst.value} (${c.worst.avg.toFixed(1)} over ${c.worst.count})`;
  const untried = visibleRecipes(state.disliked).filter((r) => !state.stats[r.id]?.made);

  const blocks: Block[] = [
    { kind: "title", text: "Your patterns", sub: `${rangeLabel(o)} · ${p.tried} of ${p.total} breakfasts tried` },
    { kind: "heading", text: "Favorites" },
    p.favorites.length
      ? { kind: "list", items: p.favorites.map((id) => `${recipeName(id)} (${score(id)?.toFixed(1)}/5)`) }
      : { kind: "text", text: "No favorites yet.", muted: true },
  ];
  if (p.avoid.length) blocks.push({ kind: "heading", text: "Not for you" }, { kind: "list", items: p.avoid.map(recipeName) });
  if (!p.enoughData) {
    blocks.push({ kind: "text", text: "Rate a few more breakfasts in this period to see what you like and what fuels you.", muted: true });
  } else {
    if (p.traits.length) blocks.push({ kind: "heading", text: "What you like" }, { kind: "list", items: p.traits.map(compare) });
    if (p.feel.length) blocks.push({ kind: "heading", text: "What fuels you" }, { kind: "list", items: p.feel.map(compare) });
  }
  if (untried.length) blocks.push({ kind: "heading", text: "Not tried yet" }, { kind: "list", items: untried.map((r) => r.name) });

  return { title: "Your patterns", blocks, count: p.ratedMeals, countLabel: "rated breakfasts" };
}

function recipeBlocks(r: Recipe, withNutrition: boolean, asTitle = false, note?: string): Block[] {
  const blocks: Block[] = [
    asTitle
      ? { kind: "title", text: r.name, sub: `Breakfast #${r.id} from Breakfeast` }
      : { kind: "heading", text: `#${r.id} ${r.name}` },
    { kind: "text", text: r.blurb },
    { kind: "text", text: `${r.minutes} min in the morning · ${prepLabel(r)}`, muted: true },
  ];
  if (r.tip) blocks.push({ kind: "text", text: `Tip: ${r.tip}`, muted: true });
  if (note) blocks.push({ kind: "text", text: `Our note: ${note}` });
  blocks.push(
    { kind: "subheading", text: "Ingredients" },
    {
      kind: "list",
      items: r.ingredients.map(
        (ri) => `${INGREDIENTS[ri.id]?.name ?? ri.id}: ${ri.qty}${ri.when === "night" ? " (the night before)" : ""}`,
      ),
    },
  );
  const cooked = cookedAheadItems(r);
  if (cooked.length) {
    blocks.push(
      { kind: "subheading", text: "Cook ahead" },
      { kind: "list", items: cooked.map((i) => `${i.name} (about ${i.batch.minutes} min, keeps ${i.batch.keepsDays} days): ${i.batch.howTo}`) },
    );
  }
  if (r.nightSteps?.length) blocks.push({ kind: "subheading", text: "The night before" }, { kind: "list", style: "numbered", items: r.nightSteps });
  blocks.push({ kind: "subheading", text: "In the morning" }, { kind: "list", style: "numbered", items: r.steps });
  if (withNutrition) {
    const { totals } = recipeNutrition(r);
    const keys: NutrientKey[] = ["kcal", "protein", "carbs", "fiber", "fat", "sugars", "sodium", ...topMicros(r, 4).map((m) => m.key)];
    blocks.push(
      { kind: "subheading", text: "Nutrition per serving" },
      {
        kind: "table",
        columns: ["Nutrient", "Amount", "% Daily Value"],
        rows: keys.map((k) => {
          const pct = percentDV(k, totals[k]);
          return [NUTRIENTS[k].label, amountText(k, totals[k]), pct === null ? "" : `${pct}%`];
        }),
      },
    );
  }
  return blocks;
}

function recipes({ state }: ExportData, o: ExportOptions): Doc {
  const list = o.recipeIds.map((id) => RECIPE_BY_ID[id]).filter(Boolean);
  const single = list.length === 1;
  const title = single ? list[0].name : "Recipe book";
  const blocks: Block[] = single ? [] : [{ kind: "title", text: title, sub: `${list.length} breakfasts from Breakfeast` }];
  if (!list.length) blocks.push({ kind: "text", text: "Pick at least one recipe.", muted: true });
  list.forEach((r, i) => {
    if (i > 0) blocks.push({ kind: "break" });
    blocks.push(...recipeBlocks(r, o.recipeNutrition, single, o.notes ? state.notes[r.id]?.text : undefined));
  });
  return { title, blocks, count: list.length, countLabel: list.length === 1 ? "recipe" : "recipes" };
}

function allergy({ state, now }: ExportData, o: ExportOptions): Doc {
  const names = state.disliked.map((id) => INGREDIENTS[id]?.name).filter(Boolean);
  const name = o.forName.trim();
  const blocks: Block[] = [
    { kind: "title", text: "Allergies and dislikes", sub: name ? `For ${name} · ${LONG.format(now)}` : LONG.format(now) },
  ];
  if (names.length) {
    blocks.push(
      { kind: "text", text: "Please keep these out of every meal, including toppings and sauces." },
      { kind: "heading", text: "Avoid" },
      { kind: "list", items: names },
    );
  } else {
    blocks.push({ kind: "text", text: "Nothing is listed to avoid.", muted: true });
  }
  if (o.safeList) {
    blocks.push(
      { kind: "heading", text: "Safe breakfasts" },
      { kind: "list", items: visibleRecipes(state.disliked).map((r) => r.name) },
    );
  }
  const upcoming = state.upcoming && RECIPE_BY_ID[state.upcoming.recipeId];
  if (o.tomorrow && upcoming) {
    blocks.push({ kind: "break" }, { kind: "subheading", text: "Tomorrow's breakfast" }, ...recipeBlocks(upcoming, false));
  }
  return { title: "Allergy card", blocks, count: names.length, countLabel: names.length === 1 ? "item to avoid" : "items to avoid" };
}

const BUILDERS: Record<Exclude<PresetId, "calendar" | "backup">, (d: ExportData, o: ExportOptions) => Doc> = {
  shopping,
  pantry,
  diary,
  nutrition,
  patterns,
  recipes,
  allergy,
};

// ---------------------------------------------------------------------------
// Renderers

/** Plain text that reads well when pasted into a chat or a note. */
export function toText(doc: Doc) {
  const out: string[] = [];
  for (const b of doc.blocks) {
    switch (b.kind) {
      case "title":
        out.push(b.text.toUpperCase(), ...(b.sub ? [b.sub] : []), "");
        break;
      case "heading":
        out.push("", `${b.text}:`);
        break;
      case "subheading":
        out.push("", b.text);
        break;
      case "text":
        out.push(b.text);
        break;
      case "list":
        b.items.forEach((item, i) => out.push(`${b.style === "check" ? "☐" : b.style === "numbered" ? `${i + 1}.` : "•"} ${item}`));
        break;
      case "table":
        for (const row of b.rows) {
          out.push(
            row
              .map((cell, j) => (j < 2 || !cell ? cell : `${b.columns[j]}: ${cell}`))
              .filter(Boolean)
              .join(" · "),
          );
        }
        break;
      case "break":
        out.push("", "----------", "");
        break;
    }
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

const mdCell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

export function toMarkdown(doc: Doc) {
  const out: string[] = [];
  for (const b of doc.blocks) {
    switch (b.kind) {
      case "title":
        out.push(`# ${b.text}`, ...(b.sub ? ["", `_${b.sub}_`] : []), "");
        break;
      case "heading":
        out.push("", `## ${b.text}`, "");
        break;
      case "subheading":
        out.push("", `### ${b.text}`, "");
        break;
      case "text":
        out.push(b.muted ? `_${b.text}_` : b.text, "");
        break;
      case "list":
        b.items.forEach((item, i) => out.push(`${b.style === "check" ? "- [ ]" : b.style === "numbered" ? `${i + 1}.` : "-"} ${item}`));
        out.push("");
        break;
      case "table":
        out.push(
          `| ${b.columns.map(mdCell).join(" | ")} |`,
          `| ${b.columns.map(() => "---").join(" | ")} |`,
          ...b.rows.map((r) => `| ${r.map(mdCell).join(" | ")} |`),
          "",
        );
        break;
      case "break":
        out.push("", "---", "");
        break;
    }
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

const csvCell = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** RFC 4180 with a byte-order mark so Excel opens it as UTF-8. */
export function toCsv(table: Table) {
  return "\uFEFF" + [table.columns, ...table.rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

// ---------------------------------------------------------------------------
// Calendar

const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Lines longer than 75 octets are folded with a leading space (RFC 5545). */
function fold(line: string) {
  const parts: string[] = [];
  let rest = line;
  while (rest.length > 60) {
    parts.push(rest.slice(0, 60));
    rest = rest.slice(60);
  }
  parts.push(rest);
  return parts.join("\r\n ");
}

const icsLocal = (d: Date) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
const icsUtc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

function at(day: Date, hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h || 0, m || 0);
}

function calendar({ now }: ExportData, o: ExportOptions) {
  const list = o.calendarIds.map((id) => RECIPE_BY_ID[id]).filter(Boolean);
  const stamp = icsUtc(new Date(now));
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Breakfeast//Meal plan//EN", "CALSCALE:GREGORIAN"];
  const event = (uid: string, start: Date, minutes: number, summary: string, description: string, alarm: boolean) => {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid}@breakfeast`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsLocal(start)}`,
      `DURATION:PT${minutes}M`,
      `SUMMARY:${icsText(summary)}`,
      `DESCRIPTION:${icsText(description)}`,
    );
    if (alarm) lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsText(summary)}`, "TRIGGER:PT0M", "END:VALARM");
    lines.push("END:VEVENT");
  };
  const first = parseYmd(o.start);
  list.forEach((r, i) => {
    const day = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i);
    const ingredients = r.ingredients.map((ri) => `- ${INGREDIENTS[ri.id]?.name ?? ri.id}: ${ri.qty}`).join("\n");
    const steps = r.steps.map((s, n) => `${n + 1}. ${s}`).join("\n");
    event(`${ymd(day)}-${r.id}`, at(day, o.time), Math.max(15, r.minutes), `Breakfast: ${r.name}`, `${r.blurb}\n\nIngredients\n${ingredients}\n\nSteps\n${steps}`, false);
    const cooked = cookedAheadItems(r);
    if (o.prepReminder && (r.nightSteps?.length || cooked.length)) {
      const eve = new Date(day.getFullYear(), day.getMonth(), day.getDate() - 1);
      const tasks = [
        ...(r.nightSteps ?? []).map((s, n) => `${n + 1}. ${s}`),
        ...cooked.map((c) => `- Have ${c.name.toLowerCase()} ready (about ${c.batch.minutes} min to cook)`),
      ].join("\n");
      event(`${ymd(day)}-${r.id}-prep`, at(eve, o.prepTime), 15, `Prep tonight: ${r.name}`, tasks, true);
    }
  });
  lines.push("END:VCALENDAR");
  return { content: lines.map(fold).join("\r\n") + "\r\n", count: list.length };
}

// ---------------------------------------------------------------------------
// Backup

function backup({ state, history, now }: ExportData, o: ExportOptions) {
  const ings = ingredientsWith(state.custom);
  const data = {
    format: "breakfeast-backup",
    version: 1,
    exportedAt: new Date(now).toISOString(),
    includesNotes: o.notes,
    pantry: Object.entries(state.stock).map(([id, s]) => ({ id, name: ings[id]?.name ?? id, ...s })),
    customIngredients: state.custom,
    cart: state.cart.map((i) => ({ ...i, name: ings[i.ingredientId]?.name ?? i.ingredientId })),
    tomorrow: state.upcoming ? { ...state.upcoming, name: recipeName(state.upcoming.recipeId) } : null,
    dislikes: state.disliked.map((id) => ({ id, name: INGREDIENTS[id]?.name ?? id })),
    recipeNotes: Object.entries(state.notes).map(([id, n]) => ({ recipeId: Number(id), name: recipeName(Number(id)), ...n })),
    history: history.map(({ note, ...h }) => ({ ...h, name: recipeName(h.recipeId), ...(o.notes && note ? { note } : {}) })),
  };
  return { content: JSON.stringify(data, null, 2) + "\n", count: history.length };
}

// ---------------------------------------------------------------------------
// Entry point

export type ExportFile = {
  content: string;
  filename: string;
  mime: string;
  /** Present for block-based exports; the print view renders it. */
  doc?: Doc;
  count: number;
  countLabel: string;
};

export function buildExport(preset: PresetId, format: Format, data: ExportData, o: ExportOptions): ExportFile {
  const def = PRESET_BY_ID[preset];
  const filename = (slug: string) => `breakfeast-${slug}-${ymd(new Date(data.now))}.${EXTENSION[format]}`;
  if (preset === "calendar") {
    const { content, count } = calendar(data, o);
    return { content, filename: filename(def.slug), mime: MIME.ics, count, countLabel: count === 1 ? "breakfast" : "breakfasts" };
  }
  if (preset === "backup") {
    const { content, count } = backup(data, o);
    return { content, filename: filename(def.slug), mime: MIME.json, count, countLabel: "breakfasts in history" };
  }
  const doc = BUILDERS[preset](data, o);
  const content =
    format === "markdown" ? toMarkdown(doc) : format === "csv" && doc.csv ? toCsv(doc.csv) : toText(doc);
  const slug =
    preset === "recipes" && doc.count === 1
      ? doc.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
      : def.slug;
  return { content, filename: filename(slug), mime: `${MIME[format]};charset=utf-8`, doc, count: doc.count, countLabel: doc.countLabel };
}
