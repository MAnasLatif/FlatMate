// Every test runs west of UTC. There, a date-only string read as UTC midnight
// shows the day before, so date bugs that hide in Pakistan's UTC+5 show up.
export default function globalSetup() {
  process.env.TZ = 'America/Los_Angeles';
}
