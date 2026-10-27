/* The curriculum: every session, test and check-up in one fixed order. He cannot move to the next step until the current one is
   finished, however long that takes. A missed step is shown again on the next step day. Videos are encouraged, not required.
   Starts on CURR_START and runs on CURR_DAYS (Tuesday and Friday). The weekly plan fitted around his real schedule is below. */
const CURR_START = "2026-11-03";
const CURR_DAYS = [1, 4];

/* A week built around Tristan's real schedule: Rens practice Saturday and Sunday (2 hours each), skills training Sunday (1.5 hours)
   and Thursday (1.5 hours), and the league game on Wednesday. School comes first and he needs rest, so Monday is a real rest day,
   Tuesday and Friday carry the curriculum sessions, and the busy days only get tiny optional notes. */
const fitBlocks = (day, from) => DEFAULT_DATA.days[from].blocks.map((b, i) => [`${day}-${i}`, b.title, b.minutes, b.text]);
const WEEK_FIT = {
  days: {
    Monday: { theme: "Rest day", cue: "No basketball today. Homework, family time, and bed on time.", blocks: [
      ["monday-0", "Rest day: no basketball", 0, "Nothing from the app today. Rest his legs after a big weekend. Check this off when the day is done."]] },
    Tuesday: { theme: "Create a passing lane", cue: "Homework first. Read the defender before choosing a receiver. The league game is tomorrow, so keep the pace controlled and get to bed early.", blocks: fitBlocks("tuesday", 1) },
    Wednesday: { theme: "League game day", cue: "Warm up, drink water, and trust your training. Nothing extra today.", blocks: [
      ["wednesday-0", "Pre-game touches (optional)", 5, "A few minutes of loose handle and 10 free throws. Pick one read to make in the game."]] },
    Thursday: { theme: "Skills training day", cue: "Skills training is the work today. Homework, dinner and sleep come next.", blocks: [
      ["thursday-0", "Film note (optional)", 5, "After skills training, write one thing you learned and one thing to fix in Film notes (Videos tab)."]] },
    Friday: { theme: "Apply and measure", cue: "Homework first. Measure progress against his own baseline and choose one improvement for next week. Easy on the legs: a big weekend is coming.", blocks: fitBlocks("friday", 5) },
    Saturday: { theme: "Rens practice day", cue: "Practice is the work today. Log how your body feels and one thing you improved.", blocks: [
      ["saturday-5", "Cooldown and log", 5, COOLDOWN]] },
    Sunday: { theme: "Practice and skills day", cue: "A big day on the court. Let Tristan answer first. School first, then one practical adjustment.", blocks: [
      ["sunday-2", "Review the training log", 5, "Choose one skill and one leadership goal for next week."],
      ["sunday-3", "Parent-player check-in", 10, "Relaxed check-in. Start with school: what is due this week. Then plan around team events, sleep, and recovery."]] }
  },
  events: [
    { title: "Rens practice", type: "practice", dow: 5, minutes: 120 },
    { title: "Rens practice", type: "practice", dow: 6, minutes: 120 },
    { title: "Skills training", type: "other", dow: 6, minutes: 90 },
    { title: "League game", type: "game", dow: 2, minutes: 60 },
    { title: "Skills training", type: "other", dow: 3, minutes: 90 }
  ]
};

/* Tutorials for every part of every step. Each list holds YouTube ids from the video library (SUGGESTED_VIDEOS). The app shows them
   under "How to do it" when a block's details are open. Picked from titles; not all have been watched. */
