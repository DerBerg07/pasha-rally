/* Animal Rally — game data: racers, cards, tiles, checks and the printed kit (GDD v1.1.0 + balance patch). */
window.AR = window.AR || {};

AR.RACERS = [
  { id: 'hare', name: 'Заєць', name_en: 'Hare', hp: 3, bg: '#f4a9c9',
    ability: 'Замість звичайного ходу можеш стрибнути на 1 або 2 тайли вперед чи назад, ігноруючи всі перевірки на шляху',
    ability_en: 'Instead of a normal move you may jump 1 or 2 tiles forward or back, ignoring all checks on the way' },
  { id: 'cheetah', name: 'Гепард', name_en: 'Cheetah', hp: 2, bg: '#8ccbec',
    ability: 'Можеш кидати до 3 кубів на швидкість',
    ability_en: 'You may roll up to 3 dice for speed' },
  { id: 'turtle', name: 'Черепаха', name_en: 'Turtle', hp: 5, bg: '#cfe6b8',
    ability: '−2 до швидкості (не менше 1)',
    ability_en: '−2 to speed (minimum 1)' },
  { id: 'rhino', name: 'Носоріг', name_en: 'Rhino', hp: 4, bg: '#141414',
    ability: 'Коли проїжджаєш іншого гравця, можеш завдати 1 ХП йому і собі',
    ability_en: 'When you drive through another racer, you may deal 1 HP to them and to yourself' },
  { id: 'vulture', name: 'Гриф', name_en: 'Vulture', hp: 3, bg: '#f3dfb5',
    ability: 'Щоразу, коли будь-який гравець гине в радіусі 5 тайлів, тягни карту та віднови 1 ХП',
    ability_en: 'Whenever any racer dies within 5 tiles, draw a card and restore 1 HP' },
  { id: 'raccoon', name: 'Єнот', name_en: 'Raccoon', hp: 3, bg: '#3a1d4a',
    ability: 'Раз за хід можеш скинути 2 карти, щоб зняти 1★',
    ability_en: 'Once per turn you may discard 2 cards to remove 1★' },
  { id: 'fox', name: 'Лисиця', name_en: 'Fox', hp: 3, bg: '#eaa63a',
    ability: 'За кожну ★, отриману з поля, тягни 1 карту (раз за хід)',
    ability_en: 'For each ★ you get from the track, draw 1 card (once per turn)' },
  { id: 'eagle', name: 'Орел', name_en: 'Eagle', hp: 3, bg: '#a7d3e6',
    ability: '+2 до дальності дії твоїх карток. Замах діє на будь-якій дальності',
    ability_en: '+2 range for your cards. Assault reaches any distance' },
];
AR.racer = id => AR.RACERS.find(r => r.id === id);

AR.PLAYER_COLORS = ['#f6b94b', '#4fd6e0', '#ff6fb5', '#9ad66b', '#ff8a3d', '#b49bff'];

