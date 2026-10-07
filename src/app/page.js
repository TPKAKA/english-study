import { readSupabaseConfig } from "../lib/supabase/supabase-config.js";
import StudyApp from "../components/study/study-app.js";

export default function Page() {
  // Only the public Project URL and publishable key cross the server/client boundary.
  const config = readSupabaseConfig(process.env, { allowMissing: process.env.NODE_ENV !== "production" });
  return <StudyApp config={config} />;
}
