/* Health Accountability — shared habit tracker for two (or more) friends. */

const db = supabase.createClient(APP_CONFIG.supabaseUrl, APP_CONFIG.supabaseKey);
const $app = document.getElementById("app");

const EMOJI_OPTIONS = ["💪", "🏃", "🦁", "🐺", "🔥", "⚡", "🥦", "🏆"];
const HISTORY_DAYS = 60;

let members = [];
let habits = [];
let checkins = [];
let notes = [];
let selectedEmoji = EMOJI_OPTIONS[0];
let refreshTimer = null;

/* ---------- date helpers (local timezone) ---------- */

function dayStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function today() {
  return dayStr(new Date());
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

/* ---------- identity ---------- */

function myId() {
  return localStorage.getItem("member_id");
}

function me() {
  return members.find((m) => m.id === myId()) || null;
}

/* ---------- data loading ---------- */

async function loadAll() {
  const since = dayStr(daysAgo(HISTORY_DAYS));
  const [mRes, hRes, cRes, nRes] = await Promise.all([
    db.from("members").select("*").order("created_at"),
    db.from("habits").select("*").eq("active", true).order("sort"),
    db.from("checkins").select("*").gte("day", since),
    db.from("notes").select("*").gte("day", dayStr(daysAgo(7))),
  ]);
  const err = mRes.error || hRes.error || cRes.error || nRes.error;
  if (err) throw err;
  members = mRes.data;
  habits = hRes.data;
  checkins = cRes.data;
  notes = nRes.data;
}

async function refresh() {
  try {
    await loadAll();
    render();
  } catch (err) {
    renderError(err);
  }
}

/* ---------- derived data ---------- */

function doneSet(memberId, day) {
  return new Set(
    checkins
      .filter((c) => c.member_id === memberId && c.day === day)
      .map((c) => c.habit_id)
  );
}

function streak(memberId) {
  const days = new Set(
    checkins.filter((c) => c.member_id === memberId).map((c) => c.day)
  );
  let count = 0;
  const d = new Date();
  // Today doesn't break the streak until it's over.
  if (!days.has(dayStr(d))) d.setDate(d.getDate() - 1);
  while (days.has(dayStr(d))) {
    count++;
    d.setDate(d.getDate() - 1);
  }
  return count;
}

function noteFor(memberId, day) {
  return notes.find((n) => n.member_id === memberId && n.day === day) || null;
}

/* ---------- actions ---------- */

async function toggleHabit(habitId) {
  const existing = checkins.find(
    (c) => c.member_id === myId() && c.habit_id === habitId && c.day === today()
  );
  try {
    if (existing) {
      const { error } = await db.from("checkins").delete().eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await db
        .from("checkins")
        .insert({ member_id: myId(), habit_id: habitId, day: today() });
      if (error) throw error;
    }
    await refresh();
  } catch (err) {
    renderError(err);
  }
}

async function saveNote() {
  const body = document.getElementById("note-input").value.trim();
  try {
    const { error } = await db
      .from("notes")
      .upsert(
        { member_id: myId(), day: today(), body },
        { onConflict: "member_id,day" }
      );
    if (error) throw error;
    await refresh();
  } catch (err) {
    renderError(err);
  }
}

async function joinAs(memberId) {
  localStorage.setItem("member_id", memberId);
  await refresh();
}

async function createProfile(ev) {
  ev.preventDefault();
  const name = document.getElementById("join-name").value.trim();
  if (!name) return;
  try {
    const { data, error } = await db
      .from("members")
      .insert({ name, emoji: selectedEmoji })
      .select()
      .single();
    if (error) throw error;
    localStorage.setItem("member_id", data.id);
    await refresh();
  } catch (err) {
    if (err.code === "23505") {
      alert("That name is already taken — tap it in the list above instead.");
    } else {
      renderError(err);
    }
  }
}

function switchProfile() {
  localStorage.removeItem("member_id");
  render();
}

/* ---------- rendering ---------- */

function esc(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function renderError(err) {
  const msg = err?.message || String(err);
  const tableMissing =
    err?.code === "42P01" || /relation .* does not exist/i.test(msg) || /schema cache/i.test(msg);
  if (tableMissing) {
    $app.innerHTML = `
      <div class="notice">
        <h2>🛠️ One-time database setup needed</h2>
        <p>The app is deployed, but the database tables haven't been created yet.</p>
        <p>Open your <strong>Supabase dashboard</strong> → <strong>SQL Editor</strong>,
        paste in the contents of <code>supabase/setup.sql</code> from the GitHub repo,
        and click <strong>Run</strong>. Then refresh this page.</p>
      </div>`;
  } else {
    $app.innerHTML = `
      <div class="notice">
        <h2>⚠️ Couldn't reach the database</h2>
        <p>${esc(msg)}</p>
        <p><button class="btn-primary" onclick="refresh()">Try again</button></p>
      </div>`;
  }
}

function renderJoin() {
  const whoButtons = members
    .map(
      (m) => `
      <button class="who-btn" onclick="joinAs('${m.id}')">
        <span class="big">${esc(m.emoji)}</span>
        <span>I'm ${esc(m.name)}</span>
      </button>`
    )
    .join("");

  const emojiButtons = EMOJI_OPTIONS.map(
    (e) =>
      `<button type="button" class="emoji-opt ${e === selectedEmoji ? "selected" : ""}"
        onclick="pickEmoji('${e}')">${e}</button>`
  ).join("");

  $app.innerHTML = `
    <header>
      <h1>💪 Health Accountability</h1>
      <p class="date">Who's checking in?</p>
    </header>
    <div class="join">
      ${members.length ? `<h2>Pick yourself</h2><div class="who-list">${whoButtons}</div>` : ""}
      <h2>${members.length ? "Or join as someone new" : "Create your profile"}</h2>
      <form onsubmit="createProfile(event)">
        <input type="text" id="join-name" placeholder="Your first name" maxlength="30" required>
        <div class="emoji-row">${emojiButtons}</div>
        <button type="submit" class="btn-primary">Let's go</button>
      </form>
    </div>`;
}

function pickEmoji(e) {
  selectedEmoji = e;
  document.querySelectorAll(".emoji-opt").forEach((btn) => {
    btn.classList.toggle("selected", btn.textContent === e);
  });
}

function renderMemberCard(m) {
  const isMe = m.id === myId();
  const done = doneSet(m.id, today());
  const rows = habits
    .map((h) => {
      const isDone = done.has(h.id);
      return `
      <div class="habit-row ${isDone ? "done" : ""} ${isMe ? "tappable" : ""}"
           ${isMe ? `onclick="toggleHabit('${h.id}')"` : ""}>
        <div class="check">${isDone ? "✓" : ""}</div>
        <span class="icon">${esc(h.icon)}</span>
        <span class="label">${esc(h.label)}</span>
      </div>`;
    })
    .join("");

  const note = noteFor(m.id, today());
  let noteHtml = "";
  if (isMe) {
    noteHtml = `
      <div class="note-box">
        <textarea id="note-input" placeholder="How did today go? (optional)">${note ? esc(note.body) : ""}</textarea>
        <button class="save-note" onclick="saveNote()">Save note</button>
      </div>`;
  } else if (note && note.body) {
    noteHtml = `<div class="note-display">“${esc(note.body)}”</div>`;
  }

  return `
    <div class="member-card">
      <div class="card-head">
        <span class="big">${esc(m.emoji)}</span>
        <span class="name">${esc(m.name)}${isMe ? " (you)" : ""}</span>
        <span class="tally">${done.size}/${habits.length} today</span>
      </div>
      ${rows}
      ${noteHtml}
    </div>`;
}

function renderWeekGrid() {
  const days = [];
  for (let i = 6; i >= 0; i--) days.push(daysAgo(i));

  const header = days
    .map((d, i) => {
      const label =
        i === 6 ? "Today" : d.toLocaleDateString(undefined, { weekday: "short" });
      return `<th>${label}</th>`;
    })
    .join("");

  const rows = sortedMembers()
    .map((m) => {
      const cells = days
        .map((d) => {
          const n = doneSet(m.id, dayStr(d)).size;
          const total = habits.length || 1;
          const ratio = n / total;
          let level = "";
          if (n > 0 && ratio < 0.5) level = "l1";
          else if (n > 0 && ratio < 1) level = "l2";
          else if (n > 0) level = "l3";
          return `<td class="day-cell ${level}">${n || "·"}</td>`;
        })
        .join("");
      return `<tr><td class="who-cell">${esc(m.emoji)} ${esc(m.name)}</td>${cells}</tr>`;
    })
    .join("");

  return `<table class="week-table"><tr><th></th>${header}</tr>${rows}</table>`;
}

function sortedMembers() {
  // You first, then everyone else in join order.
  return [...members].sort((a, b) => (b.id === myId()) - (a.id === myId()));
}

function render() {
  // Don't re-render while the user is typing a note or their name.
  const active = document.activeElement;
  if (active && (active.id === "note-input" || active.id === "join-name")) {
    return;
  }

  if (!me()) {
    renderJoin();
    return;
  }

  const streakCards = sortedMembers()
    .map(
      (m) => `
      <div class="streak-card">
        <div class="who">${esc(m.emoji)} ${esc(m.name)}</div>
        <div class="num">🔥 ${streak(m.id)} <span>day${streak(m.id) === 1 ? "" : "s"}</span></div>
      </div>`
    )
    .join("");

  const cards = sortedMembers().map(renderMemberCard).join("");

  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  $app.innerHTML = `
    <header>
      <h1>💪 Health Accountability</h1>
      <p class="date">${dateLabel}</p>
    </header>
    <div class="streaks">${streakCards}</div>
    <p class="section-title">Today's check-in</p>
    ${cards}
    <p class="section-title">Last 7 days</p>
    ${renderWeekGrid()}
    <div class="foot">
      <p>Keep each other honest. 🤝</p>
      <button onclick="switchProfile()">Switch profile</button>
    </div>`;
}

/* ---------- boot ---------- */

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refresh();
});

refreshTimer = setInterval(() => {
  if (!document.hidden) refresh();
}, 60000);

refresh();
