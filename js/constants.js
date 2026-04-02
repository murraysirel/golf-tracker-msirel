// ─────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────

export const PAGES = ['home','round','live','stats','leaderboard','practice','players','competition','comp-score','group-settings','feed'];

// Source: USGA Handicap Research (2023), R&A Golf Around the World Report (2023).
// Replace with group-derived averages once dataset exceeds 200 rounds.
export const HANDICAP_BENCHMARKS = {
  "scratch": { avgVsPar: 0,  fir: 68, gir: 62, puttsPerHole: 1.72, birdiesPerRound: 3.8, doublesPerRound: 0.4 },
  "0-5":     { avgVsPar: 3,  fir: 63, gir: 55, puttsPerHole: 1.78, birdiesPerRound: 2.8, doublesPerRound: 0.7 },
  "6-10":    { avgVsPar: 6,  fir: 57, gir: 44, puttsPerHole: 1.82, birdiesPerRound: 1.9, doublesPerRound: 1.2 },
  "11-15":   { avgVsPar: 9,  fir: 51, gir: 34, puttsPerHole: 1.86, birdiesPerRound: 1.3, doublesPerRound: 1.8 },
  "16-20":   { avgVsPar: 13, fir: 44, gir: 24, puttsPerHole: 1.91, birdiesPerRound: 0.8, doublesPerRound: 2.6 },
  "21-28":   { avgVsPar: 18, fir: 37, gir: 16, puttsPerHole: 1.96, birdiesPerRound: 0.4, doublesPerRound: 3.4 },
};

export function getBenchmark(handicapIndex) {
  if (handicapIndex == null) return HANDICAP_BENCHMARKS["16-20"];
  const h = Math.abs(handicapIndex);
  if (h <= 0) return HANDICAP_BENCHMARKS["scratch"];
  if (h <= 5) return HANDICAP_BENCHMARKS["0-5"];
  if (h <= 10) return HANDICAP_BENCHMARKS["6-10"];
  if (h <= 15) return HANDICAP_BENCHMARKS["11-15"];
  if (h <= 20) return HANDICAP_BENCHMARKS["16-20"];
  return HANDICAP_BENCHMARKS["21-28"];
}

export const TC = {
  blue:   {l:'Blue',   d:'#5dade2'},
  yellow: {l:'Yellow', d:'#f4d03f'},
  white:  {l:'White',  d:'#f0e8d0'},
  red:    {l:'Red',    d:'#e74c3c'},
  black:  {l:'Black',  d:'#2c2c2c'}
};

