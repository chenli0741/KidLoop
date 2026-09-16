import { Capacitor, registerPlugin } from "@capacitor/core";
const auth = registerPlugin<{ authorize(options: { url: string }): Promise<{ url: string }> }>("KidLoopMailAuth");
export const isNativeMail = () => Capacitor.isNativePlatform();
export const supportsNativeMail = () => Capacitor.getPlatform() === "ios" && Capacitor.isPluginAvailable("KidLoopMailAuth");
export async function authorizeNativeMail(url: string, state: string) {
  if (!supportsNativeMail()) throw new Error("UPDATE_APP");
  const result = new URL((await auth.authorize({ url })).url);
  if (result.protocol !== "kidloop-mail:" || result.hostname !== "complete" || result.searchParams.get("state") !== state || result.searchParams.has("failed")) throw new Error("AUTH_CANCELLED");
}
