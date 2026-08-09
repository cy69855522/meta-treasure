import {
  listStewardMemoryNotes,
  listStewardMessages,
} from "@/lib/db";
import { StewardPanel } from "@/components/steward-panel";

export const dynamic = "force-dynamic";

export default function StewardPage() {
  return (
    <StewardPanel
      initialMessages={listStewardMessages()}
      initialNotes={listStewardMemoryNotes()}
    />
  );
}
