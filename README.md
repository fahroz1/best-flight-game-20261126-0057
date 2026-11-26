# Langit Nusantara — Flight Game

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/fahroz1/best-flight-game-20261126-0057/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/fahroz1/best-flight-game-20261126-0057/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

Game terbang 3D orisinal Indonesia yang jalan offline di desktop browser — WebGL mentah tanpa library. Terbang di atas kepulauan Nusantara — laut, pantai, sawah, hutan, sungai, dan gunung — lewati cincin bercahaya, jaga bahan bakar, dan mendarat dengan mulus di runway.

## Main

Buka `game/index.html` di desktop Chrome (atau jalankan server statis lokal di folder `game/`). Tanpa network, tanpa instalasi.

- **3 pesawat 3D:** Elang (cepat, lincah, boros), Garuda (seimbang), Merpati Pos (lambat, stabil, hemat).
- **3 level:** Pagi di Pesisir, Badai Sore (hujan + angin), Malam di Pegunungan.
- **Misi tiap level:** lewati semua ring, lalu mendarat di runway. Skor dari ring, waktu, kelembutan pendaratan, dan sisa bahan bakar.

## Kontrol

- Panah / WASD: pitch dan throttle
- P: pause · R: restart · M: mute
- Mouse: menu, pilih pesawat, pilih level

## Entri make.fun

Entri untuk kompetisi [Make the best flight game](https://make.fun/bounty/best-flight-game-20261126-0057) — `main.ts` (Node 22) menyalin `game/` dan `screenshots/` ke output dan menulis `dossier.json`.