/* Action cards are doubled compared to the first print; events are not. */
AR.CARDS = {
  maneuver:   { count: 6, name: 'Маневр', name_en: 'Maneuver',
    text: '<b>Обери одне:</b> • зніми гравцю 1★; • пересунь іншого гравця на його ★',
    text_en: '<b>Choose one:</b> • remove 1★ from a player; • move another player by their ★' },
  setup:      { count: 6, name: 'Підстава', name_en: 'Frame-up',
    text: '<b>Обери одне:</b> • додай гравцю +1★; • пересунь гравця, крім лідера, на 2 тайли вперед',
    text_en: '<b>Choose one:</b> • give a player +1★; • move a player other than the leader 2 tiles forward' },
  assault:    { count: 6, name: 'Замах', name_en: 'Assault', range: 3,
    text: 'Обери гравця в радіусі 3 тайлів. Він втрачає 2 ХП. Ти отримуєш +1★.',
    text_en: 'Choose a player within 3 tiles. They lose 2 HP. You get +1★.' },
  cheat:      { count: 4, name: 'Чит', name_en: 'Cheat', reaction: true,
    text: '<b>Реакція.</b> Зіграй у мить смерті: лишись з 1 ХП, отримай +2★ (не вище 5)',
    text_en: '<b>Reaction.</b> Play at the moment of death: stay at 1 HP, get +2★ (max 5)' },
  racket:     { count: 6, name: 'Рекет', name_en: 'Racket',
    text: 'Обери гравця з меншим ★, ніж у тебе. Забери з його руки карт = різниці ваших ★',
    text_en: 'Choose a player with fewer ★ than you. Take cards from their hand equal to the difference' },
  harpoon:    { count: 4, name: 'Гарпун', name_en: 'Harpoon', range: 10,
    text: 'Обери гравця в радіусі 10 тайлів. Зустріньтесь на середині між вами',
    text_en: 'Choose a player within 10 tiles. Meet halfway between you' },
  skid:       { count: 6, name: 'Занос', name_en: 'Skid', reaction: true,
    text: '<b>Реакція.</b> Зіграй у мить проїзду: • поворот проходиш автоматично; • камера не дає ★',
    text_en: '<b>Reaction.</b> Play while driving past: • take the turn automatically; • the camera gives no ★' },
  handbrake:  { count: 6, name: 'Ручник', name_en: 'Handbrake', reaction: true,
    text: '<b>Реакція.</b> Обери одне: • зміни швидкість гравця на +2 або −2; • перекинь будь-який кубик',
    text_en: '<b>Reaction.</b> Choose one: • change a player’s speed by +2 or −2; • reroll any die' },
  looting:    { count: 4, name: 'Мародерство', name_en: 'Looting',
    text: 'Візьми карту з відбою', text_en: 'Take a card from the discard pile' },
  jam:        { count: 6, name: 'Затор', name_en: 'Traffic Jam',
    text: 'Усі інші гравці — на 1 тайл назад', text_en: 'All other players go 1 tile back' },
  feint:      { count: 8, name: 'Фінт', name_en: 'Feint',
    text: 'Перемістись на будь-яку кількість тайлів до свого ★ (мінімум 1)',
    text_en: 'Move any number of tiles up to your ★ (minimum 1)' },
  lair:       { count: 12, name: 'Лежбище', name_en: 'Den',
    text: 'Віднови 1 ХП за кожну свою ★ (не менше 1)', text_en: 'Restore 1 HP for each of your ★ (at least 1)' },
  checkers:   { count: 4, name: 'Шашки', name_en: 'Checkers', range: 4,
    text: 'Обери гравця в радіусі 4 тайлів. Поміняйтесь місцями.',
    text_en: 'Choose a player within 4 tiles. Swap places.' },
  raid:       { count: 1, name: 'Рейд', name_en: 'Raid', event: true,
    text: '<b>Подія.</b> Усі гравці з найбільшим ★ втрачають 2 ХП', text_en: '<b>Event.</b> All players with the most ★ lose 2 HP' },
  roundup:    { count: 1, name: 'Облава', name_en: 'Roundup', event: true,
    text: '<b>Подія.</b> Кожен гравець — назад на 2 тайли за кожну свою ★', text_en: '<b>Event.</b> Every player goes back 2 tiles for each of their ★' },
  coronation: { count: 1, name: 'Коронація', name_en: 'Coronation', event: true,
    text: '<b>Подія.</b> Лідер гонки — назад на 5 тайлів', text_en: '<b>Event.</b> The race leader goes back 5 tiles' },
  amnesia:    { count: 1, name: 'Амнезія', name_en: 'Amnesia', event: true,
    text: '<b>Подія.</b> Усі скидають руку та добирають 3 карти', text_en: '<b>Event.</b> Everyone discards their hand and draws 3 cards' },
  snitch:     { count: 2, name: 'Донос', name_en: 'Snitch', event: true,
    text: '<b>Подія.</b> Всі гравці отримують + ★', text_en: '<b>Event.</b> All players get +1★' },
};
/* Snitch copies depend on the number of racers: 2 → 2, 3–4 → 1, 5–6 → none. */
AR.cardCount = (id, nPlayers) => id === 'snitch' ? (nPlayers <= 2 ? 2 : nPlayers <= 4 ? 1 : 0) : AR.CARDS[id].count;