export const COURSES = [
  {name:'Croham Hurst Golf Club',loc:'Croydon, Surrey',def:'blue',tees:{
    blue:  {pars_per_hole:[4,4,4,4,3,5,3,5,4,4,3,4,3,4,4,3,4,4],rating:67.5,slope:114,yardage:5770},
    yellow:{pars_per_hole:[4,4,4,4,3,5,3,5,4,5,3,4,3,4,4,3,4,4],rating:69.2,slope:118,yardage:6094},
    white: {pars_per_hole:[4,4,4,4,3,5,3,5,4,5,3,4,3,4,4,3,4,4],rating:70.2,slope:121,yardage:6370},
    red:   {pars_per_hole:[4,4,4,4,3,5,3,5,4,5,3,4,3,4,4,3,4,4],rating:67.4,slope:114,yardage:5641}
  }},
  {name:'St Andrews - Old Course',loc:'Fife, Scotland',def:'white',tees:{
    white: {pars_per_hole:[4,4,4,4,5,4,4,3,4,4,3,4,4,5,5,4,4,4],rating:73.1,slope:132,yardage:6721},
    yellow:{pars_per_hole:[4,4,4,4,5,4,4,3,4,4,3,4,4,5,5,4,4,4],rating:71.5,slope:127,yardage:6566}
  }},
  {name:'Wentworth - West Course',loc:'Surrey, England',def:'yellow',tees:{
    white: {pars_per_hole:[4,4,3,4,4,4,4,3,5,4,4,5,3,4,5,4,4,4],rating:74.7,slope:141,yardage:6957},
    yellow:{pars_per_hole:[4,4,3,4,4,4,4,3,5,4,4,5,3,4,5,4,4,4],rating:72.5,slope:135,yardage:6644}
  }},
  {name:'Sunningdale - Old Course',loc:'Berkshire, England',def:'yellow',tees:{
    white: {pars_per_hole:[4,4,3,4,4,4,4,4,4,4,4,3,4,4,5,4,4,5],rating:72.5,slope:130,yardage:6568},
    yellow:{pars_per_hole:[4,4,3,4,4,4,4,4,4,4,4,3,4,4,5,4,4,5],rating:70.5,slope:126,yardage:6341}
  }},
  {name:'Royal Birkdale',loc:'Southport, England',def:'white',tees:{
    white: {pars_per_hole:[4,4,4,3,4,5,3,4,4,4,4,3,4,3,5,4,5,4],rating:75.4,slope:140,yardage:7156},
    yellow:{pars_per_hole:[4,4,4,3,4,5,3,4,4,4,4,3,4,3,5,4,5,4],rating:73.0,slope:135,yardage:6848}
  }},
  {name:'Royal Portrush',loc:'Antrim, N. Ireland',def:'white',tees:{
    white: {pars_per_hole:[4,5,4,4,4,3,5,3,5,4,4,3,5,4,3,4,4,4],rating:76.3,slope:145,yardage:7317},
    yellow:{pars_per_hole:[4,5,4,4,4,3,5,3,5,4,4,3,5,4,3,4,4,4],rating:73.5,slope:138,yardage:7012}
  }},
  {name:'Royal County Down',loc:'Down, N. Ireland',def:'white',tees:{
    white: {pars_per_hole:[4,4,4,4,4,3,5,4,3,4,4,4,4,5,3,4,4,4],rating:74.0,slope:134,yardage:7186},
    yellow:{pars_per_hole:[4,4,4,4,4,3,5,4,3,4,4,4,4,5,3,4,4,4],rating:71.5,slope:128,yardage:6870}
  }},
  {name:'Gleneagles - King\'s Course',loc:'Perthshire, Scotland',def:'yellow',tees:{
    white: {pars_per_hole:[4,4,4,3,4,4,4,3,4,4,3,4,4,4,3,4,4,4],rating:71.3,slope:130,yardage:6790},
    yellow:{pars_per_hole:[4,4,4,3,4,4,4,3,4,4,3,4,4,4,3,4,4,4],rating:69.5,slope:124,yardage:6471}
  }},
  {name:'Augusta National',loc:'Georgia, USA',def:'white',tees:{
    white:{pars_per_hole:[4,5,4,3,4,3,4,5,4,4,4,3,5,4,4,3,4,4],rating:76.2,slope:148,yardage:7510}
  }},
  {name:'TPC Sawgrass',loc:'Florida, USA',def:'blue',tees:{
    blue: {pars_per_hole:[4,5,3,4,4,4,4,3,5,4,4,4,3,5,4,5,3,4],rating:74.9,slope:144,yardage:7215},
    white:{pars_per_hole:[4,5,3,4,4,4,4,3,5,4,4,4,3,5,4,5,3,4],rating:72.4,slope:138,yardage:6781}
  }},
  {name:'Pebble Beach',loc:'California, USA',def:'white',tees:{
    white:{pars_per_hole:[4,5,4,4,3,5,3,4,4,4,4,3,4,5,4,4,3,5],rating:75.5,slope:145,yardage:6828}
  }},
  {name:'Carnoustie Golf Links',loc:'Angus, Scotland',def:'white',tees:{
    white: {pars_per_hole:[4,4,4,3,4,5,4,3,4,4,4,4,4,5,4,3,4,4],rating:75.4,slope:145,yardage:7411},
    yellow:{pars_per_hole:[4,4,4,3,4,5,4,3,4,4,4,4,4,5,4,3,4,4],rating:73.0,slope:138,yardage:7080}
  }},
  {name:'Broadstone Golf Club',loc:'Broadstone, Dorset',def:'yellow',tees:{
    white: {pars_per_hole:[5,4,4,4,4,3,4,3,5, 4,3,4,4,4,3,4,4,4],rating:71.5,slope:139,yardage:6381,
      yards_per_hole:[524,408,375,368,349,186,412,185,501, 404,155,395,382,396,167,330,427,418]},
    yellow:{pars_per_hole:[5,4,4,4,4,3,4,3,5, 4,3,4,4,4,3,4,4,4],rating:69.9,slope:130,yardage:6106,
      yards_per_hole:[502,388,358,350,330,174,395,170,480, 386,139,378,360,376,150,311,408,401]},
    red:   {pars_per_hole:[5,4,4,4,4,3,4,3,5, 4,3,4,4,4,3,4,4,4],rating:67.0,slope:119,yardage:5390,
      yards_per_hole:[448,334,308,305,278,152,340,144,422, 332,114,325,308,323,120,263,358,342]}
  }},
  {name:'Trevose Golf Club - Championship',loc:'Padstow, Cornwall',def:'white',tees:{
    blue:  {pars_per_hole:[4,4,3,5,4,4,4,3,5, 5,3,4,5,4,4,3,4,4],rating:74.3,slope:128,yardage:7079},
    white: {pars_per_hole:[4,4,3,5,4,4,4,3,5, 5,3,4,5,4,4,3,4,4],rating:71.5,slope:122,yardage:6415},
    yellow:{pars_per_hole:[4,4,3,5,4,4,4,3,5, 5,3,4,5,4,4,3,4,4],rating:69.8,slope:118,yardage:6187}
  }},
  {name:'Cawder Golf Club - Championship',loc:'Bishopbriggs, Glasgow',def:'yellow',tees:{
    white: {pars_per_hole:[4,4,4,4,4,3,5,3,4, 4,5,5,3,4,4,3,4,3],rating:70.5,slope:129,yardage:6279},
    yellow:{pars_per_hole:[4,4,4,4,4,3,5,3,4, 4,5,5,3,4,4,3,4,3],rating:69.5,slope:128,yardage:6090},
    red:   {pars_per_hole:[4,4,4,4,4,3,5,3,4, 4,5,5,3,4,4,3,4,3],rating:67.6,slope:122,yardage:5664}
  }},
  {name:'Machrihanish Golf Club',loc:'Kintyre, Argyll, Scotland',def:'yellow',tees:{
    blue:  {pars_per_hole:[4,4,4,4,4,4,4,3,4, 5,4,3,4,4,3,4,4,4],rating:72.5,slope:139,yardage:6473},
    white: {pars_per_hole:[4,4,4,4,4,4,4,3,4, 5,4,3,4,4,3,4,4,4],rating:71.5,slope:135,yardage:6226},
    yellow:{pars_per_hole:[4,4,4,4,4,4,4,3,4, 5,4,3,4,4,3,4,4,4],rating:70.2,slope:132,yardage:5956}
  }},
  {name:'Machrihanish Dunes Golf Club',loc:'Kintyre, Argyll, Scotland',def:'white',tees:{
    black: {pars_per_hole:[4,4,5,4,3,3,4,5,4, 4,4,3,4,4,4,5,4,4],rating:77.2,slope:133,yardage:7082},
    white: {pars_per_hole:[4,4,5,4,3,3,4,5,4, 4,4,3,4,4,4,5,4,4],rating:73.4,slope:126,yardage:6249},
    yellow:{pars_per_hole:[4,4,5,4,3,3,4,5,4, 4,4,3,4,4,4,5,4,4],rating:71.5,slope:123,yardage:5835},
    red:   {pars_per_hole:[4,4,5,4,3,3,4,5,4, 4,4,3,4,4,4,5,4,4],rating:68.0,slope:116,yardage:5076}
  }},
  {name:"Prince's Golf Club — Shore & Dunes",loc:'Sandwich, Kent',def:'blue',tees:{
    blue:  {pars_per_hole:[4,5,3,4,3,4,4,5,4, 4,3,5,4,4,5,4,3,4],rating:74.8,slope:128,yardage:7277},
    white: {pars_per_hole:[4,5,3,4,3,4,4,5,4, 4,3,5,4,4,5,4,3,4],rating:72.6,slope:122,yardage:6855},
    yellow:{pars_per_hole:[4,5,3,4,3,4,4,5,4, 4,3,5,4,4,5,4,3,4],rating:70.2,slope:116,yardage:6329}
  }},
  {name:"Prince's Golf Club — Shore & Himalayas",loc:'Sandwich, Kent',def:'white',tees:{
    white: {pars_per_hole:[4,5,3,4,3,4,4,5,4, 4,5,4,4,3,5,3,4,4],rating:72.0,slope:120,yardage:6750},
    yellow:{pars_per_hole:[4,5,3,4,3,4,4,5,4, 4,5,4,4,3,5,3,4,4],rating:69.8,slope:116,yardage:6260}
  }},
  {name:"Prince's Golf Club — Dunes & Himalayas",loc:'Sandwich, Kent',def:'white',tees:{
    white: {pars_per_hole:[4,3,5,4,4,5,4,3,4, 4,5,4,4,3,5,3,4,4],rating:72.3,slope:121,yardage:6800},
    yellow:{pars_per_hole:[4,3,5,4,4,5,4,3,4, 4,5,4,4,3,5,3,4,4],rating:70.0,slope:117,yardage:6310}
  }},
  {name:'Custom / Other',loc:'Enter your course',def:'white',tees:{
    white:{pars_per_hole:Array(18).fill(4),rating:72,slope:113,yardage:6200}
  }}
];
