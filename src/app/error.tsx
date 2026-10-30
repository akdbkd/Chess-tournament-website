"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="page empty">
      <h1>Let’s reset the position.</h1>
      <p>We couldn’t load this page. Your saved entries are safe.</p>
      <button className="button" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
