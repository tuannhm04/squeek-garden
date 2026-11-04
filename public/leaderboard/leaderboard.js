import { seasonEndsAt, seasonId } from '../engine.js';
import { api } from '../wallet.js';

const $ = id => document.getElementById(id);
const NOTE = {
  live: 'The server plays every Live garden from real wheel rounds and works out its score, so these numbers cannot be edited from a browser.',
  practice: 'Demo rounds are simulated and the browser reports the score, so this board is for fun and does not count towards Live.',
};
let board = 'live', back = 0;

const short = a => `${a.slice(0, 6)}…${a.slice(-4)}`;

async function show() {
  $('tLive').setAttribute('aria-pressed', board === 'live');
  $('tPractice').setAttribute('aria-pressed', board === 'practice');
  $('tThis').setAttribute('aria-pressed', back === 0);
  $('tLast').setAttribute('aria-pressed', back === 1);
  $('title').textContent = `${board === 'live' ? 'Live' : 'Practice'} ${back ? 'last week' : 'this week'}`;
  $('note').textContent = NOTE[board];
  const end = seasonEndsAt(seasonId());
  $('ends').textContent = back ? 'This week is over and its scores are final.' : `Scores lock on ${new Date(end).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.`;
  $('board').hidden = true; $('empty').hidden = true; $('mine').hidden = true;
  try {
    const d = await api(`/api/leaderboard?board=${board}&back=${back}`);
    $('rows').replaceChildren(...d.rows.map(r => {
      const tr = document.createElement('tr');
      if (r.me) tr.className = 'me';
      for (const text of [r.rank, r.me ? `${short(r.address)} (you)` : short(r.address), r.harvests, r.score.toLocaleString()]) {
        const td = document.createElement('td'); td.textContent = text; tr.append(td);
      }
      return tr;
    }));
    $('board').hidden = !d.rows.length;
    if (!d.rows.length) { $('empty').hidden = false; $('empty').textContent = 'No scores yet. Connect a wallet in the garden and pick a plant to be first.'; }
    if (d.mine && !d.rows.some(r => r.me)) { $('mine').hidden = false; $('mine').textContent = `You are ranked ${d.mine.rank} with ${d.mine.score.toLocaleString()} points.`; }
  } catch (e) { $('empty').hidden = false; $('empty').textContent = e.message; }
}

$('tLive').onclick = () => { board = 'live'; show(); };
$('tPractice').onclick = () => { board = 'practice'; show(); };
$('tThis').onclick = () => { back = 0; show(); };
$('tLast').onclick = () => { back = 1; show(); };
$('fav').href = window.Pixel.sprite('moonmoss');
show();
