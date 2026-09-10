import {
  listStewardMemoryNotes,
  listStewardMessagesPage,
} from "@/lib/db";
import { CHAT_HISTORY_PAGE_SIZE } from "@/lib/constants";
import { StewardPanel } from "@/components/steward-panel";

export const dynamic = "force-dynamic";

export default function StewardPage() {
  const historyPage = listStewardMessagesPage({
    limit: CHAT_HISTORY_PAGE_SIZE,
  });

  return (
    <StewardPanel
      initialMessages={historyPage.messages}
      initialHasMore={historyPage.hasMore}
      initialNotes={listStewardMemoryNotes()}
    />
  );
}
