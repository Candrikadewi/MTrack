# CAMP — Centralized Access for Manpower Planning

Aplikasi web untuk memantau manpower plant: komposisi headcount, review kontrak PKWT,
pipeline Vokasi, dan kebutuhan (demand) vs ketersediaan (supply) MP pengganti — dalam satu
sistem yang dibaca dan dipakai bersama oleh HR dan shop floor.

Konteks produk lengkap (pengguna, alur bisnis): [`PRODUCT.md`](PRODUCT.md).
Skema data upload: [`docs/`](docs).

## Teknologi

| Lapisan | Teknologi |
|---|---|
| Bahasa | TypeScript (mode `strict`) |
| UI | React 19 + Tailwind CSS 4 |
| Framework | Next.js 16 (App Router) |
| Database, login, hak akses | Supabase (PostgreSQL + Row Level Security) |
| Test | Vitest |
| Hosting | Vercel — setiap push ke `main` otomatis deploy ke production |

## Arsitektur

Empat lapisan; lapisan atas boleh memakai lapisan di bawahnya, tidak sebaliknya.

```
app/                 Halaman (satu folder = satu URL)
  └─ components/     Komponen UI yang bisa dipakai ulang
       └─ lib/engine/     Logika bisnis ("otak" aplikasi)
            └─ lib/storage.ts + lib/repo.ts   Akses data (cache + Supabase)
                 └─ supabase/                 Tabel, aturan akses, fungsi SQL
```

Alur data:

1. Halaman membaca data dari **store** (`lib/repo.ts`) — cache di browser yang terisi dari
   Supabase dan tetap sinkron lewat realtime.
2. Aksi pengguna memanggil fungsi di `lib/engine/actions/`. Tampilan langsung berubah
   (optimistic), lalu data disimpan ke Supabase di belakang layar.
3. Aksi yang dibatasi per role (HR / shop / admin) lewat **RPC** — fungsi SQL di server —
   sehingga aturannya tetap berlaku walau tampilan diakali.

## Struktur folder

```
app/
  login/                  Halaman login
  (app)/                  Semua halaman setelah login (kerangka: sidebar, cek login)
    dashboard/            Dashboard (Demography & Monitoring)
      _components/        Blok-blok dashboard (folder "_" bukan URL)
    demand/               Demand: ringkasan, review PKWT, input, mapping kandidat
    supply/               Supply Pool: Takt Down, Kaizen, Project selesai
    history/  upload/  handover/  projects/  takt/
  api/version/            Versi yang sedang live (untuk notifikasi "refresh")
components/
  ui/                     Komponen umum: Button, Card, Modal, Table, grafik, ...
  enrollment/ projects/ takt/ util-pool/   Komponen per fitur
lib/
  types.ts                Bentuk semua data (mulai baca dari sini)
  repo.ts, storage.ts     Satu store per tabel: cache, pagination, realtime
  engine/
    actions/              Semua aksi yang MENGUBAH data, dipisah per fitur
    compute.ts, enrollment.ts, batches.ts, dashboard.ts   Perhitungan (tanpa mengubah data)
  parseFile.ts            Membaca file ZPAR / Vokasi (CSV & Excel), membuang kolom sensitif
  auth.ts, roles.ts       Login dan hak akses per role
  supabase/               Koneksi Supabase (browser, server, proxy)
proxy.ts                  Dijalankan sebelum tiap request: refresh sesi, arahkan ke /login
supabase/                 schema.sql + migration_2 … migration_14
tests/                    Test otomatis (lihat di bawah)
```

## Menjalankan di komputer sendiri

Butuh Node.js 22.

