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

const CURRICULUM = (() => {
  const TOTAL = 4 * 7 + 1;
  const names = { handle: "Ball handling", pass: "Passing and reads", shoot: "Shooting", finish: "Finishing and defense", iq: "Court IQ" };
  const order = ["handle", "pass", "shoot", "finish", "iq"];
  const codeOf = (id) => { const v = DEFAULT_DATA.videos.find((x) => x.id === id); return v ? v.code : id; };
  const wtPlan = [[0, 1], [2, 3], [4, 5], [6]];
  const rungBlocks = (n, rung) => order.map((k, i) => ({ id: `c${n}-r${i}`, title: `Ladder test: ${names[k]}`, minutes: 4, text: `Rung ${rung} of 5. ${LADDER[k][rung - 1]} Check this off only when he has passed it.`, act: `ladder:${k}:${rung}` }));
  const steps = [];
  let n = 0;
  for (let cw = 1; cw <= 4; cw++) {
    for (let s = 0; s < 6; s++) {
      n++;
      const day = DEFAULT_DATA.days[s];
      const blocks = day.blocks.map((b, i) => ({ id: `c${n}-${i}`, title: b.title, minutes: b.minutes, text: b.text }));
      blocks.push({ id: `c${n}-v`, title: "Watch (optional)", minutes: 10, optional: true, text: `Watch ${day.videoIds.map(codeOf).join(", ")} in the Videos tab, or play the Advanced videos non-stop. Not required, but video builds the mental side of the game.` });
      steps.push({ n, cw, kind: "session", theme: `Step ${n} of ${TOTAL}: ${day.theme}`, name: day.theme, cue: day.cue, videoIds: day.videoIds, blocks });
    }
    n++;
    const blocks = rungBlocks(n, cw);
    wtPlan[cw - 1].forEach((j) => { const w = DECISIONS[j]; blocks.push({ id: `c${n}-w${j}`, title: `Watch, then try it: ${w.title}`, minutes: 10, optional: true, text: `Watch it in Videos, Watch then try it. Then: ${w.drill}`, act: `wt:${w.id}` }); });
    blocks.push({ id: `c${n}-f`, title: "Film note", minutes: 5, text: "Write one thing he saw and one thing to fix in Film notes (Videos tab)." });
    blocks.push({ id: `c${n}-l`, title: "Leadership goal", minutes: 5, text: `Pick a leadership goal in Log, Leadership this week, and use it at the next practice and game. An idea: ${LEAD_PROMPTS[(cw - 1) % LEAD_PROMPTS.length].toLowerCase()}.` });
    blocks.push({ id: `c${n}-x`, title: "Look back", minutes: 5, text: "Talk it over with a parent: what got better, and what is the next thing to work on?" });
    steps.push({ n, cw, kind: "checkup", theme: `Step ${n} of ${TOTAL}: Check-up ${cw}`, name: `Check-up ${cw}`, cue: "A check-up day. Prove the skills from the last six sessions. Take your time and do not rush.", videoIds: [], blocks });
  }
  n++;
  const fin = rungBlocks(n, 5);
  fin.push({ id: `c${n}-x`, title: "Look back at the whole curriculum", minutes: 10, text: "Talk it over with a parent: what has changed since the first step, and what do you want to work on next?" });
  steps.push({ n, cw: 4, kind: "final", theme: `Step ${n} of ${TOTAL}: Finish line`, name: "Finish line", cue: "The last step. Prove the top rung of every skill.", videoIds: [], blocks: fin });
  return steps;
})();
