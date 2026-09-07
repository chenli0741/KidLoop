"use client";

import { TriangleAlert } from "lucide-react";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="error-page">
      <div>
        <TriangleAlert size={30} />
        <h1>Something went wrong</h1>
        <p>KidLoop could not load this workspace. Check the database connection and try again.</p>
        <button className="button primary" type="button" onClick={reset}>Try again</button>
      </div>
    </div>
  );
}
