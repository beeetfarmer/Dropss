const STORAGE_KEY = "dropss-accent";

export interface AccentPreset {
  name: string;
  hsl: string;
}

export const ACCENT_PRESETS: AccentPreset[] = [
  { name: "Teal", hsl: "160 84% 39%" },
  { name: "Purple", hsl: "270 70% 60%" },
  { name: "Blue", hsl: "210 80% 55%" },
  { name: "Rose", hsl: "350 80% 55%" },
  { name: "Amber", hsl: "35 90% 55%" },
  { name: "Green", hsl: "140 70% 42%" },
];

const CSS_VARS = [
  "--primary",
  "--ring",
  "--badge-ep",
  "--status-available",
  "--sidebar-primary",
  "--sidebar-ring",
] as const;

export function getSavedAccent(): string {
  return localStorage.getItem(STORAGE_KEY) || ACCENT_PRESETS[0].hsl;
}

export function saveAccent(hsl: string) {
  localStorage.setItem(STORAGE_KEY, hsl);
}

export function applyAccent(hsl?: string) {
  const value = hsl || getSavedAccent();
  const root = document.documentElement;
  for (const v of CSS_VARS) {
    root.style.setProperty(v, value);
  }
}