const TUT_WARM = ["jKsnNE7M0Kw", "J5WBx2NoqcU", "yZGe_lad1_Y"];
const TUT_SESSION = {
  "Accuracy and control": { Handle: ["bvy5u3YgDEk", "K5f-E_-if00", "Uz2cdC5ANFY"], "Pass and decide": ["Rmw8dYqckBY", "jgqdv9ySjYM", "5T2yntRCzx8"], Shoot: ["2hY6fQmPJQ8", "ecPyYg53Rw8", "PPIPlRPBdtA"], "Finish / defend": ["3jj9l2oqcxA", "ya_SODOUHTQ", "MDbS4QF71Iw"] },
  "Create a passing lane": { Handle: ["M3yD-gwjoRE", "3KSaDrCZZoA", "hF6XdlhEX44"], "Pass and decide": ["lt3BlXJx3do", "3GAGMEIjztI", "6hqiGRbP-jM"], Shoot: ["UPNOLB3_fqw", "glny6njDcbE", "xvkvOxsHax0"], "Finish / defend": ["9XWs6g4zlCg", "LVrOh4KLNyQ", "a9-g_bY7Ouk"] },
  "Weaker hand and footwork": { Handle: ["ya_SODOUHTQ", "6wkVChd5-_s", "Ar6QuexqWno"], "Pass and decide": ["Rmw8dYqckBY", "szkISZ7z0XU", "k1XStmZZl-Y"], Shoot: ["2hY6fQmPJQ8", "ecPyYg53Rw8", "Hrjl91zw7mQ"], "Finish / defend": ["3jj9l2oqcxA", "cnRQ5Bxa1yM", "9XWs6g4zlCg"] },
  "Handle pressure": { Handle: ["kuqbIpqb9KM", "j3x9aTGClf8", "eqOIdubWo0E"], "Pass and decide": ["hF6XdlhEX44", "HMZPUFhDkN4", "j3x9aTGClf8"], Shoot: ["ecPyYg53Rw8", "UPNOLB3_fqw", "n3BYwfVRxlY"], "Finish / defend": ["sEn1sQkmJkI", "LVrOh4KLNyQ", "3vtaGR4b2K8"] },
  "Transition decisions": { Handle: ["fF4lJ9GQMO8", "K5f-E_-if00", "3KSaDrCZZoA"], "Pass and decide": ["vpXqZTiUKyc", "M9Acu3IlURQ", "NTtjogEDS6o"], Shoot: ["ecPyYg53Rw8", "u7E7LPvciiQ", "lnuZNZPDvaY"], "Finish / defend": ["MDbS4QF71Iw", "29RMd-nFVYA", "cnRQ5Bxa1yM"] },
  "Apply and measure": { Handle: ["bvy5u3YgDEk", "vBOVInWyIb8", "EfbXuBd_6Q4"], "Pass and decide": ["jMLd9jupKkE", "ZXbfHpmOUoU", "Y7OKE3t-D24"], Shoot: ["PPIPlRPBdtA", "3Y1Eebbq1U4", "Z-SbJIJAFOE"], "Finish / defend": ["s46bufWWJ6c", "PFY5mw-iYHo", "3vtaGR4b2K8"] }
};
const TUT_LADDER = {
  "handle:1": ["J2E4qVaU574", "znK1nTqRcHk"], "handle:2": ["bvy5u3YgDEk", "Uz2cdC5ANFY"], "handle:3": ["K5f-E_-if00", "M3yD-gwjoRE"], "handle:4": ["kuqbIpqb9KM", "eqOIdubWo0E"], "handle:5": ["eqOIdubWo0E", "HMZPUFhDkN4"],
  "pass:1": ["Rmw8dYqckBY", "jgqdv9ySjYM"], "pass:2": ["lt3BlXJx3do", "Rmw8dYqckBY"], "pass:3": ["Rmw8dYqckBY", "3GAGMEIjztI"], "pass:4": ["btpuIhLSg8E", "TbovZAZRRL4", "Rktjg7UUNBg"], "pass:5": ["Rmw8dYqckBY", "mDQ-JeC03Xc"],
  "shoot:1": ["2hY6fQmPJQ8", "lnuZNZPDvaY"], "shoot:2": ["PPIPlRPBdtA", "n3BYwfVRxlY"], "shoot:3": ["ecPyYg53Rw8", "PdgeX_3pB0A"], "shoot:4": ["UPNOLB3_fqw", "glny6njDcbE"], "shoot:5": ["u7E7LPvciiQ", "OgV5-B-MqNo", "Q41TgJNulYY"],
  "finish:1": ["3jj9l2oqcxA", "ya_SODOUHTQ"], "finish:2": ["MDbS4QF71Iw", "c82BaMNul8U"], "finish:3": ["cnRQ5Bxa1yM"], "finish:4": ["6WcJ0fPn21g", "29RMd-nFVYA", "mU1Z3mZAbEU"], "finish:5": ["sEn1sQkmJkI", "3vtaGR4b2K8"],
  "iq:1": ["XW2SmmhjeZY", "3GAGMEIjztI"], "iq:2": ["j16FCb3BbDs", "DJNSm1HSRCQ"], "iq:3": ["XW2SmmhjeZY", "F-ZxJMFH7zw", "btpuIhLSg8E"], "iq:4": ["8QKTtMerPbs", "07TeLBrYPm0"], "iq:5": ["SOMNv7e7MaQ", "TWhcYeqsZNo"]
};
const TUT_FILM = ["iDOxVSkPMLc", "DJNSm1HSRCQ", "j16FCb3BbDs"];
const TUT_LEAD = ["SOMNv7e7MaQ", "TWhcYeqsZNo", "c_cJh_qIDts"];

