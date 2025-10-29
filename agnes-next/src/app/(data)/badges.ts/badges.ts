// src/app/(data)/badges.ts
export type BadgeTier = { label: 'Bronze'|'Silver'|'Gold'; threshold: number; points: number };
export type Badge = {
  id: string;
  name: string;
  description: string;
  category: 'Core'|'Social'|'Referral'|'Milestone'|'Event'|'Secret';
  icon: string;
  rarity: 'common'|'rare'|'legendary';
  tiers?: BadgeTier[];
};

export const BADGES: Badge[] = [
  { id:'purchase', name:'First Purchase', description:'Buy the book once.', category:'Core', icon:'📘', rarity:'common' },
  { id:'enter', name:'Contest Entry', description:'Enter The Protocol Challenge.', category:'Core', icon:'🎟️', rarity:'common' },
  { id:'post-fb', name:'Post to Facebook', description:'Share once on Facebook.', category:'Social', icon:'📣', rarity:'common',
    tiers:[{label:'Bronze',threshold:1,points:25},{label:'Silver',threshold:5,points:75},{label:'Gold',threshold:10,points:150}] },
  { id:'post-ig', name:'Post to Instagram', description:'Share once on Instagram.', category:'Social', icon:'📸', rarity:'common',
    tiers:[{label:'Bronze',threshold:1,points:25},{label:'Silver',threshold:5,points:75},{label:'Gold',threshold:10,points:150}] },
  { id:'post-tiktok', name:'Post to TikTok', description:'Share once on TikTok.', category:'Social', icon:'🎬', rarity:'common',
    tiers:[{label:'Bronze',threshold:1,points:25},{label:'Silver',threshold:5,points:75},{label:'Gold',threshold:10,points:150}] },
  { id:'post-x', name:'Post to X', description:'Share once on X.', category:'Social', icon:'🕊️', rarity:'common',
    tiers:[{label:'Bronze',threshold:1,points:25},{label:'Silver',threshold:5,points:75},{label:'Gold',threshold:10,points:150}] },
  { id:'post-truth', name:'Post to Truth Social', description:'Share once on Truth Social.', category:'Social', icon:'🗽', rarity:'common',
    tiers:[{label:'Bronze',threshold:1,points:25},{label:'Silver',threshold:5,points:75},{label:'Gold',threshold:10,points:150}] },
  { id:'email-friends', name:'Email Friends', description:'Send at least one invite.', category:'Core', icon:'✉️', rarity:'common',
    tiers:[{label:'Bronze',threshold:1,points:50},{label:'Silver',threshold:5,points:150},{label:'Gold',threshold:10,points:350}] },
  { id:'associate', name:'Associate Publisher', description:'Join the program.', category:'Referral', icon:'🏷️', rarity:'rare' },
  { id:'post-tap', name:'Post on TAP Social', description:'Post on The Agnes Protocol social feed.', category:'Social', icon:'🗨️', rarity:'common' },
  { id:'trivia', name:'Trivia Player', description:'Play one trivia round.', category:'Core', icon:'🧩', rarity:'common',
    tiers:[{label:'Bronze',threshold:1,points:20},{label:'Silver',threshold:5,points:100},{label:'Gold',threshold:10,points:250}] },
  { id:'ref-purchase', name:'Referral Purchase', description:'A friend bought using your code.', category:'Referral', icon:'🔗', rarity:'rare',
    tiers:[{label:'Bronze',threshold:1,points:200},{label:'Silver',threshold:3,points:600},{label:'Gold',threshold:10,points:2500}] },
  { id:'top-25', name:'Leaderboard Top 25', description:'Reach Top 25.', category:'Milestone', icon:'🏆', rarity:'legendary' },
  { id:'streak-3', name:'3-Day Streak', description:'Be active 3 days in a row.', category:'Milestone', icon:'🔥', rarity:'rare' },
  { id:'streak-7', name:'7-Day Streak', description:'Be active 7 days in a row.', category:'Milestone', icon:'🔥', rarity:'legendary' },
  { id:'share-5', name:'Share x5', description:'Any platform, 5 total shares.', category:'Milestone', icon:'📢', rarity:'rare' },
  { id:'share-10', name:'Share x10', description:'Any platform, 10 total shares.', category:'Milestone', icon:'📢', rarity:'rare' },
  { id:'share-25', name:'Share x25', description:'Any platform, 25 total shares.', category:'Milestone', icon:'📢', rarity:'legendary' },
  { id:'launch-week', name:'Launch Week', description:'Participate during Launch Week.', category:'Event', icon:'🚀', rarity:'rare' },
  { id:'puzzle', name:'Puzzle Bomb Solver', description:'Crack a Puzzle Bomb.', category:'Secret', icon:'🧠', rarity:'legendary' },
  { id:'find-jody', name:'Find Jody', description:'Discover the hidden clue.', category:'Secret', icon:'🕵️', rarity:'legendary' },
];
