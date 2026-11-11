import { Suspense } from "react";
import { SearchView } from "./view";

export const metadata = { title: "Search" };

export default function Page() {
  return (
    <Suspense>
      <SearchView />
    </Suspense>
  );
}
