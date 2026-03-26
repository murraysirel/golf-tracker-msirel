// ─────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────

export const DEFAULT_GIST = '089c0ed169b5c67dbd8846002b3def45';
export const API = '/.netlify/functions/sync';
export const PAGES = ['home','round','live','stats','leaderboard','practice','players','competition','group-settings'];

export const TC = {
  blue:   {l:'Blue',   d:'#5dade2'},
  yellow: {l:'Yellow', d:'#f4d03f'},
  white:  {l:'White',  d:'#f0e8d0'},
  red:    {l:'Red',    d:'#e74c3c'},
  black:  {l:'Black',  d:'#2c2c2c'}
};

export const COURSES = [
  {name:'Croham Hurst Golf Club',loc:'Croydon, Surrey',def:'blue',tees:{
    blue:  {par:[4,4,4,4,3,5,3,5,4,4,3,4,3,4,4,3,4,4],r:67.5,s:114,y:5770,tp:69},
    yellow:{par:[4,4,4,4,3,5,3,5,4,5,3,4,3,4,4,3,4,4],r:69.2,s:118,y:6094,tp:70},
    white: {par:[4,4,4,4,3,5,3,5,4,5,3,4,3,4,4,3,4,4],r:70.2,s:121,y:6370,tp:70},
    red:   {par:[4,4,4,4,3,5,3,5,4,5,3,4,3,4,4,3,4,4],r:67.4,s:114,y:5641,tp:70}
  }},
  {name:'St Andrews - Old Course',loc:'Fife, Scotland',def:'white',tees:{
    white: {par:[4,4,4,4,5,4,4,3,4,4,3,4,4,5,5,4,4,4],r:73.1,s:132,y:6721,tp:72},
    yellow:{par:[4,4,4,4,5,4,4,3,4,4,3,4,4,5,5,4,4,4],r:71.5,s:127,y:6566,tp:72}
  }},
  {name:'Wentworth - West Course',loc:'Surrey, England',def:'yellow',tees:{
    white: {par:[4,4,3,4,4,4,4,3,5,4,4,5,3,4,5,4,4,4],r:74.7,s:141,y:6957,tp:73},
    yellow:{par:[4,4,3,4,4,4,4,3,5,4,4,5,3,4,5,4,4,4],r:72.5,s:135,y:6644,tp:73}
  }},
  {name:'Sunningdale - Old Course',loc:'Berkshire, England',def:'yellow',tees:{
    white: {par:[4,4,3,4,4,4,4,4,4,4,4,3,4,4,5,4,4,5],r:72.5,s:130,y:6568,tp:70},
    yellow:{par:[4,4,3,4,4,4,4,4,4,4,4,3,4,4,5,4,4,5],r:70.5,s:126,y:6341,tp:70}
  }},
  {name:'Royal Birkdale',loc:'Southport, England',def:'white',tees:{
    white: {par:[4,4,4,3,4,5,3,4,4,4,4,3,4,3,5,4,5,4],r:75.4,s:140,y:7156,tp:70},
    yellow:{par:[4,4,4,3,4,5,3,4,4,4,4,3,4,3,5,4,5,4],r:73.0,s:135,y:6848,tp:70}
  }},
  {name:'Royal Portrush',loc:'Antrim, N. Ireland',def:'white',tees:{
    white: {par:[4,5,4,4,4,3,5,3,5,4,4,3,5,4,3,4,4,4],r:76.3,s:145,y:7317,tp:71},
    yellow:{par:[4,5,4,4,4,3,5,3,5,4,4,3,5,4,3,4,4,4],r:73.5,s:138,y:7012,tp:71}
  }},
  {name:'Royal County Down',loc:'Down, N. Ireland',def:'white',tees:{
    white: {par:[4,4,4,4,4,3,5,4,3,4,4,4,4,5,3,4,4,4],r:74.0,s:134,y:7186,tp:71},
    yellow:{par:[4,4,4,4,4,3,5,4,3,4,4,4,4,5,3,4,4,4],r:71.5,s:128,y:6870,tp:71}
  }},
  {name:'Gleneagles - King\'s Course',loc:'Perthshire, Scotland',def:'yellow',tees:{
    white: {par:[4,4,4,3,4,4,4,3,4,4,3,4,4,4,3,4,4,4],r:71.3,s:130,y:6790,tp:70},
    yellow:{par:[4,4,4,3,4,4,4,3,4,4,3,4,4,4,3,4,4,4],r:69.5,s:124,y:6471,tp:70}
  }},
  {name:'Augusta National',loc:'Georgia, USA',def:'white',tees:{
    white:{par:[4,5,4,3,4,3,4,5,4,4,4,3,5,4,4,3,4,4],r:76.2,s:148,y:7510,tp:72}
  }},
  {name:'TPC Sawgrass',loc:'Florida, USA',def:'blue',tees:{
    blue: {par:[4,5,3,4,4,4,4,3,5,4,4,4,3,5,4,5,3,4],r:74.9,s:144,y:7215,tp:72},
    white:{par:[4,5,3,4,4,4,4,3,5,4,4,4,3,5,4,5,3,4],r:72.4,s:138,y:6781,tp:72}
  }},
  {name:'Pebble Beach',loc:'California, USA',def:'white',tees:{
    white:{par:[4,5,4,4,3,5,3,4,4,4,4,3,4,5,4,4,3,5],r:75.5,s:145,y:6828,tp:72}
  }},
  {name:'Carnoustie Golf Links',loc:'Angus, Scotland',def:'white',tees:{
    white: {par:[4,4,4,3,4,5,4,3,4,4,4,4,4,5,4,3,4,4],r:75.4,s:145,y:7411,tp:72},
    yellow:{par:[4,4,4,3,4,5,4,3,4,4,4,4,4,5,4,3,4,4],r:73.0,s:138,y:7080,tp:72}
  }},
  {name:'Broadstone Golf Club',loc:'Broadstone, Dorset',def:'yellow',tees:{
    white: {par:[5,4,4,4,4,3,4,3,5, 4,3,4,4,4,3,4,4,4],r:71.5,s:139,y:6381,tp:70,
      hy:[524,408,375,368,349,186,412,185,501, 404,155,395,382,396,167,330,427,418]},
    yellow:{par:[5,4,4,4,4,3,4,3,5, 4,3,4,4,4,3,4,4,4],r:69.9,s:130,y:6106,tp:70,
      hy:[502,388,358,350,330,174,395,170,480, 386,139,378,360,376,150,311,408,401]},
    red:   {par:[5,4,4,4,4,3,4,3,5, 4,3,4,4,4,3,4,4,4],r:67.0,s:119,y:5390,tp:70,
      hy:[448,334,308,305,278,152,340,144,422, 332,114,325,308,323,120,263,358,342]}
  }},
  {name:'Trevose Golf Club - Championship',loc:'Padstow, Cornwall',def:'white',tees:{
    blue:  {par:[4,4,3,5,4,4,4,3,5, 5,3,4,5,4,4,3,4,4],r:74.3,s:128,y:7079,tp:72},
    white: {par:[4,4,3,5,4,4,4,3,5, 5,3,4,5,4,4,3,4,4],r:71.5,s:122,y:6415,tp:72},
    yellow:{par:[4,4,3,5,4,4,4,3,5, 5,3,4,5,4,4,3,4,4],r:69.8,s:118,y:6187,tp:72}
  }},
  {name:'Cawder Golf Club - Championship',loc:'Bishopbriggs, Glasgow',def:'yellow',tees:{
    white: {par:[4,4,4,4,4,3,5,3,4, 4,5,5,3,4,4,3,4,3],r:70.5,s:129,y:6279,tp:70},
    yellow:{par:[4,4,4,4,4,3,5,3,4, 4,5,5,3,4,4,3,4,3],r:69.5,s:128,y:6090,tp:70},
    red:   {par:[4,4,4,4,4,3,5,3,4, 4,5,5,3,4,4,3,4,3],r:67.6,s:122,y:5664,tp:70}
  }},
  {name:'Machrihanish Golf Club',loc:'Kintyre, Argyll, Scotland',def:'yellow',tees:{
    blue:  {par:[4,4,4,4,4,4,4,3,4, 5,4,3,4,4,3,4,4,4],r:72.5,s:139,y:6473,tp:71},
    white: {par:[4,4,4,4,4,4,4,3,4, 5,4,3,4,4,3,4,4,4],r:71.5,s:135,y:6226,tp:70},
    yellow:{par:[4,4,4,4,4,4,4,3,4, 5,4,3,4,4,3,4,4,4],r:70.2,s:132,y:5956,tp:70}
  }},
  {name:'Machrihanish Dunes Golf Club',loc:'Kintyre, Argyll, Scotland',def:'white',tees:{
    black: {par:[4,4,5,4,3,3,4,5,4, 4,4,3,4,4,4,5,4,4],r:77.2,s:133,y:7082,tp:72},
    white: {par:[4,4,5,4,3,3,4,5,4, 4,4,3,4,4,4,5,4,4],r:73.4,s:126,y:6249,tp:72},
    yellow:{par:[4,4,5,4,3,3,4,5,4, 4,4,3,4,4,4,5,4,4],r:71.5,s:123,y:5835,tp:72},
    red:   {par:[4,4,5,4,3,3,4,5,4, 4,4,3,4,4,4,5,4,4],r:68.0,s:116,y:5076,tp:72}
  }},
  {name:"Prince's Golf Club — Shore & Dunes",loc:'Sandwich, Kent',def:'blue',tees:{
    blue:  {par:[4,5,3,4,3,4,4,5,4, 4,3,5,4,4,5,4,3,4],r:74.8,s:128,y:7277,tp:72},
    white: {par:[4,5,3,4,3,4,4,5,4, 4,3,5,4,4,5,4,3,4],r:72.6,s:122,y:6855,tp:72},
    yellow:{par:[4,5,3,4,3,4,4,5,4, 4,3,5,4,4,5,4,3,4],r:70.2,s:116,y:6329,tp:72}
  }},
  {name:"Prince's Golf Club — Shore & Himalayas",loc:'Sandwich, Kent',def:'white',tees:{
    white: {par:[4,5,3,4,3,4,4,5,4, 4,5,4,4,3,5,3,4,4],r:72.0,s:120,y:6750,tp:72},
    yellow:{par:[4,5,3,4,3,4,4,5,4, 4,5,4,4,3,5,3,4,4],r:69.8,s:116,y:6260,tp:72}
  }},
  {name:"Prince's Golf Club — Dunes & Himalayas",loc:'Sandwich, Kent',def:'white',tees:{
    white: {par:[4,3,5,4,4,5,4,3,4, 4,5,4,4,3,5,3,4,4],r:72.3,s:121,y:6800,tp:72},
    yellow:{par:[4,3,5,4,4,5,4,3,4, 4,5,4,4,3,5,3,4,4],r:70.0,s:117,y:6310,tp:72}
  }},
  {name:'Custom / Other',loc:'Enter your course',def:'white',tees:{
    white:{par:Array(18).fill(4),r:72,s:113,y:6200,tp:72}
  }}
];
