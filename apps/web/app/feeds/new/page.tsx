import { Suspense } from "react";
import { Builder } from "./builder";

export const metadata = { title: "Feed builder" };

export default function Page() {
  return (
    <Suspense>
      <Builder />
    </Suspense>
  );
}
