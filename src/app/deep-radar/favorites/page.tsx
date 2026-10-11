import { FavoritesBoard } from "@/features/deep-radar/components/favorites-board";
import { listFavoriteSnapshots } from "@/features/deep-radar/lib/service";
import { wireRuntime } from "@/features/deep-radar/lib/runtime";

export const dynamic = "force-dynamic";

export default async function FavoritesPage() {
  wireRuntime();
  const favorites = listFavoriteSnapshots(200);
  return <FavoritesBoard favorites={favorites} />;
}
