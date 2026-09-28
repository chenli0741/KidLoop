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

const NativeCredentials = registerPlugin<CredentialsPlugin>("KidLoopCredentials");

export function supportsSavedLogins() {
  return Capacitor.isNativePlatform();
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