1. `npm install`
2. Buat file `.env.local` berisi URL dan anon key project Supabase
   (Supabase → Project Settings → API):
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   ```
   File ini tidak ikut di-commit.
3. `npm run dev` lalu buka http://localhost:3000

## Pekerjaan terjadwal (server)

Setiap malam pukul 00:05 WIB, Vercel Cron memanggil `/api/jobs/daily` (`vercel.json`). Route
ini menjalankan pekerjaan rutin engine di server: membuat review PKWT yang jatuh tempo,
demand Vokasi Ended bulan ini, merilis MP projek yang tanggal rilisnya lewat, dan
menyinkronkan demand projek (`lib/jobs/daily.ts`). Fungsinya sama persis dengan yang
dijalankan halaman, jadi hasilnya tetap jalan walau tidak ada admin yang membuka CAMP.
Halaman tetap menjalankannya juga; semuanya idempotent dan database menolak duplikat.

Perlu dua environment variable **khusus server** di Vercel (Project → Settings →
Environment Variables), jangan diawali `NEXT_PUBLIC_`:

| Nama | Isi |
|---|---|
| `CRON_SECRET` | string acak panjang; Vercel Cron mengirimnya sebagai `Authorization: Bearer …` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` |

`service_role` melewati semua aturan akses — jangan pernah ditaruh di kode, di chat, atau di
variabel `NEXT_PUBLIC_`. Tanpa kedua variabel ini route menolak (401/503) dan halaman tetap
berjalan seperti biasa. Hasil tiap malam terlihat di Vercel → Logs (`daily jobs: …`).

## Database

Untuk database baru: jalankan `supabase/schema.sql`, lalu `migration_2.sql` sampai migration
terakhir **berurutan** di Supabase → SQL Editor. Untuk mengecek migration mana yang sudah jalan:
`supabase/check_migrations.sql` (aman, hanya membaca). Sejak `migration_15`, setiap migration
mencatat dirinya di tabel `app_migrations`, dan admin melihat peringatan di CAMP kalau ada yang
belum dijalankan.

Setiap perubahan struktur database ditambahkan sebagai file `migration_<n>.sql` baru — file lama
tidak diubah. Migration baru harus:

1. aman dijalankan dua kali (`if not exists`, `create or replace`, …);
2. diakhiri `insert into app_migrations (name) values ('migration_<n>') on conflict (name) do nothing;`;
3. ditambahkan ke `REQUIRED_MIGRATIONS` di `lib/migrations.ts` dan ke `supabase/check_migrations.sql`.

Test otomatis mengecek ketiganya.

Aksi yang mengubah beberapa baris sekaligus (registrasi / edit / hapus projek, Takt, Kaizen,
hapus data upload) disimpan sebagai **satu transaksi** lewat fungsi database `apply_changes`:
berhasil semua atau batal semua (`transaction()` di `lib/storage.ts`).

## Cek sebelum push

```
npm run format      # rapikan format semua file (Prettier) — CI mengecek dengan format:check
npm run lint        # kesalahan umum (ESLint)
npm run typecheck   # kesalahan tipe (TypeScript)
npm test            # test otomatis (Vitest)
npm run build       # build production
```

GitHub Actions menjalankan semuanya (plus `format:check`) di setiap pull request (`.github/workflows/ci.yml`).

## Test

Test ada di `tests/`, berjalan tanpa internet dan tanpa menyentuh database asli:

- `tests/engine`, `tests/lib` — logika bisnis dan helper. Supabase diganti tiruan
  (`tests/helpers/fakeSupabase.ts`) yang mencatat setiap panggilan; data contoh dari
  `tests/helpers/fixtures.ts`. "Hari ini" dikunci ke 2026-09-25 (`tests/setup.ts`).
- `tests/db` — SQL sungguhan di Postgres dalam memori (PGlite): semua migration berjalan
  berurutan dan aman diulang, `apply_changes` dan aturan RLS-nya, pencegah data dobel, dan
  *contract test*: apa pun yang dikirim aplikasi harus diterima skema database.

`npm run test:watch` menjalankan ulang test setiap file disimpan. Saat menambah aturan
bisnis, tambahkan juga test-nya — test adalah dokumentasi aturan yang selalu dicek.
