# Data Schema: Vokasi Reguler

## Sumber Data
Dataset ini punya **2 jenis file berbeda**, bukan format yang sama:

1. **`Voc_Starting_System.csv`** — skema **target/final** yang dipakai sistem. Ini format bersih hasil ekstraksi, siap pakai.
2. **`Voc_<Bulan>_System.csv`** — data **mentah** yang dikirim tiap bulan (sampel: `Voc_Bulan_System.csv`). Formatnya jauh lebih kompleks dan **perlu diekstrak dulu** sebelum masuk ke skema target — lihat [Proses Ekstraksi](#proses-ekstraksi-raw--system) di bawah.

Catatan: ini adalah dataset **Vokasi Reguler**, terpisah dari **Vokasi AKTI** (skema akan dibuat menyusul, dengan kebutuhan kolom yang berbeda — AKTI butuh `Tgl Lahir` untuk keperluan matching ke Zpar, Reguler tidak).

- **Encoding:** UTF-8 with BOM, delimiter `;`
- **Grain:** 1 baris = 1 peserta vokasi reguler per batch penempatan

## Skema Target (`Voc_Starting_System.csv`)

640 baris, 9 kolom — 19 batch berbeda (batch 115–125+ dalam sampel).

| Kolom | Tipe | Deskripsi |
|---|---|---|
| `Batch` | int | Nomor batch penempatan vokasi |
| `Noreg` | string | ID unik peserta (format: `TM<tahun><batch><urutan>`, mis. `TM2615001`) — **PK** |
| `Nama` | string | Nama lengkap peserta |
| `Div` | string | Divisi — diturunkan dari `Shop`+`Lokasi` (lihat [Lookup Div/Dept](#lookup-tabel-shop--lokasi--dept--div)) |
| `Shop` | string | Area kerja penempatan (ASSEMBLY, TOSO, LOGISTIC, FRAME, QUALITY INSP., WELDING BODY, PRESS, PPIC) |
| `Lokasi` | string | Karawang #1 atau Karawang #2 |
| `Dept` | string | Departemen — diturunkan dari `Shop`+`Lokasi` |
| `Gender` | string | PRIA / PEREMPUAN |
| `Tgl Masuk` | date (dd/mm/yyyy) | Tanggal mulai penempatan batch tsb |

## Format Raw Bulanan (`Voc_<Bulan>_System.csv`)

**Bukan CSV standar** — ada 2 baris "judul" sebelum header data sebenarnya:

```
Baris 1: (kosong, semua kolom blank)
Baris 2: ;PLACEMENT VOKASI 28 MAY 2026 - 27 NOVEMBER 2026 (6 BULAN) BATCH #125;;;...
Baris 3: ;NO.;Noreg;NAMA LENGKAP;JENIS KELAMIN;TEMPAT LAHIR;TANGGAL LAHIR;...  ← header asli
Baris 4+: data
```

**Baris 2 berisi info penting dalam bentuk teks bebas**, bukan kolom terpisah — harus di-parse dengan regex:
- Tanggal mulai penempatan: `28 MAY 2026`
- Tanggal selesai: `27 NOVEMBER 2026`
- Durasi: `6 BULAN`
- Nomor batch: `125` (dari `BATCH #125`)

Raw file (29 kolom) punya jauh lebih banyak data daripada skema target, termasuk **data pribadi sensitif** yang tidak masuk ke sistem: `TEMPAT LAHIR`, `TANGGAL LAHIR`, `ALAMAT`, `RT/RW`, `KELURAHAN/DESA`, `KECAMATAN`, `KOTA`, `KODE POS`, `PROVINSI`, `NOMOR HP`, `NIK`, `NPWP`, `STATUS/NOMOR BPJS KESEHATAN`, `NAMA BANK`, `NO. REKENING`, `NAMA SEKOLAH DAN KOTA SEKOLAH`, `JURUSAN SEKOLAH`, `MODEL/UKURAN BAJU`, `UKURAN SEPATU`, `ALAMAT EMAIL`, `NAMA BKK`.

## Proses Ekstraksi (Raw → System)

| Kolom Target | Sumber di Raw | Transformasi |
|---|---|---|
| `Batch` | Teks judul baris 2 | Regex extract angka setelah `BATCH #` |
| `Noreg` | `Noreg` | Langsung |
| `Nama` | `NAMA LENGKAP` | Trim whitespace (raw ada trailing space di beberapa nama) |
| `Gender` | `JENIS KELAMIN` | Langsung — nilai sudah konsisten ("PRIA"/"PEREMPUAN") dengan skema target, **tidak perlu mapping** |
| `Shop` | `SHOP` | ⚠️ Raw rawan typo (mis. `ASSEMMBLY`, `QUALITY INSP` tanpa titik) — **tidak auto-normalize diam-diam**, ikuti [Proses Deteksi & Konfirmasi](#proses-deteksi--konfirmasi-value-tidak-standar-shop) di bawah sebelum dipakai untuk lookup Div/Dept |
| `Lokasi` | `LOKASI` | Langsung |
| `Div`, `Dept` | Hasil lookup dari `Shop`(sudah dinormalisasi) + `Lokasi` | Lihat tabel lookup di bawah |
| `Tgl Masuk` | Teks judul baris 2 | Parse tanggal mulai (`28 MAY 2026` → `28/05/2026`) — **dikonfirmasi sama untuk semua baris** dalam 1 file/batch |

**Kolom raw yang di-DROP** (tidak masuk skema target — lihat daftar lengkap di atas): seluruh data pribadi sensitif (NIK, NPWP, alamat, no. HP, rekening bank, BPJS) dan data operasional non-sistem (ukuran baju/sepatu, nama sekolah, nama BKK).

### Lookup Tabel: Shop + Lokasi → Dept + Div

| Shop | Lokasi | Dept | Div |
|---|---|---|---|
| ASSEMBLY | KARAWANG #1 | Assy Production #1 & PIO Dept | Assy & Painting Production Div |
| ASSEMBLY | KARAWANG #2 | Assy Production #2 Dept | Assy & Painting Production Div |
| TOSO | KARAWANG #1 | Painting Production #1 Dept | Assy & Painting Production Div |
| TOSO | KARAWANG #2 | Painting Production #2 Dept | Assy & Painting Production Div |
| QUALITY INSP. | KARAWANG #1 | Quality Inspection 1 Dept | Assy & Painting Production Div |
| QUALITY INSP. | KARAWANG #2 | Quality Inspection 2 Dept | Assy & Painting Production Div |
| WELDING BODY | KARAWANG #1 | Body Production & Insp P#1 Dept | Press & Welding Production Div |
| WELDING BODY | KARAWANG #2 | Body Production & Insp P#2 Dept | Press & Welding Production Div |
| FRAME | KARAWANG #1 | Frame Production Dept | Press & Welding Production Div |
| PRESS | KARAWANG #1 | Press Production Karawang Dept | Press & Welding Production Div |
| LOGISTIC | KARAWANG #1 | Logistic Operation Vehicle Plant #1 Dept | Plant Administration Div |
| LOGISTIC | KARAWANG #2 | Logistic Operation Vehicle Plant #2 Dept | Plant Administration Div |
| **PPIC** | *(dikosongkan dulu — belum ditentukan)* | **PPIC & Warehouse Dept** *(dari data Voc_Starting)* | **Plant Administration Div** ✅ |

⚠️ **`Lokasi` untuk Shop PPIC sengaja dikosongkan dulu** (belum ditentukan) — pipeline perlu toleran terhadap `Lokasi` kosong/null khusus untuk Shop PPIC (jangan di-treat sebagai error), sampai nilainya ditentukan kemudian.

### Filter Lokasi

Raw bulanan **kadang berisi data dari lokasi selain Karawang #1/#2**. Untuk saat ini, pipeline **hanya memproses baris dengan `Lokasi` = `KARAWANG #1` atau `KARAWANG #2`** — baris dengan lokasi lain di-drop/di-skip (bukan error, memang disengaja). Ini perlu direvisit kalau nanti ada kebutuhan mencakup lokasi lain.

### Proses Deteksi & Konfirmasi Value Tidak Standar (`Shop`)

Raw bulanan **rawan typo** pada kolom `SHOP` — contoh yang sudah ditemukan: `ASSEMMBLY` (harusnya `ASSEMBLY`), `QUALITY INSP` tanpa titik (harusnya `QUALITY INSP.`). Karena variasi ejaan bisa berbeda-beda tiap bulan dan tidak bisa ditebak semua kemungkinannya di depan, pipeline **tidak boleh auto-normalize secara diam-diam** — perlu proses berikut tiap file baru masuk:

1. **Deteksi**: setelah trim/uppercase, bandingkan tiap nilai unik `SHOP` di raw terhadap daftar nilai standar (`ASSEMBLY`, `TOSO`, `QUALITY INSP.`, `WELDING BODY`, `FRAME`, `PRESS`, `LOGISTIC`, `PPIC`).
2. **Nilai tidak cocok persis** → flag sebagai kandidat typo, cari kecocokan terdekat (mis. fuzzy match / Levenshtein distance) ke daftar standar.
3. **Konfirmasi manual** (bukan auto-fix): tampilkan pasangan `nilai_raw → dugaan_standar` untuk dikonfirmasi sebelum dipakai di pipeline produksi — misal "ASSEMMBLY → ASSEMBLY, benar?".
4. Setelah dikonfirmasi, tambahkan ke **dictionary mapping typo** yang persisten (bukan cuma sekali pakai), supaya typo yang sama di bulan berikutnya tidak perlu ditanyakan ulang.

**Rekomendasi struktur dictionary mapping** (disimpan sebagai file konfigurasi terpisah, bukan hardcode):
```
ASSEMMBLY      → ASSEMBLY
QUALITY INSP   → QUALITY INSP.
```

## Known Issues / Perlu Konfirmasi
- Typo `ASSEMMBLY` vs `ASSEMBLY`, dan `QUALITY INSP` vs `QUALITY INSP.` — **dikonfirmasi memang terjadi**, ditangani lewat proses deteksi & konfirmasi di atas (bukan auto-normalize diam-diam).
- **Lokasi untuk Shop PPIC sengaja dikosongkan dulu** (Div sudah dikonfirmasi: Plant Administration Div) — pipeline perlu handle null Lokasi khusus kasus ini tanpa error.
- Baru divalidasi dengan 1 sampel raw bulanan (7 baris, 1 batch) — pola ekstraksi ini perlu diuji lagi begitu ada sampel bulan lain, terutama untuk cek apakah format 2-baris-judul ini konsisten tiap bulan.
