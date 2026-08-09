export type ThemeMode = "light" | "dark" | "system";

export type AppSettings = {
  theme: ThemeMode;
};

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "light",
};
