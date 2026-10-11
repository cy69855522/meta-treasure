import { codexHome } from "@/lib/codex-config";
import { listDeepRadarModels } from "@/features/deep-radar/lib/codex-llm";
import { getSettings } from "@/features/deep-radar/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = getSettings();
  return Response.json({
    home: codexHome(),
    options: await listDeepRadarModels(),
    selectedId: settings.codexModelId,
  });
}