/* Tiles on which a stop triggers an effect ("Фінальна точка"). */
AR.TILES = {
  plain:     { img: 'plain', name: 'Дорога', name_en: 'Road' },
  start:     { img: 'start', name: 'START', name_en: 'START',
    text: 'Звідси стартують усі гонщики. Точка респауну, якщо позаду немає жодного СТО.',
    text_en: 'Everyone starts here. It is also the respawn point when there is no pit stop behind you.' },
  finish:    { img: 'finish', name: 'FINISH', name_en: 'FINISH',
    text: 'Хто перший дістанеться фінішу, перемагає.', text_en: 'The first racer to reach the finish wins.' },
  crossing:  { img: 'crossing', kind: 'stop', name: 'Пішохідний перехід', name_en: 'Pedestrian crossing',
    text: 'Отримуєш +1★.', text_en: 'You get +1★.' },
  car:       { img: 'car', kind: 'stop', name: 'Авто на дорозі', name_en: 'Parked car',
    text: 'Врізаєшся в припарковану машину, мінус 1 ХП.', text_en: 'You crash into a parked car: −1 HP.' },
  box:       { img: 'box', kind: 'stop', name: 'Ящик', name_en: 'Crate',
    text: 'Береш одну картку з колоди.', text_en: 'Draw one card from the deck.' },
  nitro:     { img: 'nitro', kind: 'stop', name: 'Нітро', name_en: 'Nitro',
    text: 'Кидаєш д6 і їдеш уперед на стільки ж.', text_en: 'Roll a d6 and drive forward that many tiles.' },
  tp:        { img: 'tp_pink', kind: 'stop', name: 'Телепорт', name_en: 'Teleport',
    text: 'Переносишся на парний телепорт того самого кольору, уперед чи назад по трасі.',
    text_en: 'You jump to the paired teleport of the same colour, forward or back along the track.' },
  chase:     { img: 'chase', kind: 'stop', name: 'Погоня', name_en: 'Chase',
    text: 'Відкочуєшся назад на стільки клітинок, скільки маєш зірок розшуку. Без зірок нічого не стається.',
    text_en: 'You roll back as many tiles as you have wanted stars. With no stars nothing happens.' },
  exit:      { img: 'exit', kind: 'stop', name: "З'їзд", name_en: 'Exit ramp',
    text: 'Скочуєшся назад містком на сусідню ранішу ділянку траси, там, де вона завернула поруч сама з собою.',
    text_en: 'You slide back over the bridge onto the neighbouring earlier stretch, where the track bends back beside itself.' },
  noparking: { img: 'noparking', kind: 'zone', name: '«No parking» зона', name_en: '“No parking” zone',
    text: 'Тут заборонено зупинятись. Якщо завершив рух у межах зони, відкочуєшся на останній тайл перед нею.',
    text_en: 'No stopping here. If your move ends inside the zone, you roll back to the last tile before it.' },
};

