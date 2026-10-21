/* AXZIO | ARRIVAL — Identity State Card image export.
   Draws the card onto a canvas (1080 × 1350, portrait) with no external
   dependencies, then shares it (mobile share sheet) or downloads it. */

const W = 1080;
const H = 1350;
const PAD = 88;
const INK = "#f4f7ff";
const CYAN = "#56c8f5";
const FAINT = "rgba(214, 228, 255, 0.62)";

function wrapLines(ctx, text, maxWidth) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawCard(ctx, session) {
  // Background — deep navy with a soft luminous glow near the top.
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0a1434");
  bg.addColorStop(0.55, "#060b20");
  bg.addColorStop(1, "#04060f");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W / 2, 120, 40, W / 2, 120, 620);
  glow.addColorStop(0, "rgba(86, 200, 245, 0.20)");
  glow.addColorStop(1, "rgba(86, 200, 245, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Sparse starfield (deterministic so the export is stable).
  let seed = 42;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  for (let i = 0; i < 90; i++) {
    const x = rand() * W;
    const y = rand() * H;
    const r = rand() * 1.6 + 0.4;
    ctx.globalAlpha = 0.12 + rand() * 0.4;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // AXZIO triangle mark.
  ctx.strokeStyle = CYAN;
  ctx.lineWidth = 7;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(W / 2, 92);
  ctx.lineTo(W / 2 + 44, 168);
  ctx.lineTo(W / 2 - 44, 168);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(W / 2, 128);
  ctx.lineTo(W / 2 + 21, 166);
  ctx.lineTo(W / 2 - 21, 166);
  ctx.closePath();
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.fillStyle = INK;
  ctx.font = "600 40px system-ui, -apple-system, 'Segoe UI', sans-serif";
  ctx.fillText("A X Z I O   |   A R R I V A L", W / 2, 238);

  ctx.fillStyle = FAINT;
  ctx.font = "400 27px system-ui, -apple-system, 'Segoe UI', sans-serif";
  const when = new Date(session.cardAt || session.createdAt);
  ctx.fillText(
    when.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }) +
      "  ·  " +
      when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
    W / 2,
    288
  );

  // Divider.
  ctx.strokeStyle = "rgba(86, 200, 245, 0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, 336);
  ctx.lineTo(W - PAD, 336);
  ctx.stroke();

  const fields = [
    ["MY CURRENT STATE", session.stateNote ? `${session.state} — ${session.stateNote}` : session.state],
    ["WHAT MATTERS TO ME", session.matters],
    ["WHAT I CHOOSE", session.choice],
    ["MY NEXT ACTION", session.step],
  ];

  ctx.textAlign = "left";
  let y = 416;
  for (const [label, value] of fields) {
    ctx.fillStyle = CYAN;
    ctx.font = "600 25px system-ui, -apple-system, 'Segoe UI', sans-serif";
    ctx.fillText(label, PAD, y);
    y += 52;
    ctx.fillStyle = INK;
    ctx.font = "500 43px system-ui, -apple-system, 'Segoe UI', sans-serif";
    const lines = wrapLines(ctx, value, W - PAD * 2).slice(0, 3);
    for (const line of lines) {
      ctx.fillText(line, PAD, y);
      y += 56;
    }
    y += 44;
  }

  // Closing.
  ctx.textAlign = "center";
  ctx.fillStyle = INK;
  ctx.font = "600 46px system-ui, -apple-system, 'Segoe UI', sans-serif";
  ctx.fillText("L I V E   Y O U R   L E G E N D", W / 2, H - 148);
  ctx.fillStyle = FAINT;
  ctx.font = "400 25px system-ui, -apple-system, 'Segoe UI', sans-serif";
  ctx.fillText("AXZIO by NE3ULA", W / 2, H - 100);
}

export async function exportCardImage(session) {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  drawCard(ctx, session);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Could not render the card image.");
  const file = new File([blob], "axzio-arrival-card.png", { type: "image/png" });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title: "AXZIO | ARRIVAL — my Identity State Card" });
    return "shared";
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "axzio-arrival-card.png";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return "downloaded";
}
