"use client";

import { useCallback, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import {
  BookOpenIcon,
  BookmarkIcon,
  CalendarDaysIcon,
  ChartNoAxesColumnIcon,
  CopyIcon,
  DatabaseBackupIcon,
  DownloadIcon,
  HistoryIcon,
  NotebookPenIcon,
  PackageIcon,
  PrinterIcon,
  SaladIcon,
  Share2Icon,
  ShieldAlertIcon,
  ShoppingCartIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import { track } from "@/components/activity/logger";
import { toast } from "@/components/activity/toast";
import { BackButton } from "@/components/navigation";
import { PrintDocument, PrintPortal } from "@/components/print-document";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DIARY_COLUMNS,
  FORMAT_LABELS,
  PRESETS,
  PRESET_BY_ID,
  buildExport,
  defaultOptions,
  ymd,
  type ExportOptions,
  type Format,
  type PresetId,
  type RangeKind,
} from "@/lib/export";
import { RECIPE_BY_ID, preferenceScore, visibleRecipes } from "@/lib/recipes";
import { matchesQuery, recipeSearchText } from "@/lib/search";
import type { AppState, HistoryEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

const ICONS: Record<PresetId, LucideIcon> = {
  shopping: ShoppingCartIcon,
  pantry: PackageIcon,
  diary: NotebookPenIcon,
  nutrition: SaladIcon,
  patterns: ChartNoAxesColumnIcon,
  recipes: BookOpenIcon,
  calendar: CalendarDaysIcon,
  allergy: ShieldAlertIcon,
  backup: DatabaseBackupIcon,
};

/** Presets that make no sense to send while empty. */
const NEEDS_ROWS = new Set<PresetId>(["shopping", "diary", "nutrition", "recipes", "calendar"]);
const PREVIEW_LINES = 40;

// ---------------------------------------------------------------------------
// Saved setups live on this phone only.

type Saved = { id: string; name: string; preset: PresetId; format: Format; options: Partial<ExportOptions> };

const SAVED_KEY = "breakfeast.exports.v1";
const LAST = "last";
const listeners = new Set<() => void>();

function subscribeSaved(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function readSaved() {
  try {
    return localStorage.getItem(SAVED_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

function parseSaved(raw: string): Saved[] {
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((s) => PRESET_BY_ID[s?.preset as PresetId]) : [];
  } catch {
    return [];
  }
}

function writeSaved(list: Saved[]) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(list.slice(0, 13)));
  } catch {
    // Private mode or full storage: saving setups is a nicety, so fail quietly.
  }
  listeners.forEach((l) => l());
}

/** Dates tied to "today" go stale, so saved setups never pin them. */
function savable({ start, ...rest }: ExportOptions): Partial<ExportOptions> {
  void start;
  return rest;
}

const noSubscribe = () => () => {};
const shareSupported = () => typeof navigator.share === "function";

// ---------------------------------------------------------------------------

export function ExportFlow({ initial, history }: { initial: AppState; history: HistoryEntry[] }) {
  const params = useSearchParams();
  const preset = params.get("preset") as PresetId | null;
  const ids = (params.get("recipes") ?? "")
    .split(",")
    .map(Number)
    .filter((id) => RECIPE_BY_ID[id]);
  const start = preset && PRESET_BY_ID[preset] ? { preset, ids } : undefined;
  return (
    <ExportView
      key={start ? `${preset}-${ids.join(",")}` : "export"}
      state={initial}
      history={history}
      start={start}
    />
  );
}

function ExportView({
  state,
  history,
  start,
}: {
  state: AppState;
  history: HistoryEntry[];
  start?: { preset: PresetId; ids: number[] };
}) {
  const now = state.loadedAt;
  const defaults = useMemo(() => defaultOptions(state, now), [state, now]);
  const [preset, setPreset] = useState<PresetId>(start?.preset ?? "shopping");
  const [format, setFormat] = useState<Format>(PRESET_BY_ID[start?.preset ?? "shopping"].formats[0]);
  const [o, setO] = useState<ExportOptions>(() =>
    start?.ids.length ? { ...defaults, recipeIds: start.ids, calendarIds: start.ids } : defaults,
  );
  const [printing, setPrinting] = useState(false);
  const [naming, setNaming] = useState<string | null>(null);
  const savedRaw = useSyncExternalStore(subscribeSaved, readSaved, () => "[]");
  const saved = useMemo(() => parseSaved(savedRaw), [savedRaw]);
  const canShare = useSyncExternalStore(noSubscribe, shareSupported, () => false);
  const stopPrinting = useCallback(() => setPrinting(false), []);

  const set = (patch: Partial<ExportOptions>) => setO((x) => ({ ...x, ...patch }));
  const def = PRESET_BY_ID[preset];
  const out = useMemo(() => buildExport(preset, format, { state, history, now }, o), [preset, format, state, history, now, o]);
  const empty = out.count === 0 && NEEDS_ROWS.has(preset);
  const label = `${def.label} · ${FORMAT_LABELS[format]}`;

  function choose(id: PresetId) {
    setPreset(id);
    if (!PRESET_BY_ID[id].formats.includes(format)) setFormat(PRESET_BY_ID[id].formats[0]);
  }

  function load(s: Saved) {
    setPreset(s.preset);
    setFormat(PRESET_BY_ID[s.preset].formats.includes(s.format) ? s.format : PRESET_BY_ID[s.preset].formats[0]);
    setO({ ...defaults, ...s.options });
  }

  function save() {
    const name = naming?.trim() || label;
    writeSaved([
      ...saved.filter((s) => s.id === LAST),
      { id: crypto.randomUUID(), name, preset, format, options: savable(o) },
      ...saved.filter((s) => s.id !== LAST),
    ]);
    setNaming(null);
    toast.success("Saved on this phone");
  }

  function delivered(delivery: "share" | "download" | "copy" | "print") {
    track("workflow", "export.created", { preset, format, delivery, rows: out.count });
    writeSaved([
      { id: LAST, name: label, preset, format, options: savable(o) },
      ...saved.filter((s) => s.id !== LAST),
    ]);
  }

  function download() {
    const url = URL.createObjectURL(new Blob([out.content], { type: out.mime }));
    const a = document.createElement("a");
    a.href = url;
    a.download = out.filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    delivered("download");
    toast.success(`Saved ${out.filename}`);
  }

  async function share() {
    const title = out.doc?.title ?? def.label;
    const file = new File([out.content], out.filename, { type: out.mime });
    try {
      if (format === "text" || format === "markdown") await navigator.share({ title, text: out.content });
      else if (navigator.canShare?.({ files: [file] })) await navigator.share({ title, files: [file] });
      else return download();
      delivered("share");
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      download();
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(out.content.replace(/^\uFEFF/, ""));
      delivered("copy");
      toast.success("Copied");
    } catch {
      toast.error("Couldn't copy on this device");
    }
  }

  function print() {
    delivered("print");
    setPrinting(true);
  }

  const lines = out.content.replace(/^\uFEFF/, "").split(/\r?\n/);

  return (
    <section className="flex flex-col gap-6">
      <BackButton />
      <div className="-mt-4">
        <h1 className="font-heading text-3xl font-semibold">Export &amp; share</h1>
        <p className="mt-1 text-muted-foreground">
          Send a list to whoever is shopping, print recipes for the fridge, or keep a copy of
          everything.
        </p>
      </div>

      {saved.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Quick picks</p>
          <div className="flex flex-wrap gap-2">
            {saved.map((s) => (
              <span key={s.id} className="flex items-center rounded-full border bg-card text-sm">
                <button type="button" className="flex items-center gap-1.5 py-1.5 pr-1 pl-3" onClick={() => load(s)}>
                  {s.id === LAST ? <HistoryIcon className="size-3.5" /> : <BookmarkIcon className="size-3.5" />}
                  {s.id === LAST ? `Last: ${s.name}` : s.name}
                </button>
                <button
                  type="button"
                  aria-label={`Forget ${s.name}`}
                  className="rounded-full p-1.5 text-muted-foreground hover:text-foreground"
                  onClick={() => writeSaved(saved.filter((x) => x.id !== s.id))}
                >
                  <XIcon className="size-3.5" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      <Group title="What to export">
        <div className="grid grid-cols-2 gap-2">
          {PRESETS.map((p) => {
            const Icon = ICONS[p.id];
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={p.id === preset}
                onClick={() => choose(p.id)}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-xl border bg-card p-3 text-left transition-colors",
                  p.id === preset ? "border-primary ring-2 ring-primary/30" : "hover:bg-muted",
                )}
              >
                <Icon className={cn("size-5", p.id === preset ? "text-primary" : "text-muted-foreground")} />
                <span className="text-sm leading-tight font-medium">{p.label}</span>
                <span className="text-xs leading-snug text-muted-foreground">{p.blurb}</span>
              </button>
            );
          })}
        </div>
      </Group>

      {def.formats.length > 1 && (
        <Group title="Format">
          <Chips
            value={format}
            onChange={setFormat}
            options={def.formats.map((f) => ({ id: f, label: FORMAT_LABELS[f] }))}
          />
        </Group>
      )}

      <Options preset={preset} format={format} o={o} set={set} state={state} now={now} />

      <Group title="Preview">
        <div className="overflow-hidden rounded-xl border bg-card">
          <p className="border-b px-3 py-2 text-xs text-muted-foreground">
            {out.count} {out.countLabel} · {format === "print" ? "Print layout" : out.filename}
          </p>
          {format === "print" && out.doc ? (
            <div className="max-h-[28rem] overflow-y-auto p-4">
              <PrintDocument doc={out.doc} onePerPage={o.onePerPage} />
            </div>
          ) : (
            <pre
              className={cn(
                "max-h-80 overflow-auto p-3 font-mono text-xs leading-relaxed",
                format === "text" || format === "markdown" ? "whitespace-pre-wrap" : "whitespace-pre",
              )}
            >
              {lines.slice(0, PREVIEW_LINES).join("\n")}
              {lines.length > PREVIEW_LINES && `\n\n${lines.length - PREVIEW_LINES} more lines`}
            </pre>
          )}
        </div>
      </Group>

      {naming === null ? (
        <Button variant="ghost" className="self-start" onClick={() => setNaming(label)}>
          <BookmarkIcon /> Save these settings
        </Button>
      ) : (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <Label htmlFor="export-name">Name this setup</Label>
          <div className="flex gap-2">
            <Input
              id="export-name"
              autoFocus
              maxLength={40}
              value={naming}
              onChange={(e) => setNaming(e.target.value)}
            />
            <Button type="submit" className="h-11">Save</Button>
            <Button type="button" variant="ghost" className="h-11" onClick={() => setNaming(null)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      <div className="sticky bottom-0 -mx-5 mt-auto flex flex-col gap-2 border-t bg-background/95 px-5 pt-3 pb-3">
        {empty && (
          <p className="text-center text-sm text-muted-foreground">
            {preset === "recipes" || preset === "calendar" ? "Pick at least one recipe." : "Nothing to export yet."}
          </p>
        )}
        {format === "print" ? (
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Button className="h-12" disabled={empty} onClick={print}>
              <PrinterIcon /> Print or save as PDF
            </Button>
            <Button variant="outline" className="h-12" disabled={empty} onClick={copy} aria-label="Copy as text">
              <CopyIcon />
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-[1fr_auto_auto] gap-2">
            {canShare ? (
              <Button className="h-12" disabled={empty} onClick={share}>
                <Share2Icon /> Share
              </Button>
            ) : (
              <Button className="h-12" disabled={empty} onClick={download}>
                <DownloadIcon /> Download
              </Button>
            )}
            {canShare && (
              <Button variant="outline" className="h-12" disabled={empty} onClick={download} aria-label="Download">
                <DownloadIcon />
              </Button>
            )}
            <Button variant="outline" className="h-12" disabled={empty} onClick={copy} aria-label="Copy">
              <CopyIcon />
            </Button>
          </div>
        )}
      </div>

      {printing && out.doc && <PrintPortal doc={out.doc} onePerPage={o.onePerPage} onDone={stopPrinting} />}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Options per preset

function Options({
  preset,
  format,
  o,
  set,
  state,
  now,
}: {
  preset: PresetId;
  format: Format;
  o: ExportOptions;
  set: (patch: Partial<ExportOptions>) => void;
  state: AppState;
  now: number;
}) {
  switch (preset) {
    case "shopping":
      return (
        <Group title="Options">
          <Chips
            value={o.groupBy}
            onChange={(groupBy) => set({ groupBy })}
            options={[
              { id: "aisle", label: "By aisle" },
              { id: "breakfast", label: "By breakfast" },
            ]}
          />
          <Toggle checked={o.batch} onChange={(batch) => set({ batch })} label="Batch-cook tasks" hint="Things to cook ahead, with how long they take" />
          <Toggle checked={o.forWhich} onChange={(forWhich) => set({ forWhich })} label="Say what each item is for" hint="Handy when someone else does the shopping" />
        </Group>
      );
    case "pantry":
      return (
        <Group title="Options">
          <Chips
            value={o.pantryShow}
            onChange={(pantryShow) => set({ pantryShow })}
            options={[
              { id: "all", label: "Everything" },
              { id: "in", label: "In stock" },
              { id: "out", label: "Out or unknown" },
            ]}
          />
          <Toggle checked={o.lastChecked} onChange={(lastChecked) => set({ lastChecked })} label="When each was last checked" />
        </Group>
      );
    case "diary":
      return (
        <Group title="Options">
          <Range o={o} set={set} />
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Columns</p>
            <div className="flex flex-wrap gap-2">
              {DIARY_COLUMNS.filter((c) => c.id !== "note").map((c) => {
                const on = o.diaryColumns.includes(c.id);
                return (
                  <ChipButton
                    key={c.id}
                    on={on}
                    onClick={() =>
                      set({
                        diaryColumns: on
                          ? o.diaryColumns.filter((x) => x !== c.id)
                          : DIARY_COLUMNS.map((d) => d.id).filter((id) => id === c.id || o.diaryColumns.includes(id)),
                      })
                    }
                  >
                    {c.label}
                  </ChipButton>
                );
              })}
            </div>
          </div>
          <NotesToggle o={o} set={set} withColumn />
        </Group>
      );
    case "nutrition":
      return (
        <Group title="Options">
          <Range o={o} set={set} />
          <Chips
            value={o.perDay ? "day" : "breakfast"}
            onChange={(v) => set({ perDay: v === "day" })}
            options={[
              { id: "breakfast", label: "Average per breakfast" },
              { id: "day", label: "Average per day" },
            ]}
          />
          {format !== "csv" && (
            <Toggle checked={o.withDiary} onChange={(withDiary) => set({ withDiary })} label="List each breakfast" />
          )}
        </Group>
      );
    case "patterns":
      return (
        <Group title="Options">
          <Range o={o} set={set} />
        </Group>
      );
    case "recipes":
      return (
        <Group title="Recipes">
          <RecipePicker state={state} value={o.recipeIds} onChange={(recipeIds) => set({ recipeIds })} />
          <Toggle checked={o.recipeNutrition} onChange={(recipeNutrition) => set({ recipeNutrition })} label="Nutrition per serving" />
          <Toggle
            checked={o.notes}
            onChange={(notes) => set({ notes })}
            label="Include your recipe notes"
            hint="Off by default, since notes can be personal"
          />
          {format === "print" && (
            <Toggle checked={o.onePerPage} onChange={(onePerPage) => set({ onePerPage })} label="One recipe per page" />
          )}
        </Group>
      );
    case "calendar":
      return (
        <Group title="Plan">
          <p className="-mt-1 text-sm text-muted-foreground">Tap breakfasts in the order you want to eat them, one per day.</p>
          <RecipePicker ordered state={state} value={o.calendarIds} onChange={(calendarIds) => set({ calendarIds })} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="First breakfast" id="cal-start">
              <Input id="cal-start" type="date" min={ymd(new Date(now))} value={o.start} onChange={(e) => e.target.value && set({ start: e.target.value })} />
            </Field>
            <Field label="Breakfast time" id="cal-time">
              <Input id="cal-time" type="time" value={o.time} onChange={(e) => e.target.value && set({ time: e.target.value })} />
            </Field>
          </div>
          <Toggle checked={o.prepReminder} onChange={(prepReminder) => set({ prepReminder })} label="Prep reminders the night before" hint="Only for breakfasts that need soaking or cooking ahead" />
          {o.prepReminder && (
            <Field label="Reminder time" id="cal-prep">
              <Input id="cal-prep" type="time" value={o.prepTime} onChange={(e) => e.target.value && set({ prepTime: e.target.value })} />
            </Field>
          )}
          {o.calendarIds.length > 0 && (
            <ol className="flex flex-col divide-y rounded-xl border bg-card text-sm">
              {o.calendarIds.map((id, i) => {
                const [y, m, d] = o.start.split("-").map(Number);
                const day = new Date(y, m - 1, d + i);
                return (
                  <li key={`${id}-${i}`} className="flex gap-3 p-3">
                    <span className="w-24 shrink-0 text-muted-foreground">
                      {day.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                    </span>
                    <span className="min-w-0 flex-1">{RECIPE_BY_ID[id]?.name}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </Group>
      );
    case "allergy":
      return (
        <Group title="Options">
          <Field label="Who is this for? (optional)" id="allergy-name">
            <Input id="allergy-name" maxLength={40} placeholder="e.g. Sara" value={o.forName} onChange={(e) => set({ forName: e.target.value })} />
          </Field>
          {state.disliked.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing is on your avoid list yet. Add items under Allergies &amp; dislikes.</p>
          )}
          <Toggle checked={o.safeList} onChange={(safeList) => set({ safeList })} label="List safe breakfasts" />
          <Toggle
            checked={o.tomorrow && !!state.upcoming}
            disabled={!state.upcoming}
            onChange={(tomorrow) => set({ tomorrow })}
            label="Include tomorrow's breakfast"
            hint={state.upcoming ? RECIPE_BY_ID[state.upcoming.recipeId]?.name : "Nothing is planned for tomorrow"}
          />
        </Group>
      );
    case "backup":
      return (
        <Group title="Options">
          <p className="-mt-1 text-sm text-muted-foreground">
            One file with your pantry, cart, your own items, tomorrow&apos;s plan, avoid list and
            every breakfast you&apos;ve logged. Keep it somewhere safe.
          </p>
          <NotesToggle o={o} set={set} />
        </Group>
      );
  }
}

function RecipePicker({
  state,
  value,
  onChange,
  ordered = false,
}: {
  state: AppState;
  value: number[];
  onChange: (ids: number[]) => void;
  ordered?: boolean;
}) {
  const [query, setQuery] = useState("");
  const pool = visibleRecipes(state.disliked);
  const shown = pool.filter((r) => matchesQuery(query, recipeSearchText(r)));
  const favorites = pool.filter((r) => (preferenceScore(state.stats[r.id]) ?? 0) >= 4).map((r) => r.id);
  const tomorrow = state.upcoming?.recipeId;

  function toggle(id: number) {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {tomorrow !== undefined && RECIPE_BY_ID[tomorrow] && (
          <ChipButton on={false} onClick={() => onChange([...new Set([tomorrow, ...value])])}>
            Tomorrow&apos;s
          </ChipButton>
        )}
        {favorites.length > 0 && (
          <ChipButton on={false} onClick={() => onChange([...new Set([...value, ...favorites])])}>
            Favorites ({favorites.length})
          </ChipButton>
        )}
        <ChipButton on={false} onClick={() => onChange(pool.map((r) => r.id))}>
          All {pool.length}
        </ChipButton>
        {value.length > 0 && (
          <ChipButton on={false} onClick={() => onChange([])}>
            Clear
          </ChipButton>
        )}
      </div>
      <Input type="search" aria-label="Search recipes" placeholder="Search recipes" value={query} onChange={(e) => setQuery(e.target.value)} />
      <ul className="flex max-h-72 flex-col divide-y overflow-y-auto overscroll-contain rounded-xl border bg-card">
        {shown.length === 0 && <li className="p-3 text-sm text-muted-foreground">No recipes match.</li>}
        {shown.map((r) => {
          const at = value.indexOf(r.id);
          return (
            <li key={r.id}>
              <label className="flex cursor-pointer items-center gap-3 p-3">
                <Checkbox className="size-5" checked={at >= 0} onCheckedChange={() => toggle(r.id)} />
                <span className="min-w-0 flex-1 text-sm leading-tight">{r.name}</span>
                {ordered && at >= 0 && (
                  <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">Day {at + 1}</span>
                )}
              </label>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">{value.length} selected</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small controls

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</p>
      {children}
    </div>
  );
}

function ChipButton({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm transition-colors",
        on ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function Chips<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <ChipButton key={opt.id} on={opt.id === value} onClick={() => onChange(opt.id)}>
          {opt.label}
        </ChipButton>
      ))}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl border bg-card p-3", disabled && "cursor-not-allowed opacity-60")}>
      <Checkbox className="mt-0.5 size-5" checked={checked} disabled={disabled} onCheckedChange={(v) => onChange(!!v)} />
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

function NotesToggle({ o, set, withColumn }: { o: ExportOptions; set: (p: Partial<ExportOptions>) => void; withColumn?: boolean }) {
  return (
    <Toggle
      checked={o.notes}
      onChange={(notes) =>
        set(
          withColumn
            ? { notes, diaryColumns: notes ? [...new Set([...o.diaryColumns, "note" as const])] : o.diaryColumns.filter((c) => c !== "note") }
            : { notes },
        )
      }
      label="Include rating notes"
      hint="Off by default, since notes can be personal"
    />
  );
}

const RANGES: { id: RangeKind; label: string }[] = [
  { id: "7", label: "7 days" },
  { id: "30", label: "30 days" },
  { id: "90", label: "90 days" },
  { id: "all", label: "All time" },
  { id: "custom", label: "Custom" },
];

function Range({ o, set }: { o: ExportOptions; set: (p: Partial<ExportOptions>) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <Chips value={o.range} onChange={(range) => set({ range })} options={RANGES} />
      {o.range === "custom" && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="From" id="range-from">
            <Input id="range-from" type="date" max={o.to} value={o.from} onChange={(e) => e.target.value && set({ from: e.target.value })} />
          </Field>
          <Field label="To" id="range-to">
            <Input id="range-to" type="date" min={o.from} value={o.to} onChange={(e) => e.target.value && set({ to: e.target.value })} />
          </Field>
        </div>
      )}
    </div>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
