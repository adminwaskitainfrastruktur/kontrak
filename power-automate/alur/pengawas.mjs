// Flow 5: pengawas perubahan status.
// Aturan alur dijaga aplikasi, tetapi anggota site bisa mengubah list Kontrak langsung dari SharePoint. Flow ini
// memeriksa setiap perubahan Status terhadap alur resmi (src/lib/alur.ts) dan terhadap peran pengubahnya. Bila tidak
// sah, Admin diberi tahu lewat email dan riwayat kontrak diberi catatan. Flow ini TIDAK membalikkan perubahan secara
// otomatis supaya tidak pernah membatalkan tindakan yang sah; pemulihan dilakukan Admin dari riwayat versi.
// Keputusan ini disengaja (U37A): jangan tambahkan pemulihan versi otomatis di sini.
import { aksiModeUji, awalanUji } from "./pengaturan.mjs";
import { ADMIN_BAWAAN, LIST, URL_APLIKASI, W, FONT, ambilItem, barisTombol, escE, httpSharePoint, kerangka, kirimEmail, kondisi, paragraf, pemicuItemDiubah, pilih, tambahItem, tombolHtml, tulis } from "./umum.mjs";

const SAH = "|Diajukan>Review Legal|Diajukan>Ditolak|Diajukan>Dibatalkan|Review Legal>Proses Tanda Tangan|Review Legal>Perlu Revisi|Review Legal>Ditolak|Perlu Revisi>Review Legal|Perlu Revisi>Dibatalkan|Proses Tanda Tangan>Aktif|Proses Tanda Tangan>Review Legal|Aktif>Berakhir|";
const KHUSUS_LEGAL = "|Diajukan>Review Legal|Diajukan>Ditolak|Review Legal>Proses Tanda Tangan|Review Legal>Perlu Revisi|Review Legal>Ditolak|Proses Tanda Tangan>Aktif|Proses Tanda Tangan>Review Legal|Aktif>Berakhir|";

const t = (k) => `triggerOutputs()?['body/${k}']`;
const pasangan = "concat('|',outputs('Perubahan')?['dari'],'>',outputs('Perubahan')?['ke'],'|')";

const baris = (label, nilai) => `<tr><td width="150" style="padding:8px 12px 8px 0;border-bottom:1px solid ${W.line};font-family:${FONT};font-size:12px;color:${W.muted};font-weight:700;text-transform:uppercase;">${label}</td><td style="padding:8px 0;border-bottom:1px solid ${W.line};font-family:${FONT};font-size:14px;color:${W.ink};">${nilai}</td></tr>`;

