import type { CapacitorConfig } from "@capacitor/cli";

const serverUrl =
  process.env.CAPACITOR_SERVER_URL?.trim() || "https://kid-loop.vercel.app";

const config: CapacitorConfig = {
  appId: "com.chenli0741.kidloop",
  appName: "KidLoop",
  webDir: "ios-web",
  backgroundColor: "#F5F7F5",
  loggingBehavior: "debug",
  ios: {
    scheme: "KidLoop",
    // The web layout owns safe-area padding; avoid a second native inset.
    contentInset: "never",
    preferredContentMode: "mobile",
    allowsLinkPreview: false,
  },
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith("http://"),
  },
};

export default config;
