import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { supabase } from "../lib/supabase";

export default function Login() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-navy">
            VoiceDesk AI
          </h1>
          <p className="text-sm text-body mt-2">
            Sign in to manage your AI receptionist
          </p>
        </div>

        <div className="bg-white rounded-lg p-8 shadow-elevated-md border border-border">
          <Auth
            supabaseClient={supabase}
            appearance={{
              theme: ThemeSupa,
              variables: {
                default: {
                  colors: {
                    brand: "#533afd",
                    brandAccent: "#4434d4",
                    inputBorder: "#e5edf5",
                    inputBorderFocus: "#533afd",
                    inputBorderHover: "#b9b9f9",
                  },
                  borderWidths: { buttonBorderWidth: "1px", inputBorderWidth: "1px" },
                  radii: { borderRadiusButton: "6px", inputBorderRadius: "6px" },
                  fonts: { bodyFontFamily: "Inter, system-ui, sans-serif" },
                },
              },
            }}
            providers={[]}
            redirectTo={window.location.origin}
          />
        </div>
      </div>
    </div>
  );
}