const CURRICULUM = (() => {
  const TOTAL = 4 * 7 + 1;
  const names = { handle: "Ball handling", pass: "Passing and reads", shoot: "Shooting", finish: "Finishing and defense", iq: "Court IQ" };
  const order = ["handle", "pass", "shoot", "finish", "iq"];
  const codeOf = (id) => { const v = DEFAULT_DATA.videos.find((x) => x.id === id); return v ? v.code : id; };
  const wtPlan = [[0, 1], [2, 3], [4, 5], [6]];
  const rungBlocks = (n, rung) => order.map((k, i) => ({ id: `c${n}-r${i}`, title: `Ladder test: ${names[k]}`, minutes: 4, text: `Rung ${rung} of 5. ${LADDER[k][rung - 1]} Check this off only when he has passed it.`, act: `ladder:${k}:${rung}`, tut: TUT_LADDER[`${k}:${rung}`] }));
  const steps = [];
  let n = 0;
  for (let cw = 1; cw <= 4; cw++) {
    for (let s = 0; s < 6; s++) {
      n++;
      const day = DEFAULT_DATA.days[s];
      const blocks = day.blocks.map((b, i) => ({ id: `c${n}-${i}`, title: b.title, minutes: b.minutes, text: b.text, tut: /warm/i.test(b.title) ? TUT_WARM : (TUT_SESSION[day.theme] || {})[b.title] }));
      blocks.push({ id: `c${n}-v`, title: "Watch (optional)", minutes: 10, optional: true, text: `Watch ${day.videoIds.map(codeOf).join(", ")} in the Videos tab, or play the Advanced videos non-stop. Not required, but video builds the mental side of the game.` });
      steps.push({ n, cw, kind: "session", theme: `Step ${n} of ${TOTAL}: ${day.theme}`, name: day.theme, cue: day.cue, videoIds: day.videoIds, blocks });
    }
    n++;
    const blocks = rungBlocks(n, cw);
    wtPlan[cw - 1].forEach((j) => { const w = DECISIONS[j]; blocks.push({ id: `c${n}-w${j}`, title: `Watch, then try it: ${w.title}`, minutes: 10, optional: true, text: `Watch it in Videos, Watch then try it. Then: ${w.drill}`, act: `wt:${w.id}` }); });
    blocks.push({ id: `c${n}-f`, title: "Film note", minutes: 5, text: "Write one thing he saw and one thing to fix in Film notes (Videos tab).", tut: TUT_FILM });
    blocks.push({ id: `c${n}-l`, title: "Leadership goal", minutes: 5, text: `Pick a leadership goal in Log, Leadership this week, and use it at the next practice and game. An idea: ${LEAD_PROMPTS[(cw - 1) % LEAD_PROMPTS.length].toLowerCase()}.`, tut: TUT_LEAD });
    blocks.push({ id: `c${n}-x`, title: "Look back", minutes: 5, text: "Talk it over with a parent: what got better, and what is the next thing to work on?" });
    steps.push({ n, cw, kind: "checkup", theme: `Step ${n} of ${TOTAL}: Check-up ${cw}`, name: `Check-up ${cw}`, cue: "A check-up day. Prove the skills from the last six sessions. Take your time and do not rush.", videoIds: [], blocks });
  }
  n++;
  const fin = rungBlocks(n, 5);
  fin.push({ id: `c${n}-x`, title: "Look back at the whole curriculum", minutes: 10, text: "Talk it over with a parent: what has changed since the first step, and what do you want to work on next?" });
  steps.push({ n, cw: 4, kind: "final", theme: `Step ${n} of ${TOTAL}: Finish line`, name: "Finish line", cue: "The last step. Prove the top rung of every skill.", videoIds: [], blocks: fin });
  return steps;
})();
