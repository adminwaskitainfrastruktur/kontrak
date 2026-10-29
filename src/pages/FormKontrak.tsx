// Formulir pengajuan dan ubah kontrak (kedua ruang). Alternatif chat untuk yang lebih suka satu halaman.
// Galat ditampilkan per isian (komponen Field: aria-invalid dan role=alert), lalu fokus pindah ke isian
// pertama yang perlu diperbaiki. Isian pengajuan baru disimpan sebagai draf di peramban (lib/draf).
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, Building2, Clock, CopyPlus, Lock, Send, UserRoundCog } from "lucide-react";
import { useSesi } from "../context/SesiContext";
import { useRuang } from "../context/RuangContext";
import { usePengaturan } from "../context/PengaturanContext";
import { useMuat } from "../hooks/useMuat";
import { useCegahTutup } from "../hooks/useCegahTutup";
import { GalatNomorGanda, ambilKontrak, ambilSemuaKontrak, buatKontrak, jalankanAksi, kosongkanCacheKontrak, selesaikanPengajuan, ubahKontrak } from "../services/kontrak";
import { ambilDokumen, unggahBanyak } from "../services/dokumen";
import { ambilAktivitas, catatAktivitas } from "../services/aktivitas";
import { adalahLegal, aksiTersedia, bisaAjukan, bisaLihat, bisaUbah, bisaUnggah } from "../lib/alur";
import { adalahAddendum } from "../lib/addendum";
import { daftarMouAktif } from "../lib/mou";
import { adalahPayung, peringatanTurunanBaru } from "../lib/plafon";
import { konteksDraf, teksLampirkanUlang, validasiUlangDraf } from "../lib/draf";
import { bacaParamSalin, dariKontrak as dataSerupa } from "../lib/serupa";
import { divisiAwalPengajuan, ingatDivisiTerakhir } from "../lib/akses";
import { kekuranganDokumen, syaratDokumen, teksSusulan } from "../lib/syarat";
import { sejakRevisi } from "../lib/revisi";
import { PESAN_NOMOR_GANDA, adalahGalatNomorUnik, cekNomorGanda, normalNomor, peringatanFormatNomor, usulanNomorKontrak } from "../lib/penomoran";
import {
  LABEL_KANTOR_PUSAT,
  PROYEK_KANTOR_PUSAT,
  catatanMataUangAddendum,
  galatPertama,
  mataUangTerkunci,
  periksaIsianForm,
  rapikanProyek,
  rapikanReferensi,
  saranProyek,
  warisanAcuan,
  type Acuan,
  type GalatForm,
  type KunciGalatForm,
} from "../lib/isianPengajuan";
import { bacaNilai, formatMasuk, formatUang } from "../lib/format";
import { umpanBalik } from "../lib/umpanBalik";
import {
  DIVISI_PENGAJU,
  JENIS_ADDENDUM,
  JENIS_KONTRAK,
  JENIS_MOU,
  JENIS_PERUBAHAN,
  MATA_UANG,
  PRIORITAS,
  type DivisiPengaju,
  type Kontrak,
  type KontrakInput,
} from "../lib/types";
import BannerDraf, { useDrafPengajuan } from "../components/BannerDraf";
import GalatKirim from "../components/GalatKirim";
import UnggahDokumen, { type BerkasAntre } from "../components/UnggahDokumen";
import { PenghitungSyarat } from "../components/PanelSyarat";
import { DatalistMitra, PetunjukMitraMirip, rapikanMitra, useDataSaranMitra } from "../components/SaranMitra";
import { Field, Item, Konfirmasi, Kontainer, KepalaHalaman, KotakError, Memuat, Tombol, cx } from "../components/ui";

/** Isian angka (nilai, plafon) disimpan sebagai teks selama diketik, baru dibaca saat menyimpan. */
type Form = Omit<KontrakInput, "nilai" | "plafon"> & { nilai: string; plafon: string };

/** id elemen isian per kunci galat, untuk memfokuskan isian pertama yang bergalat. */
const ID_ISIAN: Record<KunciGalatForm, string> = {
  judul: "isian-judul",
  kontrakIndukId: "isian-induk",
  mitra: "isian-mitra",
  nilai: "isian-nilai",
  tanggalBerakhir: "isian-tanggal-berakhir",
  nomorKontrak: "isian-nomor-kontrak",
  plafon: "isian-plafon",
  susulan: "isian-susulan",
};

function formAwal(divisi: DivisiPengaju): Form {
  return {
    judul: "",
    jenis: "Pengadaan Barang",
    divisi,
    mitra: "",
    nilai: "",
    mataUang: "IDR",
    tanggalMulai: null,
    tanggalBerakhir: null,
    prioritas: "Normal",
    deskripsi: "",
    targetSelesai: null,
    kontrakIndukId: null,
    mouAcuanId: null,
    jenisPerubahan: [],
    nomorKontrak: "",
    picLegalEmail: "",
    picLegalNama: "",
    tanggalTandaTangan: null,
    kodeProyek: "",
    nomorReferensi: "",
    costCenter: "",
    mitraId: null,
    perpanjanganOtomatis: false,
    masaPemberitahuanHari: null,
    plafon: "",
    salinDari: null,
    npwpMitra: "",
    alamatMitra: "",
    penandatanganMitra: "",
    jabatanMitra: "",
    dasarKewenangan: "",
  };
}

function dariKontrak(k: Kontrak): Form {
  return {
    judul: k.judul,
    jenis: k.jenis,
    divisi: k.divisi,
    mitra: k.mitra,
    nilai: k.nilai == null ? "" : String(k.nilai),
    mataUang: k.mataUang,
    tanggalMulai: k.tanggalMulai,
    tanggalBerakhir: k.tanggalBerakhir,
    prioritas: k.prioritas,
    deskripsi: k.deskripsi,
    targetSelesai: k.targetSelesai,
    kontrakIndukId: k.kontrakIndukId,
    mouAcuanId: k.mouAcuanId,
    jenisPerubahan: k.jenisPerubahan,
    nomorKontrak: k.nomorKontrak,
    picLegalEmail: k.picLegalEmail,
    picLegalNama: k.picLegalNama,
    tanggalTandaTangan: k.tanggalTandaTangan,
    kodeProyek: k.kodeProyek,
    nomorReferensi: k.nomorReferensi,
    costCenter: k.costCenter,
    mitraId: k.mitraId,
    perpanjanganOtomatis: k.perpanjanganOtomatis,
    masaPemberitahuanHari: k.masaPemberitahuanHari,
    plafon: k.plafon == null ? "" : String(k.plafon),
    salinDari: k.salinDari,
    npwpMitra: k.npwpMitra,
    alamatMitra: k.alamatMitra,
    penandatanganMitra: k.penandatanganMitra,
    jabatanMitra: k.jabatanMitra,
    dasarKewenangan: k.dasarKewenangan,
  };
}

/** Bilangan bulat positif dari parameter URL (?induk=12), atau null. */
function paramId(params: URLSearchParams, nama: string): number | null {
  const n = Number(params.get(nama));
  return Number.isInteger(n) && n > 0 ? n : null;
}

