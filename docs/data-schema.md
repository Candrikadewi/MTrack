# Data Schema: Zpar (Manpower Master Data)

## Sumber Data
- **File:** `Zpar_<Bulan>_Trial.csv` (export SAP HR bulanan), berdasarkan sampel `Zpar_Sep_Trial.csv` (19.919 baris × 56 kolom) dan `Zpar_Aug_Trial.csv` (8.152 baris × 57 kolom)
- **Konvensi nama file produksi:**
  - Data bulanan (mulai 2026): `Zpar_<Bulan>_System.csv` — mis. `Zpar_Jan_System.csv`
  - Data histori awal (2019–2025, snapshot Maret tiap tahun): `Zpar_Starting_System.csv`
  - File contoh/trial di atas pakai suffix `_Trial`, bukan `_System` — pipeline produksi sebaiknya pattern-match suffix `_System.csv`
- **Encoding:** UTF-8 with BOM, delimiter `;`
- **Jumlah kolom TIDAK selalu sama tiap bulan** — lihat [Kolom Non-Standar](#kolom-non-standar-muncul-sesekali-bukan-bagian-skema-baku) di bawah. Pipeline harus toleran terhadap kolom ekstra/hilang, jangan hard-fail kalau jumlah kolom tidak persis 56.
- **Grain:** 1 baris = 1 karyawan (`Noreg` unik 100%, tidak ada duplikat)
- **Periode:** Snapshot per awal bulan (kolom `Period`), mencerminkan **perubahan yang terjadi di bulan sebelumnya** — bukan snapshot real-time.
- **Cakupan `EG` (Active/Terminated) BERVARIASI per file, tidak konsisten:** kadang hanya Active, kadang Active+Terminated (dikonfirmasi user — bukan anomali, memang normal bervariasi). **Jangan diasumsikan tetap** — selalu cek distribusi `EG` di tiap file yang masuk sebelum hitung total headcount atau membandingkan antar periode.
- **Cadence pengiriman data:**
  - Histori **2019–2025**: hanya tersedia snapshot bulan **Maret** tiap tahun (bukan bulanan). Beberapa kolom bisa kosong di periode ini — dibiarkan **as-is**, tidak perlu di-treat sebagai error.
  - Mulai **2026**: dikirim **setiap bulan**.
  - Implikasi untuk pipeline: jangan asumsikan interval antar snapshot selalu 1 bulan — cek `Period` tiap file untuk tahu jarak sebenarnya ke snapshot sebelumnya (penting untuk hitung *rate of change*/pergerakan MP per bulan).
- **Bagian dari 3 dataset terkait:** Zpar (ini), **Vokasi Reguler**, dan **Vokasi AKTI** — skema untuk dua yang terakhir menyusul. Lihat bagian [Relasi Antar Dataset](#relasi-antar-dataset) di bawah.

## Aturan Bisnis Penting
- **Headcount aktif saat ini** = filter `EG == "Active"`. Kolom `EG` dipakai untuk analisis pergerakan MP tiap bulan (masuk/keluar).
- **Rasio Permanen–Kontrak–Vokasi** dihitung dari kolom `Status` (Permanen, Kontrak 1.1, Kontrak 1.2, Kontrak 2, Kontrak Profesi, Expatriate, Incoming/Outgoing ICT, Prolongation).
- **Klasifikasi lokasi (`Pers Area`)**: Vehicle = Karawang 1 & Karawang 2; Unit Karawang = Karawang 3; Unit Sunter = Sunter 1 & Sunter 2; sisanya = Head Office.
- **Hierarki organisasi** (`Directorat > Division > Department > Section > Line > Group`) dipakai sebagai basis filtering di dashboard.
- **Perhitungan usia/pensiun** dari `Tgl Lahir`; **jadwal review kontrak** dari `Tgl Masuk`.
- **Posisi (struktural)** adalah basis hitung kategori TM/TL/TX/GL/dsb di dashboard — bukan `Posisi` (job title bebas teks).

## Kolom Kunci (Sering Dipakai)

| Kolom | Tipe | Fungsi Bisnis | Catatan |
|---|---|---|---|
| `No` | int | Nomor urut baris | Sekuensial, bukan ID bisnis |
| `Period` | string (mm.yyyy) | Periode snapshot, awal bulan | Hanya 1 nilai per file (mis. "09.2026") |
| `Noreg` | int | **Primary Key** — ID unik karyawan | Unik 19.919/19.919 |
| `Posisi (struktural)` | string | Kategori jabatan struktural (Team Member, Group Leader, Staff, dst.) | Basis hitung TM/TL/TX di dashboard |
| `Labor Type` | string | Tipe tenaga kerja (A, B1–B4, C1–C2, D, E1–E2, F, T) | Basis grafik labor type |
| `Tgl Masuk` | date (dd/mm/yyyy) | Tanggal masuk perusahaan | Untuk hitung jadwal review kontrak |
| `Status` | string | Status kepegawaian (Permanen, Kontrak 1.1/1.2/2, Kontrak Profesi, Expatriate, Incoming/Outgoing ICT, Prolongation) | Basis rasio permanen-kontrak-vokasi |
| `EG` | string (Active/Terminated) | Status aktif kerja | Filter utama headcount + analisis pergerakan bulanan |
| `ESG` | string | Kelas/grade MP (Kelas 5–7, dst.) | |
| `Pers Area` | string | Lokasi kerja (Sunter 1/2, Karawang 1/2/3, dll.) | Basis klasifikasi Vehicle/Unit/Head Office |
| `Directorat` / `Division` / `Department` / `Section` / `Line` / `Group` | string | Hierarki organisasi | Basis filtering dashboard; makin ke bawah makin banyak null (lihat Known Issues) |
| `Tgl Lahir` | date (dd/mm/yyyy) | Tanggal lahir | Hitung usia & proyeksi pensiun |
| `Gender` | string (Male/Female) | Jenis kelamin | Komposisi gender |
| `Tingkat Pendidikan` | string (SD–Master) | Jenjang pendidikan | 2,5% null |

## Kolom Pendukung (Jarang Dipakai)

### Identitas & Transaksi HR
- `Nama` (string) — nama karyawan
- `Posisi` (string) — job title bebas teks (beda dari `Posisi (struktural)`)
- `Psubarea` (string) — sub-area di bawah `Pers Area`
- `Org Unit` / `Org Key` (string/int) — kode unit organisasi SAP; **Org Key tidak selalu 1:1 ke Org Unit** (720 dari 3.453 Org Key punya >1 nama Org Unit)
- `Task (IT0019)` (string) — jenis task HR sistem: MPP, Akhir Kontrak, Passport expired, Akhir ICT/Expatriate (51,9% null)
- `Due Date Task` (date) — jatuh tempo task; ada nilai sentinel `9999-12-31` = tanpa batas waktu
- `Transaction` (string) — jenis transaksi HR terakhir pada record ini (Pemberhentian Pekerja, Promosi, Rotasi, Perubahan Status, Penerimaan Pekerja-Langsung, ICT, Mutasi, Koreksi Data, Kembali dari ICT, Demosi, Adjustment, Data Konversi)
- `Tgl Transaksi` (date) — tanggal transaksi tersebut
- `Reason Transaksi` (string) — alasan transaksi (31 jenis, mis. Kebutuhan Organisasi, Promosi Sub-Kelas)

### Kompensasi *(kosong 100% di file trial ini)*
- `PE Bonus`, `PE Salary`, `PE Bonus Y-1/Y-2/Y-3`, `PE Salary Y-1/Y-2/Y-3` — seluruhnya null di trial ini; struktur kolom sudah ada tapi belum ada data.

### Data Personal Lain
- `Family Status` (string) — Lajang, Nikah, Duda, Janda
- `Nationality` (string) — mayoritas Indonesia, sisanya Japan/India/Thailand/South Korea (13,9% null)
- `Jumlah Anak` (int) — jumlah anak

### Kesehatan *(kosong 100% di file trial ini)*
- `Kelompok Penyakit`, `Jenis Penyakit`, `Pemeriksa`, `Kategori Penyakit` — seluruhnya null di trial ini.

### Nilai Sebelum Transaksi Terakhir (kolom `*_Before`)
- `Posisi Before`, `Posisi (struktural) Before`, `ESG Before`, `Directorat Before`, `Division Before`, `Department Before`, `Section Before`, `Line Before`, `Group Before`
- **Asumsi** (belum dikonfirmasi): merepresentasikan nilai kolom terkait **sebelum** `Transaction`/`Tgl Transaksi` terjadi — berguna untuk melihat histori perpindahan/promosi.

### ICT / Expatriate
- `Perusahaan ICT/Expat` (string) — TMC, TMAP-EM, HINO (98,5% null — hanya relevan utk expat/ICT)
- `Posisi ICT/Expat` (string) — Executive Coordinator, Admin Staff & Engineer, Production Staff, Officer & Managerial Staff (99,2% null)

## Kolom Non-Standar (Muncul Sesekali, Bukan Bagian Skema Baku)

Ditemukan dari perbandingan file Agustus vs September: **jumlah dan nama kolom bisa berbeda tiap bulan**. Kolom-kolom berikut **pernah muncul tapi dikonfirmasi bukan bagian skema tetap** — jangan dibuat dependency permanen di pipeline untuk kolom-kolom ini, cukup handle secara opsional (baca kalau ada, skip kalau tidak ada):

| Kolom | Muncul di | Tipe | Catatan |
|---|---|---|---|
| `Ket` | Sep saja | string | Isinya "AKTI" di 380 baris. Awalnya diduga terkait penanda alumni Vokasi AKTI yang terserap jadi karyawan (lihat [Relasi Antar Dataset](#relasi-antar-dataset)), tapi **dikonfirmasi kolom ini tidak normal muncul tiap bulan** — jadi statusnya masih dugaan, belum pasti |
| `Pension` | Aug saja | date (dd/mm/yyyy) | Dikonfirmasi **tidak normal ada** di export bulanan biasa. Dari pola data terlihat konsisten ~3 bulan setelah `MPP` untuk orang yang sama — dugaan terkait tanggal pensiun aktual, tapi tidak dikonfirmasi maknanya |
| `MPP ` *(perhatikan ada spasi di akhir nama kolom!)* | Aug saja | date (dd/mm/yyyy) | Sama seperti `Pension`, tidak normal muncul tiap bulan. **Gotcha teknis:** nama kolom punya trailing space — wajib `strip()` nama kolom saat parsing supaya tidak menyebabkan silent bug |

**Implikasi desain pipeline:** skema dasar (56 kolom kunci+pendukung di atas) adalah baseline yang **selalu ada**. Kolom di luar itu harus diperlakukan sebagai *optional extra columns* — proses ETL sebaiknya melakukan `df.columns.str.strip()` di awal, lalu load kolom yang dikenal, dan log/alert kolom baru yang belum pernah terlihat sebelumnya (bukan auto-fail).

### Proses Deteksi & Keputusan Kolom Baru (Tiap Bulan)

Setiap file Zpar baru masuk, pipeline perlu langkah berikut sebelum data dipakai ke tahap selanjutnya:

1. **Deteksi**: bandingkan `set(kolom file baru)` vs baseline kolom yang terdaftar di dokumen ini (setelah `strip()` nama kolom).
2. **Klasifikasi**:
   - Kolom baseline hilang → **flag/alert**, jangan silent-drop (bisa jadi indikasi masalah export).
   - Kolom baru yang belum pernah tercatat → **flag/alert untuk direview**, jangan langsung dimasukkan ke pipeline produksi.
3. **Keputusan (manual, dicatat di sini)**: setiap kolom baru yang muncul perlu diputuskan statusnya:
   - ✅ **Dipakai** → pindahkan ke tabel "Kolom Kunci"/"Kolom Pendukung" di atas dengan deskripsi bisnisnya.
   - ⏸️ **Diabaikan untuk sekarang** → catat di tabel [Kolom Non-Standar](#kolom-non-standar-muncul-sesekali-bukan-bagian-skema-baku) di atas beserta bulan kemunculannya, supaya histori keputusan tetap terlacak dan tidak perlu ditanyakan ulang tiap kali muncul lagi.
4. Dokumen ini (`data-schema.md`) adalah **satu-satunya sumber kebenaran** untuk status tiap kolom — pipeline sebaiknya membaca daftar kolom "dipakai" dari sini (atau file konfigurasi terpisah yang di-generate darinya), bukan hardcode di kode.

## Known Issues / Anomali Data
- `Tgl Lahir` ada nilai hingga tahun **2025** (tidak masuk akal untuk karyawan aktif) — kemungkinan data entry error atau placeholder, perlu divalidasi sebelum dipakai untuk hitung usia.
- `Tgl Masuk` ada nilai sampai **2026-09-01** — periksa apakah ini tanggal masuk asli atau placeholder yang sama dengan tanggal export.
- `Due Date Task` memakai sentinel **9999-12-31** untuk "tanpa batas waktu" — jangan diperlakukan sebagai tanggal aktual saat kalkulasi durasi.
- Kolom kompensasi & kesehatan 100% kosong di file trial ini — perlu dikonfirmasi apakah akan terisi di data produksi, atau memang sengaja tidak disertakan.
- Hierarki organisasi (`Section`, `Line`, `Group`) punya null rate tinggi (22–29%) — wajar untuk posisi level atas/non-produksi yang tidak punya Line/Group.
- **Skema kolom drift antar bulan** (dikonfirmasi via perbandingan Aug vs Sep) — lihat [Kolom Non-Standar](#kolom-non-standar-muncul-sesekali-bukan-bagian-skema-baku). Desain pipeline harus tahan terhadap kolom bertambah/berkurang tiap bulan.

## Relasi Antar Dataset

Zpar adalah salah satu dari 3 dataset yang saling terkait:

| Dataset | Isi | Status skema |
|---|---|---|
| **Zpar** | Karyawan tetap/kontrak (dokumen ini) | ✅ Selesai (draft) |
| **Vokasi Reguler** | Peserta program vokasi reguler | ⏳ Menyusul |
| **Vokasi AKTI** | Peserta program vokasi AKTI | ⏳ Menyusul |

**Aturan bisnis penyerapan AKTI → Zpar:**
Jika sebuah Noreg/ID di data **Vokasi AKTI** berstatus **tidak aktif**, namun ID/orang yang sama **muncul di data Zpar**, artinya peserta AKTI tersebut **sudah terserap menjadi karyawan** perusahaan (bukan drop-out).
→ Ini penting untuk pipeline: proses join/reconciliation antar Zpar dan Vokasi AKTI perlu logika khusus untuk membedakan "AKTI tidak aktif karena keluar/drop-out" vs "AKTI tidak aktif karena terserap jadi karyawan tetap (ada di Zpar)".
→ Kolom `Ket` = "AKTI" di Zpar (September) mungkin adalah penanda hasil penyerapan ini, tapi kolom ini **tidak konsisten muncul tiap bulan** (lihat [Kolom Non-Standar](#kolom-non-standar-muncul-sesekali-bukan-bagian-skema-baku)) sehingga tidak bisa diandalkan sebagai satu-satunya sumber deteksi.

**Strategi matching AKTI ↔ Zpar (disepakati):**
Karena saat AKTI terserap jadi karyawan, ID AKTI-nya berubah/tidak dipakai lagi di Zpar (pakai `Noreg` baru), matching **tidak bisa mengandalkan ID** — dipakai composite key dari atribut personal:

| Key | Sumber kolom | Catatan |
|---|---|---|
| Nama (dinormalisasi) | `Nama` di kedua dataset | Uppercase, trim spasi, hilangkan gelar sebelum dibandingkan |
| Tanggal Lahir | `Tgl Lahir` di kedua dataset | Kombinasi dengan nama sudah sangat mengurangi risiko nama kembar |
| Gender | `Gender` di kedua dataset | Tie-breaker tambahan |
| Tanggal Masuk (Zpar) vs tanggal akhir program AKTI | `Tgl Masuk` (Zpar) vs kolom akhir program di data Vokasi AKTI (skema menyusul) | Proximity check — AKTI yang terserap biasanya masuk sebagai karyawan tidak lama setelah program AKTI-nya selesai; selisih hari yang wajar (mis. < 90 hari) memperkuat keyakinan match |

Rekomendasi implementasi: hasil matching disimpan sebagai tabel crosswalk terpisah (`linking_akti_zpar.csv`: `id_akti, noreg_zpar, match_confidence, matched_on`) supaya tidak perlu di-rematch dari nol tiap bulan — hanya AKTI baru yang perlu dicek ulang.

## Perlu Konfirmasi Lebih Lanjut
- Makna pasti kolom `Ket`, `Pension`, `MPP ` — dikonfirmasi ketiganya bukan kolom standar bulanan, tapi makna bisnis persisnya (kapan/kenapa muncul) belum dikonfirmasi.
- Konfirmasi asumsi kolom `*_Before` = nilai sebelum transaksi terakhir.
- Apakah kolom kompensasi & kesehatan akan terisi di data produksi (bukan file trial).
- Nama kolom "tanggal akhir program" di data Vokasi AKTI (untuk proximity check di strategi matching) — dikonfirmasi saat skema Vokasi AKTI dibuat.
