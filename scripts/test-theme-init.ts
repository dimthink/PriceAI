import { runInNewContext } from "node:vm";
import { THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from "../src/lib/theme-init.js";

type ThemeMode = "light" | "dark";

type ThemeCase = {
  name: string;
  pathname?: string;
  stored?: string | null;
  prefersDark?: boolean;
  hasMatchMedia?: boolean;
  storageError?: boolean;
  mediaError?: boolean;
  expected: ThemeMode;
  expectedStorageReads?: number;
  expectedMediaReads?: number;
};

const cases: ThemeCase[] = [
  {
    name: "stored dark overrides a light system preference",
    stored: "dark",
    prefersDark: false,
    expected: "dark",
  },
  {
    name: "stored light overrides a dark system preference",
    stored: "light",
    prefersDark: true,
    expected: "light",
  },
  {
    name: "missing storage follows a dark system preference",
    stored: null,
    prefersDark: true,
    expected: "dark",
  },
  {
    name: "missing storage follows a light system preference",
    stored: null,
    prefersDark: false,
    expected: "light",
  },
  {
    name: "an unknown stored value preserves the light fallback",
    stored: "system",
    prefersDark: true,
    expected: "light",
  },
  {
    name: "missing matchMedia preserves the light fallback",
    stored: null,
    hasMatchMedia: false,
    expected: "light",
    expectedMediaReads: 0,
  },
  {
    name: "a storage error falls back to light",
    storageError: true,
    expected: "light",
    expectedMediaReads: 0,
  },
  {
    name: "a media query error falls back to light",
    stored: null,
    mediaError: true,
    expected: "light",
  },
  {
    name: "the admin root stays light",
    pathname: "/admin",
    stored: "dark",
    prefersDark: true,
    expected: "light",
    expectedStorageReads: 0,
    expectedMediaReads: 0,
  },
  {
    name: "admin child routes stay light",
    pathname: "/admin/api-transit",
    stored: "dark",
    prefersDark: true,
    expected: "light",
    expectedStorageReads: 0,
    expectedMediaReads: 0,
  },
  {
    name: "the existing admin prefix behavior remains compatible",
    pathname: "/administrator",
    stored: "dark",
    prefersDark: true,
    expected: "light",
    expectedStorageReads: 0,
    expectedMediaReads: 0,
  },
];

for (const testCase of cases) {
  const result = runThemeInit(testCase);
  assertEqual(result.theme, testCase.expected, `${testCase.name}: data-theme`);
  assertEqual(result.colorScheme, testCase.expected, `${testCase.name}: colorScheme`);

  if (testCase.expectedStorageReads !== undefined) {
    assertEqual(result.storageReads, testCase.expectedStorageReads, `${testCase.name}: storage reads`);
  }
  if (testCase.expectedMediaReads !== undefined) {
    assertEqual(result.mediaReads, testCase.expectedMediaReads, `${testCase.name}: media query reads`);
  }
}

assertEqual(
  THEME_INIT_SCRIPT.toLowerCase().includes("</script"),
  false,
  "the inline theme script must not contain a closing script tag",
);

console.log("theme init test passed");

function runThemeInit(testCase: ThemeCase) {
  const dataset: Record<string, string> = {};
  const style: Record<string, string> = {};
  let storageReads = 0;
  let mediaReads = 0;

  const windowObject: {
    location: { pathname: string };
    localStorage: { getItem: (key: string) => string | null };
    matchMedia?: (query: string) => { matches: boolean };
  } = {
    location: { pathname: testCase.pathname ?? "/" },
    localStorage: {
      getItem(key) {
        storageReads += 1;
        assertEqual(key, THEME_STORAGE_KEY, `${testCase.name}: storage key`);
        if (testCase.storageError) throw new Error("storage unavailable");
        return testCase.stored ?? null;
      },
    },
  };

  if (testCase.hasMatchMedia !== false) {
    windowObject.matchMedia = (query) => {
      mediaReads += 1;
      assertEqual(query, "(prefers-color-scheme: dark)", `${testCase.name}: media query`);
      if (testCase.mediaError) throw new Error("media query unavailable");
      return { matches: testCase.prefersDark ?? false };
    };
  }

  runInNewContext(THEME_INIT_SCRIPT, {
    document: { documentElement: { dataset, style } },
    window: windowObject,
  });

  return {
    theme: dataset.theme,
    colorScheme: style.colorScheme,
    storageReads,
    mediaReads,
  };
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`);
  }
}