export default function FormKontrak() {
  const { id } = useParams();
  const edit = id != null;
  const { sesi } = useSesi();

  const { data: kontrak, error, loading, muatUlang } = useMuat(() => (edit ? ambilKontrak(Number(id)) : Promise.resolve(null)), [id]);

  if (edit && loading && !kontrak) return <Memuat />;
  if (edit && error) return <KotakError error={error} ulangi={muatUlang} />;
  if (edit && kontrak && (!bisaLihat(kontrak, sesi) || !bisaUbah(kontrak, sesi))) {
    return <KotakError error={new Error("Kontrak ini tidak bisa diubah oleh Anda pada status saat ini.")} />;
  }
  if (!edit && !bisaAjukan(sesi)) return <KotakError error={new Error("Peran Anda hanya bisa melihat kontrak.")} />;

  return <IsiForm kontrak={kontrak} />;
}

function IsiForm({ kontrak }: { kontrak: Kontrak | null }) {
  const { sesi } = useSesi();
  const { ruang, ke } = useRuang();
  const { pengaturan } = usePengaturan();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const legal = adalahLegal(sesi);
  // Isian pemrosesan Legal (nomor, tanggal TTD, plafon) hanya di Ruang Admin. Di Ruang Pengguna,
  // Admin dan Legal mengisi formulir sebagai pengaju biasa.
  const isianLegal = legal && ruang === "admin";
  const divisiAwal: DivisiPengaju = divisiAwalPengajuan(sesi);
  // Akun kantor yang masuk otomatis (tanpa divisi) memilih divisi tiap mengajukan; pilihan terakhirnya diingat.
  const tanpaDivisi = sesi.divisi == null;
  // Pengaju terdaftar tidak bisa memilih divisi; Legal bisa, jadi divisi dari induk/MoU hanya diisikan untuknya.
  const bolehPilihDivisi = legal || (!kontrak && (sesi.peran !== "Pengaju" || tanpaDivisi));

  // Asal halaman pengajuan baru: addendum (?induk), turunan MoU (?mou), atau "Ajukan serupa" (?salin).
  const indukParam = kontrak ? null : paramId(params, "induk");
  const mouParam = kontrak ? null : paramId(params, "mou");
  const salinParam = kontrak ? null : bacaParamSalin(params);

  const [form, setForm] = useState<Form>(() => (kontrak ? dariKontrak(kontrak) : formAwal(divisiAwal)));
  const [berkas, setBerkas] = useState<BerkasAntre[]>([]);
  const [menyimpan, setMenyimpan] = useState<"" | "simpan" | "kirim-ulang">("");
  // Selama menyimpan dan mengunggah, menutup tab diperingatkan peramban (pengajuan bisa tersimpan tanpa kabar ke Legal).
  useCegahTutup(menyimpan !== "");
  // Mengubah kontrak yang sudah ada tidak punya draf otomatis: keluar dengan perubahan yang belum disimpan ditanyakan dulu.
  const [tanyaBuang, setTanyaBuang] = useState(false);
  const adaPerubahan = useMemo(() => kontrak != null && (berkas.length > 0 || JSON.stringify(form) !== JSON.stringify(dariKontrak(kontrak))), [kontrak, form, berkas.length]);
  useCegahTutup(adaPerubahan);
  const [progres, setProgres] = useState("");
  /** Galat per isian (U40). */
  const [galatIsian, setGalatIsian] = useState<GalatForm>({});
  /** Galat saat menyimpan yang bukan milik satu isian (jaringan, sesi berakhir, izin). */
  const [galatKirim, setGalatKirim] = useState<unknown>(null);
  /** Pernyataan "dokumen wajib yang belum ada akan menyusul" (U13). */
  const [susulan, setSusulan] = useState(false);
  /** Daftar kontrak segar dari galat nomor ganda, untuk menghitung ulang usulan nomor (U20). */
  const [semuaSegar, setSemuaSegar] = useState<Kontrak[] | null>(null);
  const [catatanAwal, setCatatanAwal] = useState<string[]>([]);
  const [usulanJudul, setUsulanJudul] = useState("");

  useEffect(() => {
    if (kontrak) setForm(dariKontrak(kontrak));
  }, [kontrak]);

  /** Ubah satu isian; galat isian itu dihapus karena pengguna sedang memperbaikinya. */
  const set = <K extends keyof Form>(kunci: K, nilai: Form[K]) => {
    setForm((f) => ({ ...f, [kunci]: nilai }));
    hapusGalat(kunci as string);
  };
  const hapusGalat = (kunci: string) => setGalatIsian((g) => (kunci in g ? Object.fromEntries(Object.entries(g).filter(([k]) => k !== kunci)) : g));

  const { data: semua } = useMuat(ambilSemuaKontrak, []);
  const saranMitra = useDataSaranMitra(semua);
  const pilihanInduk = useMemo(
    () => (semua ?? []).filter((k) => k.id !== kontrak?.id && bisaLihat(k, sesi) && k.status === "Aktif" && !adalahAddendum(k)),
    [semua, kontrak, sesi],
  );
  // Dasar kontrak turunan: MoU yang berlaku, dan kontrak payung berplafon yang berlaku.
  const pilihanPayung = useMemo(() => {
    const daftar = semua ?? [];
    const mou = daftarMouAktif(daftar);
    const berplafon = daftar.filter((k) => k.status === "Aktif" && adalahPayung(k) && !mou.includes(k));
    return [...mou, ...berplafon].filter((k) => k.id !== kontrak?.id && bisaLihat(k, sesi));
  }, [semua, kontrak, sesi]);
  // Saran kode proyek (U12) hanya dari kontrak yang boleh dilihat pengguna ini.
  const proyekSaran = useMemo(() => saranProyek((semua ?? []).filter((k) => bisaLihat(k, sesi))), [semua, sesi]);
  const cariKontrak = useCallback((id: number | null | undefined) => (id == null ? null : ((semua ?? []).find((k) => k.id === id) ?? null)), [semua]);

  // --- Draf (hanya pengajuan baru) ------------------------------------------------------------
  const konteks = konteksDraf({ induk: indukParam, mou: mouParam, salin: salinParam });
  const draf = useDrafPengajuan<Form>({ sumber: "formulir", konteks, nonaktif: !!kontrak });
  const { simpan: simpanDraf } = draf;
  useEffect(() => {
    simpanDraf(form, { berkas: berkas.map((b) => b.file) });
  }, [form, berkas, simpanDraf]);
  // Isian awal dari URL hanya dipasang sekali, dan tidak lagi bila pengguna sudah melanjutkan draf.
  const sudahDiisiAwal = useRef(!!kontrak);
  // Sumber "Ajukan serupa" dibaca lengkap lewat ambilKontrak (bukan dari daftar), supaya kolom yang hanya
  // dimuat di detail (mis. Deskripsi, U39) tetap ikut tersalin.
  const salinQ = useMuat(() => (salinParam ? ambilKontrak(salinParam).catch(() => null) : Promise.resolve(null)), [salinParam]);

  const lanjutkanDraf = () => {
    if (!semua) {
      toast.info("Sebentar ya, data kontrak masih dimuat.");
      return;
    }
    const d = draf.lanjutkan();
    if (!d) return;
    sudahDiisiAwal.current = true;
    const v = validasiUlangDraf({ ...formAwal(divisiAwal), ...d.data }, semua, sesi);
    const isi = bolehPilihDivisi ? v.data : { ...v.data, divisi: divisiAwal };
    const catatan = [...v.catatan];
    // Draf lama bisa menyimpan mata uang addendum yang berbeda dari induk: disamakan (U29A).
    const kunci = mataUangTerkunci(isi.jenis, cariKontrak(isi.kontrakIndukId));
    if (kunci && isi.mataUang !== kunci) {
      catatan.push(`Mata uang disamakan dengan kontrak induk (${kunci}), karena addendum selalu memakai mata uang induknya.`);
      isi.mataUang = kunci;
    }
    setForm(isi);
    setGalatIsian({});
    setUsulanJudul("");
    setCatatanAwal([...catatan, teksLampirkanUlang(d.berkas)].filter(Boolean));
  };

  // --- Isian awal dari induk, MoU, atau kontrak yang disalin ---------------------------------
  // Mitra (dan divisi bila boleh memilih), proyek, dan referensi diwarisi dari acuan; mata uang addendum
  // dikunci sama dengan induk. Ketikan pengguna sendiri tidak tertimpa (lib/isianPengajuan warisanAcuan).
  const isiDariAcuan = useCallback(
    (acuan: Acuan, f: Form, addendum: boolean, acuanLama?: Acuan | null) => warisanAcuan(acuan, f, { divisi: bolehPilihDivisi, addendum, acuanLama }),
    [bolehPilihDivisi],
  );

  const salinMemuat = salinParam != null && salinQ.loading && !salinQ.data;
  const sumberSalin = salinQ.data;
  useEffect(() => {
    if (sudahDiisiAwal.current || !semua) return;
    if (!indukParam && !mouParam && !salinParam) return;
    if (salinMemuat) return;
    sudahDiisiAwal.current = true;
    if (indukParam) {
      const induk = pilihanInduk.find((k) => k.id === indukParam);
      if (induk) setForm((f) => ({ ...f, jenis: JENIS_ADDENDUM, kontrakIndukId: induk.id, ...isiDariAcuan(induk, f, true) }));
      else setCatatanAwal(["Kontrak induk dari tautan tidak ditemukan atau sudah tidak berlaku. Pilih kontrak induknya di bawah."]);
      return;
    }
    if (mouParam) {
      const payung = pilihanPayung.find((k) => k.id === mouParam);
      if (payung) setForm((f) => ({ ...f, jenis: f.jenis === JENIS_MOU || f.jenis === JENIS_ADDENDUM ? "Pengadaan Barang" : f.jenis, mouAcuanId: payung.id, ...isiDariAcuan(payung, f, false) }));
      else setCatatanAwal(["MoU dari tautan tidak ditemukan atau sudah tidak berlaku, jadi belum dipilih."]);
      return;
    }
    if (salinParam) {
      const sumber = sumberSalin ?? semua.find((k) => k.id === salinParam);
      const h = sumber ? dataSerupa(sumber, { semua, sesi }) : null;
      if (!h) {
        setCatatanAwal(["Kontrak yang ingin disalin tidak ditemukan atau tidak bisa disalin. Silakan isi dari awal."]);
        return;
      }
      setForm((f) => ({ ...f, ...h.data, divisi: bolehPilihDivisi ? h.data.divisi : divisiAwal }));
      setUsulanJudul(h.usulanJudul);
      setCatatanAwal([`Disalin dari ${h.sumber.nomor}.`, ...h.catatan]);
    }
  }, [semua, indukParam, mouParam, salinParam, salinMemuat, sumberSalin, pilihanInduk, pilihanPayung, isiDariAcuan, sesi, bolehPilihDivisi, divisiAwal]);

  const pilihInduk = (idInduk: number | null) => {
    const induk = idInduk != null ? pilihanInduk.find((k) => k.id === idInduk) : undefined;
    setForm((f) => ({ ...f, kontrakIndukId: idInduk, ...(induk ? isiDariAcuan(induk, f, true, cariKontrak(f.kontrakIndukId)) : {}) }));
    hapusGalat("kontrakIndukId");
    hapusGalat("mitra");
  };
  const pilihPayung = (idPayung: number | null) => {
    const payung = idPayung != null ? pilihanPayung.find((k) => k.id === idPayung) : undefined;
    setForm((f) => ({ ...f, mouAcuanId: idPayung, ...(payung ? isiDariAcuan(payung, f, false, cariKontrak(f.mouAcuanId)) : {}) }));
    hapusGalat("mitra");
  };

  // --- Dokumen ---------------------------------------------------------------------------------
  const bolehUnggahBerkas = kontrak ? bisaUnggah(kontrak, sesi) : true;
  const dokumenQ = useMuat(() => (kontrak ? ambilDokumen(kontrak.nomorPengajuan).catch(() => null) : Promise.resolve(null)), [kontrak?.nomorPengajuan]);
  const jenisAda = useMemo(() => [...(dokumenQ.data ?? []).map((d) => d.jenis), ...berkas.map((b) => b.jenis)], [dokumenQ.data, berkas]);
  const kurangWajib = useMemo(() => kekuranganDokumen(form.jenis, jenisAda).kurang, [form.jenis, jenisAda]);
  const jenisBawaan = kurangWajib[0] ?? "Dokumen Pendukung";
  // Pernyataan "sisanya menyusul" hanya untuk pengajuan baru; revisi memakai kartu revisi di halaman detail.
  const butuhPernyataan = !kontrak && kurangWajib.length > 0;
  const labelKurang = useMemo(() => syaratDokumen(form.jenis).wajib.filter((s) => kurangWajib.includes(s.jenis)).map((s) => s.label), [form.jenis, kurangWajib]);

  // --- Perhitungan tampilan ----------------------------------------------------------------------
  const nilai = bacaNilai(form.nilai);
  const plafon = bacaNilai(form.plafon);
  const payungTerpilih = form.mouAcuanId != null ? (semua ?? []).find((k) => k.id === form.mouAcuanId) ?? null : null;
  const peringatanPlafon = useMemo(() => {
    if (!payungTerpilih || !semua || form.jenis === JENIS_ADDENDUM || form.jenis === JENIS_MOU) return [];
    return peringatanTurunanBaru(
      payungTerpilih,
      semua,
      { nilai: nilai == null || Number.isNaN(nilai) ? null : nilai, mataUang: form.mataUang, tanggalMulai: form.tanggalMulai, tanggalBerakhir: form.tanggalBerakhir },
      kontrak?.id,
    );
  }, [payungTerpilih, semua, form.jenis, nilai, form.mataUang, form.tanggalMulai, form.tanggalBerakhir, kontrak?.id]);

  // U29A: mata uang addendum dikunci sama dengan induk. Data lama yang berbeda diberi peringatan dan
  // tombol untuk menyamakan, tidak diubah diam-diam.
  const indukTerpilih = form.jenis === JENIS_ADDENDUM ? cariKontrak(form.kontrakIndukId) : null;
  const kunciMataUang = mataUangTerkunci(form.jenis, indukTerpilih);
  const mataUangLamaBeda = !!kontrak && kunciMataUang != null && form.mataUang !== kunciMataUang;
  const mataUangTampil = kunciMataUang && !mataUangLamaBeda ? kunciMataUang : form.mataUang;
  const catatanMataUang = useMemo(
    () => (indukTerpilih && semua ? catatanMataUangAddendum(indukTerpilih, semua, { mataUangKini: mataUangLamaBeda ? form.mataUang : null, kecualiId: kontrak?.id }) : []),
    [indukTerpilih, semua, mataUangLamaBeda, form.mataUang, kontrak?.id],
  );

  // U20: nomor kontrak yang diganti di formulir diperiksa terhadap nomor yang sudah ada (ganda = galat) dan
  // pola format dari Pengaturan (peringatan lunak). Nomor yang tidak diubah tidak diperiksa ulang.
  const formatNomor = pengaturan.formatPenomoran;
  const acuanNomor = semuaSegar ?? semua ?? [];
  const nomorDiubah = isianLegal && !!kontrak && normalNomor(form.nomorKontrak) !== "" && normalNomor(form.nomorKontrak) !== normalNomor(kontrak.nomorKontrak);
  const nomorGanda = useMemo(() => (nomorDiubah && kontrak ? cekNomorGanda(form.nomorKontrak, acuanNomor, kontrak.id) : []), [nomorDiubah, kontrak, form.nomorKontrak, acuanNomor]);
  const catatanNomor = nomorDiubah ? peringatanFormatNomor(form.nomorKontrak, { jenis: form.jenis, kontrakIndukId: form.kontrakIndukId }, formatNomor, { nomorInduk: indukTerpilih?.nomorKontrak }) : [];
  const galatNomor = galatIsian.nomorKontrak ?? (nomorGanda.length ? `Nomor ini sudah dipakai ${nomorGanda.map((k) => k.nomorPengajuan).join(", ")}. Ganti dengan nomor lain.` : undefined);
  const usulanNomor = useMemo(
    () => (galatNomor && kontrak ? usulanNomorKontrak({ ...kontrak, jenis: form.jenis, divisi: form.divisi, kontrakIndukId: form.kontrakIndukId, tanggalTandaTangan: form.tanggalTandaTangan }, acuanNomor, formatNomor) : null),
    [galatNomor, kontrak, form.jenis, form.divisi, form.kontrakIndukId, form.tanggalTandaTangan, acuanNomor, formatNomor],
  );

  // "Simpan dan Kirim Ulang" (U06): pengaju yang merevisi bisa langsung mengirim ulang dari formulir.
  const aksiKirimUlang = kontrak?.status === "Perlu Revisi" ? aksiTersedia(kontrak, sesi).find((a) => a.id === "kirim-ulang") : undefined;

  /** Tampilkan galat per isian dan fokuskan isian pertama yang perlu diperbaiki. */
  const tandaiGalat = (g: GalatForm) => {
    setGalatIsian(g);
    const pertama = galatPertama(g);
    if (!pertama) return;
    // Setelah render ulang supaya aria-invalid dan pesan galat sudah terpasang saat fokus pindah.
    requestAnimationFrame(() => {
      const el = document.getElementById(ID_ISIAN[pertama]);
      el?.focus({ preventScroll: true });
      el?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    });
  };

  const susunData = (): KontrakInput | null => {
    const g = periksaIsianForm(
      { judul: form.judul, jenis: form.jenis, mitra: form.mitra, nilai: form.nilai, plafon: form.plafon, tanggalMulai: form.tanggalMulai, tanggalBerakhir: form.tanggalBerakhir, kontrakIndukId: form.kontrakIndukId },
      { isianLegal, nomorGanda, kurangWajib: butuhPernyataan ? kurangWajib.length : 0, susulan, judulLama: kontrak?.judul },
    );
    if (galatPertama(g)) {
      tandaiGalat(g);
      return null;
    }
    setGalatIsian({});
    const r = rapikanMitra(form.mitra, saranMitra.daftarMitra);
    const data: KontrakInput = {
      ...form,
      judul: form.judul.trim(),
      mitra: r.mitra,
      mitraId: form.mitraId ?? r.mitraId,
      nilai: form.jenis === JENIS_MOU ? null : nilai,
      // Pengajuan baru selalu memakai mata uang induk; data lama yang berbeda baru berubah bila disamakan.
      mataUang: !kontrak && kunciMataUang ? kunciMataUang : form.mataUang,
      plafon: form.jenis === JENIS_ADDENDUM || plafon == null || Number.isNaN(plafon) ? null : plafon,
      kontrakIndukId: form.jenis === JENIS_ADDENDUM ? form.kontrakIndukId : null,
      jenisPerubahan: form.jenis === JENIS_ADDENDUM ? form.jenisPerubahan : [],
      mouAcuanId: form.jenis !== JENIS_ADDENDUM && form.jenis !== JENIS_MOU ? form.mouAcuanId : null,
      kodeProyek: rapikanProyek(form.kodeProyek),
      nomorReferensi: rapikanReferensi(form.nomorReferensi),
    };
    // PIC Legal tidak pernah disimpan dari formulir (U02): penugasan lewat "Tugaskan" di halaman detail
    // supaya ada konfirmasi alih, alasan, jejak, dan email ke PIC baru.
    delete (data as Partial<KontrakInput>).picLegalEmail;
    delete (data as Partial<KontrakInput>).picLegalNama;
    // Kolom khusus Legal tidak dikirim dari luar Ruang Admin supaya tidak menimpa isian Legal.
    if (!isianLegal) {
      delete (data as Partial<KontrakInput>).nomorKontrak;
      delete (data as Partial<KontrakInput>).tanggalTandaTangan;
      delete (data as Partial<KontrakInput>).plafon;
    }
    if (!legal && kontrak) delete (data as Partial<KontrakInput>).divisi;
    return data;
  };

  /** Unggah antrean berkas ke kontrak `k`. Mengembalikan peringatan (bila ada) dan nama berkas yang gagal. */
  const unggahAntrean = async (k: Kontrak): Promise<{ peringatan?: string; gagal: string[] }> => {
    if (!berkas.length) return { gagal: [] };
    setProgres("Mengunggah dokumen…");
    const h = await unggahBanyak(k, berkas, sesi, (t) => setProgres(t));
    const pesan: string[] = [];
    if (h.gagal.length) pesan.push(`Dokumen ini gagal diunggah: ${h.gagal.map((g) => g.nama).join(", ")}. Unggah ulang dari halaman ini.`);
    if (h.berhasil.some((x) => !x.metadataTersimpan)) pesan.push("Jenis sebagian dokumen belum tersimpan; periksa dan atur ulang jenisnya di panel dokumen.");
    if (!h.aktivitasTercatat) pesan.push("Unggahan berhasil, tetapi catatannya belum masuk riwayat.");
    return { peringatan: pesan.length ? pesan.join(" ") : undefined, gagal: h.gagal.map((g) => g.nama) };
  };

  /** Galat simpan: nomor ganda ditandai di isiannya (usulan dihitung ulang), sisanya di kotak galat kirim. */
  const tanganiGalatSimpan = (err: unknown, judul: string) => {
    if (err instanceof GalatNomorGanda) {
      setSemuaSegar(err.semua);
      tandaiGalat({ nomorKontrak: err.message });
      return;
    }
    if (isianLegal && adalahGalatNomorUnik(err)) {
      tandaiGalat({ nomorKontrak: PESAN_NOMOR_GANDA });
      kosongkanCacheKontrak();
      void ambilSemuaKontrak()
        .then(setSemuaSegar)
        .catch(() => undefined);
      return;
    }
    setGalatKirim(err);
    umpanBalik.gagal(err, judul);
  };

  const simpan = async (e: FormEvent) => {
    e.preventDefault();
    setGalatKirim(null);
    const data = susunData();
    if (!data) return;

    setMenyimpan("simpan");
    try {
      if (kontrak) {
        const catatan = await ubahKontrak(kontrak, data, sesi);
        const { peringatan } = await unggahAntrean(kontrak);
        if (berkas.length) setBerkas([]);
        toast.success("Perubahan tersimpan.");
        const semuaPeringatan = [...catatan, ...(peringatan ? [peringatan] : [])].join(" ");
        navigate(ke.detail(kontrak.id), { state: semuaPeringatan ? { peringatan: semuaPeringatan } : undefined });
        return;
      }
      setProgres("Menyimpan pengajuan…");
      const baru = await buatKontrak(data, sesi);
      if (tanpaDivisi) ingatDivisiTerakhir(sesi.email, data.divisi);
      // Draf dihapus segera: pengajuan sudah tersimpan walau unggahan di bawah ini gagal.
      draf.hapus();
      const { peringatan, gagal } = await unggahAntrean(baru);
      const terunggah = berkas.filter((b) => !gagal.includes(b.file.name)).map((b) => b.jenis);
      // "Sisanya menyusul" (U13): dokumen wajib yang belum ada (termasuk yang gagal diunggah) dicatat di riwayat.
      if (susulan) {
        const pesanSusulan = teksSusulan(kekuranganDokumen(data.jenis, terunggah).kurang, data.jenis);
        if (pesanSusulan) {
          await catatAktivitas({ kontrakId: baru.id, jenis: "Dokumen", pesan: pesanSusulan }, sesi).catch(() =>
            toast.warning("Catatan dokumen menyusul belum tersimpan", { description: "Sampaikan ke Legal lewat komentar di halaman kontrak ya." }),
          );
        }
      }
      // U23a: catatan "Dibuat" dan email ke Legal SESUDAH unggahan, supaya email menyebut dokumen yang benar-benar ada.
      setProgres("Mengabari tim Legal…");
      const penutup = await selesaikanPengajuan(baru, sesi, { jumlah: terunggah.length, jenis: terunggah, susulan });
      toast.success("Pengajuan terkirim ke Legal.", { description: `Masuk ${formatMasuk(baru.tanggalDiajukan ?? baru.dibuat)}.` });
      for (const p of penutup.peringatan) toast.warning(p, { duration: 10_000 });
      navigate(ke.detail(baru.id), { state: peringatan ? { peringatan: `Kontrak tersimpan. ${peringatan}` } : undefined });
    } catch (err) {
      tanganiGalatSimpan(err, kontrak ? "Perubahan belum tersimpan" : "Pengajuan belum terkirim");
    } finally {
      setMenyimpan("");
      setProgres("");
    }
  };

  const simpanDanKirimUlang = async () => {
    if (!kontrak || !aksiKirimUlang) return;
    setGalatKirim(null);
    const data = susunData();
    if (!data) return;

    setMenyimpan("kirim-ulang");
    try {
      setProgres("Menyimpan perubahan…");
      for (const p of await ubahKontrak(kontrak, data, sesi)) toast.warning(p);
      const { peringatan } = await unggahAntrean(kontrak);
      if (berkas.length) setBerkas([]);
      setProgres("Memeriksa dokumen revisi…");
      const [dokumen, aktivitas] = await Promise.all([ambilDokumen(kontrak.nomorPengajuan), ambilAktivitas(kontrak.id)]);
      const sejak = sejakRevisi(dokumen, aktivitas);
      if (!sejak.adaDokumenBaru) {
        // Belum ada dokumen revisi: jangan kirim ulang dulu, arahkan ke kartu revisi di halaman detail.
        toast.info("Perubahan tersimpan, belum dikirim ulang.", { description: "Belum ada dokumen baru sejak revisi diminta. Unggah dokumen revisinya, lalu kirim ulang dari kartu revisi." });
        navigate(ke.detail(kontrak.id), { state: { sorotRevisi: true, ...(peringatan ? { peringatan } : {}) } });
        return;
      }
      setProgres("Mengirim ulang ke Legal…");
      const hasilAksi = await jalankanAksi({ ...kontrak, ...data }, aksiKirimUlang, sejak.ringkasan.length ? `Perbaikan: ${sejak.ringkasan.join("; ")}.` : "", {}, sesi);
      toast.success("Revisi terkirim ulang ke Legal.", { description: "Legal akan melanjutkan review. Terima kasih sudah merevisi." });
      for (const p of hasilAksi.peringatan) toast.warning(p, { duration: 10_000 });
      navigate(ke.detail(kontrak.id), { state: peringatan ? { peringatan } : undefined });
    } catch (err) {
      tanganiGalatSimpan(err, "Belum berhasil mengirim ulang");
    } finally {
      setMenyimpan("");
      setProgres("");
    }
  };

  const kembali = kontrak ? ke.detail(kontrak.id) : ke.ajukan;
  const sedangMenyimpan = menyimpan !== "";
  const jumlahGalat = Object.values(galatIsian).filter(Boolean).length;
  const kantorPusat = rapikanProyek(form.kodeProyek) === PROYEK_KANTOR_PUSAT;

  return (
    <form onSubmit={simpan} noValidate className="mx-auto max-w-4xl">
      <Link
        to={kembali}
        onClick={(e) => {
          if (adaPerubahan && menyimpan === "") {
            e.preventDefault();
            setTanyaBuang(true);
          }
        }}
        className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted hover:text-ink sm:min-h-0"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Kembali
      </Link>
      <KepalaHalaman
        judul={kontrak ? "Ubah Kontrak" : "Ajukan Kontrak"}
        sub={
          kontrak ? (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-mono">{kontrak.nomorPengajuan}</span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Masuk {formatMasuk(kontrak.tanggalDiajukan ?? kontrak.dibuat)}
              </span>
            </span>
          ) : (
            "Isi data kontrak dan lampirkan draft serta dokumen pendukung untuk direview Legal."
          )
        }
      />

      {!kontrak && <BannerDraf draf={draf.tawaran} onLanjutkan={lanjutkanDraf} onMulaiBaru={draf.mulaiBaru} className="mb-6" />}

      {catatanAwal.length > 0 && (
        <div className="mb-6 flex gap-3 rounded-2xl bg-brand-soft px-4 py-3 text-sm text-brand-strong" role="status">
          <CopyPlus className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <ul className="min-w-0 space-y-1">
            {catatanAwal.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      <Kontainer jeda={0.07} className="space-y-6">
      <Item><section className="kartu p-4 sm:p-6">
        <h2 className="mb-4 font-bold">Informasi kontrak</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id={ID_ISIAN.judul}
            label="Judul kontrak"
            wajib
            className="min-w-0 sm:col-span-2"
            galat={galatIsian.judul}
            bantuan={usulanJudul && !form.judul ? "Judul lama sudah disesuaikan tahunnya sebagai contoh. Ketik judul baru, atau pakai usulan di bawah." : undefined}
          >
            {(aria) => (
              <>
                <input
                  {...aria}
                  className="input"
                  maxLength={255}
                  autoComplete="off"
                  value={form.judul}
                  onChange={(e) => set("judul", e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Tab" && !e.shiftKey && !form.judul && usulanJudul) set("judul", usulanJudul);
                  }}
                  placeholder={usulanJudul || "Contoh: Pengadaan Beton Ready Mix Proyek Tol X"}
                />
                {usulanJudul && !form.judul && (
                  <Tombol type="button" kecil varian="kedua" className="mt-2 max-w-full" onClick={() => set("judul", usulanJudul)}>
                    <span className="min-w-0 truncate">Pakai usulan: {usulanJudul}</span>
                  </Tombol>
                )}
              </>
            )}
          </Field>
          <Field label="Jenis kontrak" wajib className="min-w-0">
            <select className="input" value={form.jenis} onChange={(e) => set("jenis", e.target.value as Form["jenis"])}>
              {JENIS_KONTRAK.map((j) => (
                <option key={j}>{j}</option>
              ))}
            </select>
          </Field>
          <Field label="Divisi pengaju" wajib className="min-w-0" bantuan={legal ? undefined : kontrak ? "Divisi tidak bisa diubah setelah diajukan." : tanpaDivisi ? "Dari divisi mana pengajuan ini? Pilihan Anda diingat untuk pengajuan berikutnya." : undefined}>
            <select className="input" value={form.divisi} disabled={!legal && (!!kontrak || (sesi.peran === "Pengaju" && !tanpaDivisi))} onChange={(e) => set("divisi", e.target.value as DivisiPengaju)}>
              {DIVISI_PENGAJU.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </Field>
          {form.jenis === JENIS_ADDENDUM && (
            <Field id={ID_ISIAN.kontrakIndukId} label="Kontrak induk" wajib className="min-w-0 sm:col-span-2" galat={galatIsian.kontrakIndukId} bantuan="Kontrak yang diubah atau diperpanjang oleh addendum ini. Mitra, proyek, referensi, dan mata uangnya ikut terisi.">
              <select className="input" value={form.kontrakIndukId ?? ""} onChange={(e) => pilihInduk(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Pilih kontrak…</option>
                {pilihanInduk.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.nomorKontrak || k.nomorPengajuan} · {k.judul}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {form.jenis === JENIS_ADDENDUM && (
            // Grup tombol, bukan <label>: klik pada judul tidak boleh mengaktifkan tombol pertama.
            <div className="min-w-0 sm:col-span-2" role="group" aria-labelledby="judul-yang-diubah" aria-describedby="bantuan-yang-diubah">
              <p id="judul-yang-diubah" className="label">
                Yang diubah addendum
              </p>
              <div className="flex flex-wrap gap-2">
                {JENIS_PERUBAHAN.map((j) => {
                  const aktif = form.jenisPerubahan.includes(j);
                  return (
                    <button key={j} type="button" aria-pressed={aktif} onClick={() => set("jenisPerubahan", aktif ? form.jenisPerubahan.filter((x) => x !== j) : [...form.jenisPerubahan, j])} className={cx("rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors [@media(pointer:coarse)]:min-h-11", aktif ? "border-brand bg-brand text-brand-on" : "border-line bg-surface text-muted hover:border-brand hover:text-ink")}>
                      {j}
                    </button>
                  );
                })}
              </div>
              <p id="bantuan-yang-diubah" className="mt-1 text-xs text-muted">
                Boleh lebih dari satu.
              </p>
            </div>
          )}
          {form.jenis !== JENIS_ADDENDUM && form.jenis !== JENIS_MOU && (pilihanPayung.length > 0 || form.mouAcuanId != null) && (
            <div className="min-w-0 sm:col-span-2">
              <Field label="Berdasarkan MoU / kontrak payung (opsional)" bantuan="Pilih bila kontrak ini tindak lanjut dari MoU atau kontrak payung yang sedang berjalan. Mitra, proyek, dan referensinya ikut terisi.">
                <select className="input" value={form.mouAcuanId ?? ""} onChange={(e) => pilihPayung(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">Bukan tindak lanjut MoU atau payung</option>
                  {form.mouAcuanId != null && !pilihanPayung.some((m) => m.id === form.mouAcuanId) && (
                    <option value={form.mouAcuanId}>{payungTerpilih ? `${payungTerpilih.nomorKontrak || payungTerpilih.nomorPengajuan} · ${payungTerpilih.judul}` : "Acuan saat ini"}</option>
                  )}
                  {pilihanPayung.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nomorKontrak || m.nomorPengajuan} · {m.judul}
                      {m.plafon != null ? ` (plafon ${formatUang(m.plafon, m.mataUang)})` : ""}
                    </option>
                  ))}
                </select>
              </Field>
              {peringatanPlafon.length > 0 && (
                <div className="mt-2 flex gap-2 rounded-xl bg-accent-soft px-3 py-2 text-xs text-accent-ink" role="status">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <div className="min-w-0 space-y-0.5">
                    {peringatanPlafon.map((p) => (
                      <p key={p}>{p}</p>
                    ))}
                    <p className="opacity-80">Ini hanya pengingat; pengajuan tetap bisa dikirim dan Legal akan meninjaunya.</p>
                  </div>
                </div>
              )}
            </div>
          )}
          <Field
            id={ID_ISIAN.mitra}
            label="Nama mitra / vendor"
            wajib
            className="min-w-0 sm:col-span-2"
            galat={galatIsian.mitra}
            bantuan={form.mitraId != null ? "Terhubung ke data induk mitra." : saranMitra.daftarMitra.length ? "Ketik untuk memilih dari data induk mitra, supaya nama tidak berbeda-beda penulisannya." : undefined}
          >
            {(aria) => (
              <>
                <input
                  {...aria}
                  className="input"
                  maxLength={255}
                  autoComplete="off"
                  list="daftar-mitra"
                  value={form.mitra}
                  onChange={(e) => {
                    const nama = e.target.value;
                    const r = rapikanMitra(nama, saranMitra.daftarMitra);
                    // Teks yang diketik dibiarkan apa adanya sampai isian ditinggalkan; tautannya langsung dikenali.
                    setForm((f) => ({ ...f, mitra: nama, mitraId: r.mitraId }));
                    hapusGalat("mitra");
                  }}
                  onBlur={() => {
                    const r = rapikanMitra(form.mitra, saranMitra.daftarMitra);
                    setForm((f) => ({ ...f, mitra: r.mitra, mitraId: r.mitraId ?? f.mitraId }));
                  }}
                  placeholder="PT …"
                />
                <DatalistMitra id="daftar-mitra" daftarMitra={saranMitra.daftarMitra} kontrak={saranMitra.kontrak} />
                <PetunjukMitraMirip teks={form.mitra} daftarMitra={saranMitra.daftarMitra} kontrak={saranMitra.kontrak} onPilih={(s) => setForm((f) => ({ ...f, mitra: s.nama, mitraId: s.mitra?.id ?? null }))} />
              </>
            )}
          </Field>
          {form.jenis === JENIS_MOU ? (
            <div className="flex min-w-0 items-center rounded-xl bg-brand-soft px-4 py-3 text-sm text-brand-strong">MoU tidak memiliki nilai kontrak. Nilai kerja samanya ada di kontrak pelaksana yang menaut ke MoU ini.</div>
          ) : (
            <Field
              id={ID_ISIAN.nilai}
              label={form.jenis === JENIS_ADDENDUM ? "Selisih nilai" : "Nilai kontrak"}
              className="min-w-0"
              galat={galatIsian.nilai}
              bantuan={
                nilai != null && !Number.isNaN(nilai)
                  ? formatUang(nilai, mataUangTampil)
                  : form.jenis === JENIS_ADDENDUM
                    ? "Tambahan ditulis biasa, pengurangan pakai minus. Kosongkan bila nilai tidak berubah."
                    : "Kosongkan jika tidak ada nilai (mis. NDA)."
              }
            >
              {(aria) => (
                <div className="flex gap-2">
                  {kunciMataUang && !mataUangLamaBeda ? (
                    <span className="input flex w-24 shrink-0 items-center justify-center gap-1.5 font-semibold text-muted" title="Mata uang addendum mengikuti kontrak induk">
                      <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {kunciMataUang}
                      <span className="sr-only">, mengikuti kontrak induk</span>
                    </span>
                  ) : (
                    <select className="input w-24 shrink-0" value={form.mataUang} disabled={mataUangLamaBeda} onChange={(e) => set("mataUang", e.target.value as Form["mataUang"])} aria-label="Mata uang">
                      {MATA_UANG.map((m) => (
                        <option key={m}>{m}</option>
                      ))}
                    </select>
                  )}
                  <input {...aria} className="input min-w-0 text-right tabular-nums" inputMode={form.jenis === JENIS_ADDENDUM ? "text" : "decimal"} autoComplete="off" value={form.nilai} onChange={(e) => set("nilai", e.target.value)} placeholder="0" />
                </div>
              )}
            </Field>
          )}
          {form.jenis === JENIS_ADDENDUM && (catatanMataUang.length > 0 || mataUangLamaBeda) && (
            <div className="flex min-w-0 gap-2 rounded-xl bg-accent-soft px-3 py-2.5 text-xs text-accent-ink sm:col-span-2" role="status">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <div className="min-w-0 flex-1 space-y-1">
                {catatanMataUang.map((c) => (
                  <p key={c}>{c}</p>
                ))}
                {mataUangLamaBeda && kunciMataUang && (
                  <Tombol type="button" kecil varian="kedua" className="mt-1" onClick={() => set("mataUang", kunciMataUang)}>
                    Samakan dengan induk ({kunciMataUang})
                  </Tombol>
                )}
              </div>
            </div>
          )}
          <Field label="Prioritas" className="min-w-0">
            <select className="input" value={form.prioritas} onChange={(e) => set("prioritas", e.target.value as Form["prioritas"])}>
              {PRIORITAS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </Field>
          <Field label="Tanggal mulai" className="min-w-0">
            <input type="date" className="input" value={form.tanggalMulai ?? ""} onChange={(e) => {
              set("tanggalMulai", e.target.value || null);
              hapusGalat("tanggalBerakhir");
            }} />
          </Field>
          <Field id={ID_ISIAN.tanggalBerakhir} label="Tanggal berakhir" className="min-w-0" galat={galatIsian.tanggalBerakhir}>
            <input type="date" className="input" value={form.tanggalBerakhir ?? ""} min={form.tanggalMulai ?? undefined} onChange={(e) => set("tanggalBerakhir", e.target.value || null)} />
          </Field>
          <Field label="Target selesai review" className="min-w-0" bantuan="Kapan kontrak ini dibutuhkan selesai oleh pengaju.">
            <input type="date" className="input" value={form.targetSelesai ?? ""} onChange={(e) => set("targetSelesai", e.target.value || null)} />
          </Field>
          <Field label="Kode proyek" className="min-w-0" bantuan={kantorPusat ? "Ditandai sebagai kontrak kantor pusat (bukan proyek)." : "Opsional, boleh menyusul. Pilih dari daftar supaya penulisannya seragam."}>
            {(aria) => (
              <>
                <input
                  {...aria}
                  className="input"
                  maxLength={100}
                  autoComplete="off"
                  spellCheck={false}
                  list="daftar-proyek"
                  value={form.kodeProyek}
                  onChange={(e) => set("kodeProyek", e.target.value)}
                  onBlur={() => setForm((f) => ({ ...f, kodeProyek: rapikanProyek(f.kodeProyek) }))}
                  placeholder="Contoh: TOL-X-2026"
                />
                <datalist id="daftar-proyek">
                  {proyekSaran.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
                <button
                  type="button"
                  aria-pressed={kantorPusat}
                  onClick={() => set("kodeProyek", kantorPusat ? "" : PROYEK_KANTOR_PUSAT)}
                  className={cx(
                    "mt-2 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors [@media(pointer:coarse)]:min-h-11",
                    kantorPusat ? "border-brand bg-brand-soft text-brand-strong" : "border-line bg-surface text-muted hover:border-brand hover:text-ink",
                  )}
                >
                  <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                  {LABEL_KANTOR_PUSAT}
                </button>
              </>
            )}
          </Field>
          <Field label="Nomor PR / PO / SPK" className="min-w-0" bantuan="Opsional, boleh menyusul. Pisahkan dengan koma bila lebih dari satu, mis. PO-123, SPK-45.">
            <input className="input font-mono" maxLength={200} autoComplete="off" spellCheck={false} value={form.nomorReferensi} onChange={(e) => set("nomorReferensi", e.target.value)} onBlur={() => setForm((f) => ({ ...f, nomorReferensi: rapikanReferensi(f.nomorReferensi) }))} />
          </Field>
          <Field label="Cost center" className="min-w-0" bantuan="Opsional.">
            <input className="input" maxLength={100} autoComplete="off" spellCheck={false} value={form.costCenter} onChange={(e) => set("costCenter", e.target.value)} />
          </Field>
          <Field label="Deskripsi / ruang lingkup" className="min-w-0 sm:col-span-2">
            <textarea className="input min-h-[110px]" value={form.deskripsi} onChange={(e) => set("deskripsi", e.target.value)} placeholder="Ruang lingkup pekerjaan, lokasi proyek, catatan untuk Legal…" />
          </Field>
        </div>
      </section></Item>

      {isianLegal && (kontrak || form.jenis !== JENIS_ADDENDUM) && (
        <Item><section className="kartu p-4 sm:p-6">
          <h2 className="mb-1 font-bold">Data Legal</h2>
          <p className="mb-4 text-sm text-muted">Hanya bisa diisi Legal.</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {kontrak && (
              <>
                <Field
                  id={ID_ISIAN.nomorKontrak}
                  label="Nomor kontrak"
                  className="min-w-0 sm:col-span-2"
                  galat={galatNomor}
                  bantuan={
                    catatanNomor.length > 0 ? (
                      <span className="block space-y-0.5 text-accent-ink">
                        {catatanNomor.map((c) => (
                          <span key={c} className="block">
                            {c}
                          </span>
                        ))}
                      </span>
                    ) : nomorDiubah ? (
                      "Nomor baru diperiksa lagi terhadap nomor yang sudah ada saat disimpan."
                    ) : undefined
                  }
                >
                  {(aria) => (
                    <>
                      <input {...aria} className="input font-mono" autoComplete="off" spellCheck={false} value={form.nomorKontrak} onChange={(e) => set("nomorKontrak", e.target.value)} />
                      {galatNomor && usulanNomor?.nomor && normalNomor(usulanNomor.nomor) !== normalNomor(form.nomorKontrak) && (
                        <Tombol type="button" kecil varian="kedua" className="mt-2" title={usulanNomor.alasan} onClick={() => set("nomorKontrak", usulanNomor.nomor)}>
                          Pakai usulan {usulanNomor.nomor}
                        </Tombol>
                      )}
                    </>
                  )}
                </Field>
                {/* U02: PIC hanya dibaca di sini. Penugasan lewat "Tugaskan" di detail supaya alih PIC dikonfirmasi dan tercatat. */}
                <div className="min-w-0">
                  <p className="label">PIC Legal</p>
                  <p className="flex min-h-[42px] items-center gap-2 rounded-xl border border-line bg-raised px-3 text-sm">
                    <UserRoundCog className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                    <span className="min-w-0 truncate font-semibold">{kontrak.picLegalNama || "Belum ada"}</span>
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Ganti lewat{" "}
                    <Link to={ke.detail(kontrak.id)} className="font-semibold text-brand hover:underline">
                      Tugaskan di halaman detail
                    </Link>{" "}
                    supaya alasannya tercatat dan PIC baru diberi tahu.
                  </p>
                </div>
                <Field label="Tanggal tanda tangan" className="min-w-0">
                  <input type="date" className="input" value={form.tanggalTandaTangan ?? ""} onChange={(e) => set("tanggalTandaTangan", e.target.value || null)} />
                </Field>
              </>
            )}
            {form.jenis !== JENIS_ADDENDUM && (
              <Field
                id={ID_ISIAN.plafon}
                label="Plafon (kontrak payung)"
                className="min-w-0"
                galat={galatIsian.plafon}
                bantuan={plafon != null && !Number.isNaN(plafon) ? `${formatUang(plafon, form.mataUang)} untuk semua kontrak turunannya.` : "Isi bila kontrak ini payung dengan batas nilai untuk kontrak turunannya. Kosongkan bila bukan."}
              >
                <input className="input text-right tabular-nums" inputMode="decimal" autoComplete="off" value={form.plafon} onChange={(e) => set("plafon", e.target.value)} placeholder="Tanpa plafon" />
              </Field>
            )}
          </div>
        </section></Item>
      )}

      {bolehUnggahBerkas && (
        <Item><section className="kartu p-4 sm:p-6">
          <h2 className="mb-1 font-bold">{kontrak ? "Tambah dokumen" : "Dokumen"}</h2>
          <p className="mb-4 text-sm text-muted">
            {kontrak
              ? "Unggah versi revisi atau dokumen yang diminta Legal. Dokumen yang sudah ada tetap tersimpan."
              : "Draft kontrak, penawaran, BAST, SPK, atau dokumen pendukung lain. Bisa ditambah nanti."}
          </p>
          <PenghitungSyarat jenisKontrak={form.jenis} jenisAda={jenisAda} className="mb-4" />
          <UnggahDokumen berkas={berkas} onUbah={setBerkas} jenisBawaan={jenisBawaan} nonaktif={sedangMenyimpan} />
          {butuhPernyataan && (
            <div className="mt-4">
              <label
                htmlFor={ID_ISIAN.susulan}
                className={cx("flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 transition-colors", galatIsian.susulan ? "border-danger bg-danger-soft" : susulan ? "border-brand bg-brand-soft" : "border-line bg-surface hover:border-brand")}
              >
                <input
                  id={ID_ISIAN.susulan}
                  type="checkbox"
                  className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--wh-brand)]"
                  checked={susulan}
                  onChange={(e) => {
                    setSusulan(e.target.checked);
                    hapusGalat("susulan");
                  }}
                  aria-invalid={galatIsian.susulan ? true : undefined}
                  aria-describedby={galatIsian.susulan ? `${ID_ISIAN.susulan}-galat` : undefined}
                />
                <span className="min-w-0 text-sm">
                  <span className="font-semibold">Dokumen wajib yang belum dilampirkan akan saya susulkan</span>
                  <span className="mt-0.5 block text-xs text-muted">Belum ada: {labelKurang.join(", ")}. Pernyataan ini dicatat di riwayat supaya Legal tahu.</span>
                </span>
              </label>
              {galatIsian.susulan && (
                <p id={`${ID_ISIAN.susulan}-galat`} role="alert" className="mt-1 text-xs font-semibold text-danger">
                  {galatIsian.susulan}
                </p>
              )}
            </div>
          )}
        </section></Item>
      )}

      </Kontainer>

      <GalatKirim galat={galatKirim} teksKirim={kontrak ? "Simpan Perubahan" : "Ajukan ke Legal"} awalan={kontrak ? "Perubahan belum tersimpan." : "Pengajuan belum terkirim. Isian Anda masih aman."} className="mt-6" />

      <div className="kaca sticky bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-10 mt-6 flex flex-wrap items-center justify-end gap-2 rounded-2xl border border-line px-3 py-3 shadow-pop sm:gap-3 sm:px-4 [&>button]:flex-1 sm:[&>button]:flex-none">
        {progres ? (
          <span className="mr-auto w-full min-w-0 truncate text-sm text-muted sm:w-auto" aria-live="polite">
            {progres}
          </span>
        ) : (
          jumlahGalat > 0 && (
            <span className="mr-auto flex w-full min-w-0 items-center gap-1.5 text-sm font-semibold text-danger sm:w-auto" role="status">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {jumlahGalat === 1 ? "Ada 1 isian yang perlu diperbaiki." : `Ada ${jumlahGalat} isian yang perlu diperbaiki.`}
            </span>
          )
        )}
        <Tombol type="button" varian="kedua" onClick={() => (adaPerubahan ? setTanyaBuang(true) : navigate(kembali))} disabled={sedangMenyimpan}>
          Batal
        </Tombol>
        <Tombol type="submit" varian={aksiKirimUlang ? "kedua" : "utama"} memuat={menyimpan === "simpan"} disabled={sedangMenyimpan}>
          {kontrak ? "Simpan Perubahan" : "Ajukan ke Legal"}
        </Tombol>
        {aksiKirimUlang && (
          <Tombol type="button" ikon={<Send className="h-4 w-4" />} memuat={menyimpan === "kirim-ulang"} disabled={sedangMenyimpan} onClick={() => void simpanDanKirimUlang()}>
            Simpan dan Kirim Ulang
          </Tombol>
        )}
      </div>

      {tanyaBuang && (
        <Konfirmasi
          judul="Buang perubahan?"
          teks="Perubahan di formulir ini belum disimpan dan akan hilang bila Anda keluar."
          labelYa="Buang perubahan"
          labelBatal="Lanjut mengisi"
          onYa={() => navigate(kembali)}
          onTutup={() => setTanyaBuang(false)}
        />
      )}
    </form>
  );
}
