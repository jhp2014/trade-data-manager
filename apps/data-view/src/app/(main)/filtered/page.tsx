import { loadDeckAction } from "@/actions/deck";
import { FilteredClient } from "./FilteredClient";

interface PageProps {
  searchParams: { dir?: string };
}

export default async function FilteredPage({ searchParams }: PageProps) {
  const subDir = searchParams.dir ?? "";
  const initialResult = await loadDeckAction(subDir);

  return <FilteredClient initialSubDir={subDir} initialResult={initialResult} />;
}
