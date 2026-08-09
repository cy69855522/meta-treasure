import { getSettings } from "@/lib/settings";
import { SettingsPanel } from "@/components/settings-panel";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return <SettingsPanel initialSettings={getSettings()} />;
}
