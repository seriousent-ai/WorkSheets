// Default content taken from "Tristan's Weekly Basketball Training Plan".
// Everything here can be edited, added to or deleted inside the app.
const WARMUP = "Use V1: easy movement, balance, agility, and controlled stopping/landing. Have a coach teach the routine.";
const COOLDOWN = "Easy cooldown; log one improvement, one challenge, and how his body feels.";

function mk(day, theme, cue, vids, blocks) {
  return {
    id: "d-" + day.toLowerCase(),
    name: day,
    theme,
    cue,
    videoIds: vids,
    blocks: blocks.map((b, i) => ({ id: `${day.toLowerCase()}-${i}`, title: b[0], minutes: b[1], text: b[2] })),
  };
}

const DEFAULT_DATA = {
  version: 1,
  days: [
    mk("Monday", "Accuracy and control", "Balanced feet, accurate pass. Move after passing according to team spacing.", ["v2", "v3", "v4"], [
      ["Warm-up", 10, WARMUP],
      ["Handle", 10, "3 min stationary control with both hands; 3 min walking/jogging with eyes up; 4 min changes of pace into controlled stops."],
      ["Pass and decide", 18, "4 min chest passes; 4 min bounce passes; 5 min pivot-and-pass; 5 min one-hand push passes, splitting time equally between hands. Aim at the receiver's ready hands."],
      ["Shoot", 12, "4 min close-range form; 5 min catch-and-shoot from comfortable spots; 3 min free throws."],
      ["Finish / defend", 7, "2 min right-hand layups; 2 min left-hand layups; 3 min attacks from either side into a controlled finish."],
      ["Cooldown and log", 3, COOLDOWN],
    ]),
    mk("Tuesday", "Create a passing lane", "Read the defender before choosing a receiver. Call the play early.", ["v5", "v6", "v7"], [
      ["Warm-up", 10, WARMUP],
      ["Handle", 10, "3 min crossover into acceleration; 3 min retreat and reattack; 4 min protected dribbling with either hand."],
      ["Pass and decide", 18, "5 min passes off a dribble with both hands; 5 min lead a moving partner; 8 min 3-on-1 drive-and-kick reads. With one partner, practice drive-and-kick delivery and relocation."],
      ["Shoot", 12, "4 min one-dribble pull-ups in both directions; 5 min pass-relocate-catch-and-shoot; 3 min free throws."],
      ["Finish / defend", 7, "2 min mirror a partner; 2 min controlled closeouts; 3 min short 1-on-1 possessions with rest and role changes."],
      ["Cooldown and log", 3, COOLDOWN],
    ]),
    mk("Wednesday", "Weaker hand and footwork", "Control first, then speed. Keep eyes up and protect the pivot foot.", ["v2", "v4", "v8"], [
      ["Warm-up", 10, WARMUP],
      ["Handle", 10, "5 min weaker-hand control; 5 min changes of pace and direction using both hands. Keep the session moderate."],
      ["Pass and decide", 18, "4 min weaker-hand push passes; 4 min step-around passes; 5 min controlled stop into a legal pivot and pass; 5 min pass fakes into accurate deliveries."],
      ["Shoot", 12, "5 min close-range form; 4 min short catch-and-shoot attempts; 3 min free throws."],
      ["Finish / defend", 7, "2 min right-hand layups; 2 min left-hand layups; 3 min balanced stops and finishes. Add light defense only when footwork is consistent."],
      ["Cooldown and log", 3, COOLDOWN],
    ]),
    mk("Thursday", "Handle pressure", "Create space without rushing. Stay between the ball and basket on defense.", ["v7", "v9"], [
      ["Warm-up", 10, WARMUP],
      ["Handle", 10, "3 min protected dribbling; 3 min retreat dribbles; 4 min advancing against controlled partner pressure."],
      ["Pass and decide", 18, "5 min pivot-and-pass against light pressure; 5 min pass fakes; 8 min two offensive players versus one defender. Keep an outlet available; rotate roles."],
      ["Shoot", 12, "4 min catch-and-shoot with a controlled closeout; 5 min one-dribble shots into open space; 3 min free throws."],
      ["Finish / defend", 7, "2 min mirror a partner; 2 min close out and contain the first dribble; 3 min short 1-on-1 possessions, rotating and resting."],
      ["Cooldown and log", 3, COOLDOWN],
    ]),
    mk("Friday", "Transition decisions", "See the defender and receiver together. Deliver the ball into the receiver's path.", ["v4", "v10"], [
      ["Warm-up", 10, WARMUP],
      ["Handle", 10, "3 min advance with eyes up; 3 min change pace; 4 min decelerate into a balanced stop."],
      ["Pass and decide", 18, "5 min outlet catches and pivots; 5 min lead a moving receiver; 8 min live 2-on-1. Pass when the defender commits; finish when the lane stays open."],
      ["Shoot", 12, "4 min close-range form; 5 min transition catches into balanced shots; 3 min free throws."],
      ["Finish / defend", 7, "2 min right-hand layups; 2 min left-hand layups; 3 min finishing after a controlled approach from either side."],
      ["Cooldown and log", 3, COOLDOWN],
    ]),
    mk("Saturday", "Apply and measure", "Measure progress against his own baseline. Choose one improvement for next week.", ["v6", "v7", "v10"], [
      ["Warm-up", 10, WARMUP],
      ["Handle", 10, "5 min repeat a familiar cone course using both hands; 5 min correct the week's most common ball-handling mistake."],
      ["Pass and decide", 18, "5 min accuracy check: 20 passes, 10 with each hand; 13 min live 2-on-1 or 3-on-3 with timely passing and ball protection. Count good decisions even when a teammate misses."],
      ["Shoot", 12, "25 attempts from five fixed spots, then 10 free throws. Stop at 12 minutes and record actual attempts if needed. Use spare time for a favorite shooting game."],
      ["Finish / defend", 7, "2 min defensive mirroring; 2 min controlled closeouts; 3 min short 1-on-1 possessions with rest."],
      ["Cooldown and log", 3, COOLDOWN],
    ]),
    {
      id: "d-sunday",
      name: "Sunday",
      theme: "60 minutes off court",
      cue: "Let Tristan answer first. Finish with one practical adjustment.",
      videoIds: ["v6", "v10", "v11"],
      blocks: [
        { id: "sunday-0", title: "Watch film", minutes: 20, text: "Watch a short game segment or selected training clips. Pause before the point guard decides." },
        { id: "sunday-1", title: "Discuss three possessions", minutes: 15, text: "A good decision, a missed opportunity, and a defensive play. Sketch the passing options." },
        { id: "sunday-2", title: "Review the training log", minutes: 10, text: "Choose one skill and one communication goal for next week." },
        { id: "sunday-3", title: "Parent-player check-in", minutes: 15, text: "Relaxed check-in. Plan around school, team events, sleep, and recovery." },
      ],
    },
  ],
  videos: [
    { id: "v1", code: "V1", title: "Warm-up", url: "https://jr.nba.com/warm-up/", note: "Choose Middle School Warm-Ups. Daily movement preparation." },
    { id: "v2", code: "V2", title: "Jump Stop, Pivot and Pass", url: "https://jr.nba.com/video/jump-stop-pivot-pass-drill/", note: "Monday / Wednesday: stop, establish a legal pivot, pass." },
    { id: "v3", code: "V3", title: "Form Shooting - Pacers / Jr. NBA", url: "https://www.nba.com/pacers/video/jr-nba-week-drill-3-form-shooting", note: "Monday / Wednesday: close-range shooting mechanics." },
    { id: "v4", code: "V4", title: "Layups - Jr. NBA", url: "https://jr.nba.com/video/layups/", note: "Monday / Wednesday / Friday: finishing fundamentals." },
    { id: "v5", code: "V5", title: "One-Hand Pound Passing", url: "https://www.breakthroughbasketball.com/drills/onehandpound", note: "Tuesday: practice passing off a dribble with each hand." },
    { id: "v6", code: "V6", title: "3-on-1 Drive and Kick Reaction", url: "https://jr.nba.com/basketball-practice-plans/all-star/page/3/", note: "Scroll to the named drill. Four players; Tuesday / Saturday." },
    { id: "v7", code: "V7", title: "Closing Time", url: "https://jr.nba.com/video/closing-time/", note: "Tuesday / Thursday / Saturday: controlled closeouts." },
    { id: "v8", code: "V8", title: "Retreat-Crossover Dribble", url: "https://www.usab.com/videos/2017/02/dribbling-on-the-move-retreat-crossover-dribble", note: "Wednesday: change direction after creating space." },
    { id: "v9", code: "V9", title: "Retreat Dribble Drill", url: "https://jr.nba.com/video/retreat-dribble-drill/", note: "Thursday: protect the ball and escape pressure." },
    { id: "v10", code: "V10", title: "Fundamentals of a 2-on-1 Fast Break", url: "https://jr.nba.com/basketball-practice-plans/starter/page/7/", note: "Scroll to Team Concepts. Friday / Saturday; three players." },
    { id: "v11", code: "V11", title: "Defending the 2-on-1 Drill", url: "https://jr.nba.com/video/defending-the-2-on-1-drill/", note: "Sunday: understand the defender's choices." },
  ],
  links: [
    { id: "l1", title: "Jr. NBA at Home", url: "https://jr.nba.com/jrnbaathome/", note: "Free at-home drills and videos." },
    { id: "l3", title: "NY Rens website", url: "https://nyrhoops.org/", note: "Team schedule, news and updates." },
    { id: "l2", title: "NBA/USA Basketball Youth Guidelines", url: "https://youthguidelines.nba.com/", note: "Workload and recovery guidance." },
  ],
  notes: [
    { id: "n1", title: "How to use this plan", text: "This is a flexible weekly template, not seven extra workouts on top of team basketball. Team practice, mandatory training, and games replace that day's individual session. Move sessions around the team calendar; do not make up missed workouts by doubling up.\n\nMonday-Saturday sessions total 60 minutes, including short water breaks and video viewing. Sunday is an off-court learning and recovery block. If watching a clip takes three minutes, subtract those minutes from the matching skill block." },
    { id: "n2", title: "Equipment and people", text: "Team-appropriate basketball, hoop, four cones or markers, water, and this plan. A partner improves passing practice; live 2-on-1 needs three players, and 3-on-1 needs four. Alone, use a safe wall target for mechanics." },
    { id: "n3", title: "Workload and recovery", text: "Preserve at least one day off organized basketball each week. NBA/USA Basketball guidance sets a maximum of 10 organized basketball hours weekly for ages 12-14; this is a ceiling, not a target. Practices, games, and structured training all count. Twelve-year-olds should get 9-12 hours of sleep. Add recovery after demanding tournaments; stop for pain or unusual fatigue." },
    { id: "n4", title: "Film questions", text: "Let Tristan answer first: Who is open? What did the defender do? Where should the pass arrive? Was there a scoring opportunity? Use his own game footage when available, and finish with one practical adjustment." },
    { id: "n5", title: "Four-week development cycle", text: "Week 1: Learn the drills and record a baseline. Keep passing distances and shooting spots repeatable.\nWeek 2: Repeat the same work with better accuracy, balance, and eyes-up control.\nWeek 3: If control is consistent, add movement or light defensive pressure.\nWeek 4: Add live reads and compare the same baseline measures. Review with his coach.\n\nIncrease one difficulty at a time. Extend shooting range only when mechanics remain comfortable. Repeat a week when needed; there is no deadline for reaching a particular level." },
    { id: "n6", title: "Point guard habits", text: "Scan before the catch. Pass to a teammate's advantage. Use either hand. Stay balanced. Cut or relocate after passing. Communicate early using the team's terminology. Recognize when to score as well as when to pass." },
    { id: "n7", title: "Coach and parent check-in", text: "Ask his Rens coach: \"What one skill or habit would make Tristan more effective in your system?\" Make that the next priority. Praise decisions, effort, and improvement. Let Tristan choose a favorite drill regularly, and keep the log brief.\n\nSolo adjustment: Practice passing accuracy and footwork with safe wall targets; self-toss for shooting. Save live decision work for sessions with teammates or a coach. Do not treat cones as a substitute for reading a defender." },
  ],
  rewards: [
    { id: "r1", title: "Pick Sunday's film clip", xp: 100, note: "Tristan chooses what we watch together." },
    { id: "r2", title: "Family movie night", xp: 300, note: "Tristan picks the movie." },
    { id: "r3", title: "New training gear", xp: 600, note: "Choose something together." },
    { id: "r4", title: "Special basketball outing", xp: 1000, note: "A pro or college game, or a day out." },
  ],
  logs: {},
  weekly: {},
  profile: {
    name: "Tristan Alvarez-Vasquez",
    team: "NY Rens",
    league: "12U Jr. EYBL",
    subtitle: "12U NY Rens Jr. EYBL | Age 12 | Intermediate | Point guard development",
    priority: "Read the floor, pass accurately with either hand, protect the ball, and build a dependable shot. Develop finishing, defense, and communication alongside those skills.",
  },
};
