export function csvCell(value: unknown) {
  let s = String(value ?? "");
  if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
export function standingsCsv(text: string) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\r?\n/);
  if (
    lines.shift()?.trim().toLowerCase() !==
    "username,score,wins,draws,losses,tiebreak"
  )
    throw new Error(
      "Expected header: username,score,wins,draws,losses,tiebreak",
    );
  return lines.filter(Boolean).map((line, i) => {
    const [username, ...values] = line.split(",").map((v) => v.trim());
    if (
      !/^[\w-]{3,25}$/.test(username) ||
      values.length !== 5 ||
      values.some(
        (v) => v === "" || !Number.isFinite(Number(v)) || Number(v) < 0,
      )
    )
      throw new Error("Invalid row " + (i + 2));
    const [score, wins, draws, losses, tiebreak] = values.map(Number);
    if (![wins, draws, losses].every(Number.isInteger))
      throw new Error("Wins, draws, and losses must be whole numbers.");
    return { username, score, wins, draws, losses, tiebreak };
  });
}
export function downloadCsv(
  name: string,
  headers: string[],
  rows: unknown[][],
) {
  const text = [headers, ...rows]
    .map((r) => r.map(csvCell).join(","))
    .join("\r\n");
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
