"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";

export type SavedLogin = {
  email: string;
  password: string;
};

type CredentialsPlugin = {
  list(): Promise<{ accounts: SavedLogin[] }>;
  save(options: SavedLogin): Promise<void>;
  remove(options: { email: string }): Promise<void>;
};

declare global {
  interface Window {
    __KIDLOOP_NATIVE__?: boolean;
  }
}

const NativeCredentials = registerPlugin<CredentialsPlugin>("KidLoopCredentials");

export function isSavedLoginShell() {
  return typeof window !== "undefined" && (window.__KIDLOOP_NATIVE__ === true || Capacitor.isNativePlatform());
}

export function supportsSavedLogins() {
  return isSavedLoginShell();
}

export async function listSavedLogins(): Promise<SavedLogin[]> {
  if (!supportsSavedLogins()) return [];
  const result = await NativeCredentials.list();
  return result.accounts;
}

export async function saveLogin(account: SavedLogin) {
  if (!supportsSavedLogins()) return;
  await NativeCredentials.save(account);
}

export async function removeSavedLogin(email: string) {
  if (!supportsSavedLogins()) return;
  await NativeCredentials.remove({ email });
}
