# Animal Rally

**Грати:** https://derberg07.github.io/pasha-rally/

## Українською

Animal Rally — браузерна версія настільної гри-перегонів Паші для 2–6 гравців. Кожен керує гонщиком-твариною з власною здібністю, а трасу перед кожною партією складають з блоків набору, тож вона щоразу інша. Можна грати з ботами, удвох-ушістьох за одним пристроєм або по мережі.

### Своя траса

У блоці «Траса» натисни **«Зібрати самому»**. Додавай блоки з набору по одному: прямі, повороти, розвороти, «Без паркування», з'їзди. Коли поставиш фініш, можна клацати по тайлах прямих і самому розставити спецтайли й телепорти. Кнопка «Достроїти до фінішу» докладе решту траси за тебе. Знаки та СТО гра ставить сама. Зібрана траса зберігається, а в грі по мережі її отримують усі гравці.

### Як грати по мережі

1. Господар відкриває гру за посиланням вище і в блоці «Гра по мережі» натискає **«Створити кімнату»**.
2. Гра показує код кімнати з 5 символів. Господар надсилає його друзям.
3. Друзі відкривають те саме посилання, вводять код і своє ім'я та натискають **«Приєднатися»**.
4. Коли всі в екіпажах, господар налаштовує трасу і починає гонку.

Ходи рахує браузер господаря, тож не закривай його вкладку до кінця гонки. Гравці з'єднуються напряму (WebRTC через PeerJS); потрібен інтернет.

## English

Animal Rally is a browser version of Pasha's racing board game for 2–6 players. Each player drives an animal racer with its own ability, and the track is rebuilt from the kit's blocks before every race, so no two races are the same. Play against bots, pass one device around, or play online.

### Your own track

Click **Build your own** in the Track panel. Add the kit's blocks one at a time: straights, turns, U-turns, No parking and exits. Once the finish is down, click straight tiles to place special tiles and teleports yourself; Finish it for me lays the rest of the road for you. Signs and pit stops are placed automatically. The track is saved, and in an online game every player gets it.

### Playing online

1. The host opens the game at the link above and clicks **Create a room** under "Online play".
2. The game shows a 5-character room code. Send it to your friends.
3. Friends open the same link, enter the code and their name, and click **Join**.
4. Once everyone shows up in the crews, the host sets up the track and starts the race.

The host's browser runs the race, so keep that tab open until the finish. Players connect directly to each other (WebRTC via PeerJS) and need an internet connection.

## Development

Plain static files, no build step: `index.html`, `css/`, `js/`, `assets/`. To update the site, commit and push to `main`; GitHub Pages redeploys in a minute or two.
