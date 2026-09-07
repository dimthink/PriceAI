"use client";

import { useMemo, useSyncExternalStore } from "react";

export type ClientSearchParamUpdates = Record<string, string | null>;

const CLIENT_SEARCH_PARAMS_CHANGE_EVENT = "priceai:client-search-params-change";

function subscribeToClientSearchParams(onStoreChange: () => void): () => void {
  window.addEventListener("popstate", onStoreChange);
  window.addEventListener(CLIENT_SEARCH_PARAMS_CHANGE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("popstate", onStoreChange);
    window.removeEventListener(CLIENT_SEARCH_PARAMS_CHANGE_EVENT, onStoreChange);
  };
}

function readClientSearch(): string {
  return window.location.search;
}

export function useClientSearchParams(initialSearch: string): URLSearchParams {
  const normalizedInitialSearch = initialSearch
    ? `?${initialSearch.replace(/^\?/, "")}`
    : "";
  const currentSearch = useSyncExternalStore(
    subscribeToClientSearchParams,
    readClientSearch,
    () => normalizedInitialSearch,
  );

  return useMemo(() => new URLSearchParams(currentSearch), [currentSearch]);
}

export function buildClientSearchUrl(
  pathname: string,
  currentSearch: string,
  updates: ClientSearchParamUpdates,
): string {
  const params = new URLSearchParams(currentSearch);

  for (const [key, value] of Object.entries(updates)) {
    if (value === null) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
  }

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function replaceClientSearchParams(
  pathname: string,
  updates: ClientSearchParamUpdates,
): boolean {
  const nextUrl = buildClientSearchUrl(pathname, window.location.search, updates);
  const currentUrl = `${window.location.pathname}${window.location.search}`;

  if (currentUrl === nextUrl) return false;

  window.history.replaceState(window.history.state, "", nextUrl);
  window.dispatchEvent(new Event(CLIENT_SEARCH_PARAMS_CHANGE_EVENT));
  return true;
}
