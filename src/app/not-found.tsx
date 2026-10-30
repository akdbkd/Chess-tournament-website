import Link from "next/link";
export default function NotFound() {
  return (
    <div className="page empty">
      <h1>A move off the board.</h1>
      <p>This page doesn’t exist. Let’s find your next tournament.</p>
      <Link className="button" href="/tournaments">
        Back to the arena
      </Link>
    </div>
  );
}
