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

## Database

Untuk database baru: jalankan `supabase/schema.sql`, lalu `migration_2.sql` sampai
`migration_14.sql` **berurutan** di Supabase → SQL Editor.
Untuk mengecek migration mana yang sudah jalan: `supabase/check_migrations.sql` (aman, hanya membaca).

Setiap perubahan struktur database ditambahkan sebagai file `migration_<n>.sql` baru —
file lama tidak diubah.

## Cek sebelum push

```
npm run lint        # kerapian & kesalahan umum (ESLint)
npm run typecheck   # kesalahan tipe (TypeScript)
npm test            # test otomatis (Vitest)
npm run build       # build production
```

GitHub Actions menjalankan keempatnya di setiap pull request (`.github/workflows/ci.yml`).

## Test

Test ada di `tests/`, berjalan tanpa internet dan tanpa menyentuh database asli:

- `tests/helpers/fakeSupabase.ts` — Supabase tiruan yang mencatat setiap panggilan.
- `tests/helpers/fixtures.ts` — pembuat data contoh (karyawan, demand, review, ...).
- "Hari ini" dikunci ke 2026-09-25 (`tests/setup.ts`) supaya hasil tidak berubah tiap hari.

`npm run test:watch` menjalankan ulang test setiap file disimpan. Saat menambah aturan
bisnis, tambahkan juga test-nya — test adalah dokumentasi aturan yang selalu dicek.