/* Checks trigger while driving past them with a dice move ("Перевірка"). */
AR.CHECKS = {
  turn90:          { kind: 'check', diff: 7, name: 'Поворот 90°', name_en: '90° turn',
    text: 'Швидкість менша за 7 — вписуєшся чисто; 7 або більше — вилітаєш і втрачаєш 1 ХП.',
    text_en: 'Speed below 7 — you take it cleanly; 7 or more — you fly off and lose 1 HP.' },
  turn180:         { kind: 'check', diff: 5, name: 'Розворот 180°', name_en: '180° hairpin',
    text: 'Швидкість менша за 5 — вписуєшся чисто; 5 або більше — вилітаєш і втрачаєш 1 ХП.',
    text_en: 'Speed below 5 — you take it cleanly; 5 or more — you fly off and lose 1 HP.' },
  cam_max:         { kind: 'check', img: 'cam_max', name: 'Камера максимальної швидкості', name_en: 'Speed camera (max)',
    text: 'Якщо твоя швидкість 7 або більше, фіксує перевищення: +1★.', text_en: 'If your speed is 7 or more, it catches you speeding: +1★.' },
  cam_min:         { kind: 'check', img: 'cam_min', name: 'Камера мінімальної швидкості', name_en: 'Speed camera (min)',
    text: 'Якщо твоя швидкість 4 або менше, фіксує надто повільний рух: +1★.', text_en: 'If your speed is 4 or less, it catches you crawling: +1★.' },
  police:          { kind: 'check', img: 'police', name: 'Поліцейський участок', name_en: 'Police station',
    text: 'Кидаєш д6. Випало більше за твої ★ — проїжджаєш; рівно або менше — тебе спиняють до кінця ходу. Без зірок проходиш завжди.',
    text_en: 'Roll a d6. Higher than your ★ — you pass; equal or lower — you are stopped for the rest of the turn. With no stars you always pass.' },
  customs:         { kind: 'check', img: 'customs', name: 'Митниця', name_en: 'Customs',
    text: 'Скидаєш із руки стільки карток, скільки маєш ★. Без зірок нічого не втрачаєш.',
    text_en: 'Discard as many cards as you have ★. With no stars you lose nothing.' },
  no_overtake:     { kind: 'check', img: 'no_overtake', name: 'Обгін заборонено', name_en: 'No overtaking',
    text: 'Поки ти в зоні, за кожну машину, яку обженеш, отримуєш +1★. Опинитись із кимось на одному тайлі не обгін.',
    text_en: 'While you are inside the zone, every car you overtake gives you +1★. Ending on the same tile is not overtaking.' },
  no_overtake_end: { kind: 'check', img: 'no_overtake_end', name: 'Кінець заборони обгону', name_en: 'End of no overtaking',
    text: 'Тут закінчується зона «Обгін заборонено».', text_en: 'The no-overtaking zone ends here.' },
};

AR.PIT = { name: 'СТО', name_en: 'Pit stop',
  text: 'Можеш заїхати, проїжджаючи повз, незалежно від залишку швидкості. На початку наступного ходу відновлюєш ХП. На станції ти невразливий до урону й до карток, що пересувають машини. Сюди повертаєшся після смерті.',
  text_en: 'Pull in as you drive past, whatever speed you have left. At the start of your next turn you repair to full HP. While in the pit you are immune to damage and to cards that move cars. You respawn here after dying.' };

/* The printed kit (Animal_Rally_Map.pdf): what a track can be built from. */
AR.KIT = {
  straight: { crossing: 6, nitro: 5, car: 6, chase: 5, box: 6 }, // [дорога + спецтайл] blocks
  teleports: 3,      // pairs: pink, orange, cyan
  noparking: 3,      // 4-tile blocks
  exits: 4,
  turn90: 16,
  turn180: 8,
  signs: { cam_min: 3, cam_max: 3, customs: 2, police: 2, no_overtake: 2 },
  pits: 8,
};

/* Track lengths in blocks (GDD: about 30–40). */
AR.TRACK_SIZES = {
  short:  { blocks: 24, W: 18, H: 11, tp: 2, np: 1, exits: 1, u180: 2,
    signs: { no_overtake: 1, police: 1, customs: 1, cam_max: 1, cam_min: 1 } },
  medium: { blocks: 32, W: 22, H: 13, tp: 2, np: 2, exits: 2, u180: 3,
    signs: { no_overtake: 1, police: 2, customs: 1, cam_max: 2, cam_min: 2 } },
  long:   { blocks: 40, W: 25, H: 15, tp: 3, np: 2, exits: 2, u180: 4,
    signs: { no_overtake: 2, police: 2, customs: 2, cam_max: 3, cam_min: 3 } },
};

AR.asset = {
  racer: id => `assets/racers/${id}.jpg`,
  card: id => `assets/cards/${id}.jpg`,
  tile: name => `assets/tiles/${name}.png`,
  sign: name => `assets/signs/${name}.png`,
};
