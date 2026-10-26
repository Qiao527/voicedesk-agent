/** Build-time configuration. Vite inlines `import.meta.env` values. */

const env = import.meta.env;

/**
 * Demo mode serves realistic sample data from the browser, with no server or
 * Supabase project. Used for the public preview and screenshots.
 */
export const IS_DEMO = env.VITE_DEMO_MODE === "true" || (!env.VITE_SUPABASE_URL && env.MODE !== "test");

export const API_BASE = env.VITE_API_URL ? `${String(env.VITE_API_URL).replace(/\/$/, "")}/api` : "/api";

export const SUPABASE_URL = env.VITE_SUPABASE_URL as string | undefined;
export const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const REPO_URL = "https://github.com/Qiao527/voicedesk-agent";
export const AUTHOR = { name: "Zaiqiao Long", url: "https://github.com/Qiao527" };