export default {
  // ID tetap: impor ulang memperbarui flow yang sama, tidak membuat salinan baru.
  id: "76a6926e-af17-40b7-b616-1be461a82ff1",
  nama: "WiCon - Pengawas perubahan status",
  berkas: "KontrakWKI-PengawasStatus",
  koneksi: ["sharepoint", "outlook"],
  pemicu: { Saat_kontrak_diubah: pemicuItemDiubah(LIST.kontrak, 1) },
  aksi: {
    Riwayat_versi: httpSharePoint(`_api/web/lists(guid'${LIST.kontrak}')/items(@{${t("ID")}})/versions?$select=VersionId,VersionLabel,Status,Editor`),
    Perubahan: tulis(
      {
        dari: `@{if(greater(length(body('Riwayat_versi')?['value']),1),coalesce(reverse(sort(body('Riwayat_versi')?['value'],'VersionId'))?[1]?['Status'],''),'')}`,
        ke: `@{${t("Status/Value")}}`,
        oleh: `@{toLower(coalesce(${t("Editor/Email")},''))}`,
        olehNama: `@{coalesce(${t("Editor/DisplayName")},'(tidak diketahui)')}`,
      },
      { Riwayat_versi: ["Succeeded"] },
    ),
    Status_berubah: kondisi(
      { and: [{ not: { equals: ["@outputs('Perubahan')?['dari']", ""] } }, { not: { equals: ["@outputs('Perubahan')?['dari']", "@outputs('Perubahan')?['ke']"] } }] },
      {
        Peran_pengubah: ambilItem(LIST.pengguna, { filter: "Email eq '@{outputs('Perubahan')?['oleh']}' and Aktif eq 1" }),
        Penilaian: tulis(
          {
            sah: `@contains('${SAH}',${pasangan})`,
            khususLegal: `@contains('${KHUSUS_LEGAL}',${pasangan})`,
            pelakuLegal: `@or(equals(outputs('Perubahan')?['oleh'],'${ADMIN_BAWAAN}'),contains('|Admin|Legal|',concat('|',coalesce(first(body('Peran_pengubah')?['value'])?['Peran']?['Value'],'-'),'|')))`,
            peran: `@{coalesce(first(body('Peran_pengubah')?['value'])?['Peran']?['Value'],if(equals(outputs('Perubahan')?['oleh'],'${ADMIN_BAWAAN}'),'Admin','tidak terdaftar'))}`,
          },
          { Peran_pengubah: ["Succeeded"] },
        ),
        Melanggar: kondisi(
          { or: [{ equals: ["@outputs('Penilaian')?['sah']", false] }, { and: [{ equals: ["@outputs('Penilaian')?['khususLegal']", true] }, { equals: ["@outputs('Penilaian')?['pelakuLegal']", false] }] }] },
          {
            ...aksiModeUji(),
            Ambil_admin: ambilItem(LIST.pengguna, { filter: "Aktif eq 1 and Peran eq 'Admin'" }, { Email_uji: ["Succeeded"] }),
            Pilih_admin: pilih("@body('Ambil_admin')?['value']", "@item()?['Email']", { Ambil_admin: ["Succeeded"] }),
            Catat_peringatan: tambahItem(
              LIST.aktivitas,
              {
                Title: "Perubahan",
                KontrakId: `@${t("ID")}`,
                Pesan: "Peringatan sistem: status diubah dari @{outputs('Perubahan')?['dari']} ke @{outputs('Perubahan')?['ke']} oleh @{outputs('Perubahan')?['olehNama']} (@{outputs('Penilaian')?['peran']}) @{if(outputs('Penilaian')?['sah'],'tanpa hak Legal','di luar alur resmi')}. Periksa riwayat versi item ini di SharePoint.",
                StatusDari: "@outputs('Perubahan')?['dari']",
                StatusKe: "@outputs('Perubahan')?['ke']",
                OlehEmail: "sistem",
                OlehNama: "Pengawas otomatis",
              },
              { Pilih_admin: ["Succeeded"] },
            ),
            Kabari_admin: kirimEmail(
              {
                ke: `@{if(not(empty(outputs('Email_uji'))),outputs('Email_uji'),join(union(body('Pilih_admin'),createArray('${ADMIN_BAWAAN}')),';'))}`,
                subjek: awalanUji + "[WiCon] Perubahan status di luar alur: @{" + t("NomorPengajuan") + "}",
                penting: "High",
                isi: kerangka({
                  pratinjau: "Status @{outputs('Perubahan')?['dari']} → @{outputs('Perubahan')?['ke']} oleh @{outputs('Perubahan')?['olehNama']}.",
                  label: "Pengawas status",
                  judul: "Status kontrak berubah di luar alur",
                  nada: "danger",
                  isi:
                    paragraf(`Ada perubahan status yang tidak sesuai alur aplikasi. Kemungkinan diubah langsung dari SharePoint. Periksa lalu pulihkan dari riwayat versi bila memang keliru.`) +
                    `<tr><td style="padding:18px 32px 0 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">` +
                    baris("Kontrak", `<strong>@{${escE(t("Title"))}}</strong><br><span style="font-family:Consolas,'Courier New',monospace;font-size:12px;color:${W.muted};">@{${t("NomorPengajuan")}}</span>`) +
                    baris("Perubahan", `<strong>@{outputs('Perubahan')?['dari']}</strong> → <strong style="color:${W.danger};">@{outputs('Perubahan')?['ke']}</strong>`) +
                    baris("Oleh", `@{${escE("outputs('Perubahan')?['olehNama']")}} (@{outputs('Penilaian')?['peran']})`) +
                    baris("Masalah", `@{if(outputs('Penilaian')?['sah'],'Langkah ini hanya boleh dilakukan Legal atau Admin.','Langkah ini tidak ada dalam alur resmi.')}`) +
                    `</table></td></tr>` +
                    barisTombol(tombolHtml("Buka kontrak", `${URL_APLIKASI}/#/kontrak/@{${t("ID")}}`)),
                }),
              },
              { Catat_peringatan: ["Succeeded", "Failed"] },
            ),
          },
          {},
          { Penilaian: ["Succeeded"] },
        ),
      },
      {},
      { Perubahan: ["Succeeded"] },
    ),
  },
};
