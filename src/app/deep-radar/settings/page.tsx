import { getSettings } from "@/features/deep-radar/lib/settings";
import { SettingsPanel } from "@/features/deep-radar/components/settings-panel";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return <SettingsPanel initial={getSettings()} />;
}
