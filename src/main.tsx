import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "framer-motion";
import { EventType, PublicClientApplication, type AuthenticationResult } from "@azure/msal-browser";
import { dalamJendelaAuth, msalConfig } from "./auth/msal";
import { pasangMsal } from "./lib/graph";
import App from "./App";
import "./styles.css";

const msal = new PublicClientApplication(msalConfig);

async function mulai() {
  // Di dalam popup login / iframe SSO: biarkan MSAL di jendela induk yang
  // membaca respons dari URL, jangan render aplikasi.
  if (dalamJendelaAuth()) return;

  await msal.initialize();

  const akun = msal.getAllAccounts();
  if (!msal.getActiveAccount() && akun.length > 0) msal.setActiveAccount(akun[0]!);

  msal.addEventCallback((e) => {
    if ((e.eventType === EventType.LOGIN_SUCCESS || e.eventType === EventType.SSO_SILENT_SUCCESS) && e.payload) {
      msal.setActiveAccount((e.payload as AuthenticationResult).account);
    }
  });

  pasangMsal(msal);

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <MotionConfig reducedMotion="user">
        <App msal={msal} />
      </MotionConfig>
    </StrictMode>,
  );
}

void mulai();
