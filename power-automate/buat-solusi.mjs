// Membangun paket solusi Power Automate "WiCon" (power-automate/KontrakWKI.zip).
//
//   node power-automate/buat-solusi.mjs 1.0.0.7     (naikkan nomor versi setiap kali paket berubah)
//   node power-automate/periksa.mjs                 (periksa ekspresi dan rujukan aksi di hasil/)
//   npx --yes tsx scripts/uji-flow.ts               (jalankan flow terhadap data contoh)
//
// Impor di https://make.powerautomate.com > Solutions > Import solution, lalu petakan koneksi SharePoint
// dan Office 365 Outlook. Setiap flow ditulis di berkas terpisah di power-automate/alur/ supaya mudah dibaca.
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import JSZip from "jszip";
import { semuaAlur } from "./alur/index.mjs";

const NAMA_SOLUSI = "KontrakWKI";
const VERSI = process.argv[2] ?? "1.0.0.7";

const rujukan = {
  sharepoint: { logis: "kwki_sharedsharepointonline_7c2a1", api: "shared_sharepointonline", nama: "SharePoint" },
  outlook: { logis: "kwki_sharedoffice365_5f9d3", api: "shared_office365", nama: "Office 365 Outlook" },
};

const xmlEsc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function jsonAlur(a) {
  const refs = {};
  for (const k of a.koneksi) {
    const r = rujukan[k];
    refs[r.api] = { runtimeSource: "embedded", connection: { connectionReferenceLogicalName: r.logis }, api: { name: r.api } };
  }
  return JSON.stringify({
    properties: {
      connectionReferences: refs,
      definition: {
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "undefined",
        parameters: { $connections: { defaultValue: {}, type: "Object" }, $authentication: { defaultValue: {}, type: "SecureObject" } },
        triggers: a.pemicu,
        actions: a.aksi,
      },
      templateName: null,
    },
    schemaVersion: "1.0.0.0",
  });
}

const alur = semuaAlur.map((a) => ({ ...a, id: a.id ?? randomUUID() }));
const zip = new JSZip();

zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/octet-stream" /><Default Extension="json" ContentType="application/octet-stream" /></Types>`);

const alamat = (n) => `<Address><AddressNumber>${n}</AddressNumber><AddressTypeCode>1</AddressTypeCode><City xsi:nil="true"></City><County xsi:nil="true"></County><Country xsi:nil="true"></Country><Fax xsi:nil="true"></Fax><FreightTermsCode xsi:nil="true"></FreightTermsCode><ImportSequenceNumber xsi:nil="true"></ImportSequenceNumber><Latitude xsi:nil="true"></Latitude><Line1 xsi:nil="true"></Line1><Line2 xsi:nil="true"></Line2><Line3 xsi:nil="true"></Line3><Longitude xsi:nil="true"></Longitude><Name xsi:nil="true"></Name><PostalCode xsi:nil="true"></PostalCode><PostOfficeBox xsi:nil="true"></PostOfficeBox><PrimaryContactName xsi:nil="true"></PrimaryContactName><ShippingMethodCode>1</ShippingMethodCode><StateOrProvince xsi:nil="true"></StateOrProvince><Telephone1 xsi:nil="true"></Telephone1><Telephone2 xsi:nil="true"></Telephone2><Telephone3 xsi:nil="true"></Telephone3><TimeZoneRuleVersionNumber xsi:nil="true"></TimeZoneRuleVersionNumber><UPSZone xsi:nil="true"></UPSZone><UTCOffset xsi:nil="true"></UTCOffset><UTCConversionTimeZoneCode xsi:nil="true"></UTCConversionTimeZoneCode></Address>`;

zip.file(
  "solution.xml",
  `<?xml version="1.0" encoding="utf-8"?>
<ImportExportXml version="9.2.24101.141" SolutionPackageVersion="9.2" languagecode="1033" generatedBy="CrmLive" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" OrganizationVersion="9.2.24101.141" OrganizationSchemaType="Standard" CRMServerServiceabilityVersion="9.2.24101.00141">
  <SolutionManifest>
    <UniqueName>${NAMA_SOLUSI}</UniqueName>
    <LocalizedNames><LocalizedName description="WiCon" languagecode="1033" /></LocalizedNames>
    <Descriptions><Description description="Email Outlook, pengingat, dan laporan untuk aplikasi WiCon." languagecode="1033" /></Descriptions>
    <Version>${VERSI}</Version>
    <Managed>0</Managed>
    <Publisher>
      <UniqueName>kontrakwki</UniqueName>
      <LocalizedNames><LocalizedName description="WiCon" languagecode="1033" /></LocalizedNames>
      <Descriptions><Description description="WiCon" languagecode="1033" /></Descriptions>
      <EMailAddress xsi:nil="true"></EMailAddress>
      <SupportingWebsiteUrl xsi:nil="true"></SupportingWebsiteUrl>
      <CustomizationPrefix>kwki</CustomizationPrefix>
      <CustomizationOptionValuePrefix>74215</CustomizationOptionValuePrefix>
      <Addresses>${alamat(1)}${alamat(2)}</Addresses>
    </Publisher>
    <RootComponents>${alur.map((a) => `<RootComponent type="29" id="{${a.id}}" behavior="0" />`).join("")}</RootComponents>
    <MissingDependencies />
  </SolutionManifest>
</ImportExportXml>`,
);

const wfXml = (a) => `<Workflow WorkflowId="{${a.id}}" Name="${xmlEsc(a.nama)}"><JsonFileName>/Workflows/${a.berkas}-${a.id.toUpperCase()}.json</JsonFileName><Type>1</Type><Subprocess>0</Subprocess><Category>5</Category><Mode>0</Mode><Scope>4</Scope><OnDemand>0</OnDemand><TriggerOnCreate>0</TriggerOnCreate><TriggerOnDelete>0</TriggerOnDelete><AsyncAutodelete>0</AsyncAutodelete><SyncWorkflowLogOnFailure>0</SyncWorkflowLogOnFailure><StateCode>0</StateCode><StatusCode>1</StatusCode><RunAs>1</RunAs><IsTransacted>1</IsTransacted><IntroducedVersion>1.0</IntroducedVersion><IsCustomizable>1</IsCustomizable><BusinessProcessType>0</BusinessProcessType><IsCustomProcessingStepAllowedForOtherPublishers>1</IsCustomProcessingStepAllowedForOtherPublishers><PrimaryEntity>none</PrimaryEntity><LocalizedNames><LocalizedName languagecode="1033" description="${xmlEsc(a.nama)}" /></LocalizedNames></Workflow>`;

const refXml = (r) => `<connectionreference connectionreferencelogicalname="${r.logis}"><connectionreferencedisplayname>${r.nama}</connectionreferencedisplayname><connectorid>/providers/Microsoft.PowerApps/apis/${r.api}</connectorid><iscustomizable>1</iscustomizable><promptingbehavior>0</promptingbehavior><statecode>0</statecode><statuscode>1</statuscode></connectionreference>`;

const dipakai = new Set(alur.flatMap((a) => a.koneksi));
zip.file(
  "customizations.xml",
  `<?xml version="1.0" encoding="utf-8"?>
<ImportExportXml xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Entities></Entities>
  <Roles></Roles>
  <Workflows>${alur.map(wfXml).join("")}</Workflows>
  <FieldSecurityProfiles></FieldSecurityProfiles>
  <Templates />
  <EntityMaps />
  <EntityRelationships />
  <OrganizationSettings />
  <optionsets />
  <CustomControls />
  <EntityDataProviders />
  <connectionreferences>${[...dipakai].map((k) => refXml(rujukan[k])).join("")}</connectionreferences>
  <Languages><Language>1033</Language></Languages>
</ImportExportXml>`,
);

mkdirSync("power-automate/hasil", { recursive: true });
for (const a of alur) {
  const isi = jsonAlur(a);
  zip.file(`Workflows/${a.berkas}-${a.id.toUpperCase()}.json`, isi);
  writeFileSync(`power-automate/hasil/${a.berkas}.json`, JSON.stringify(JSON.parse(isi), null, 2));
}

const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
writeFileSync("power-automate/KontrakWKI.zip", buf);
console.log(`KontrakWKI.zip ${VERSI}: ${alur.length} flow, ${(buf.length / 1024).toFixed(1)} KB`);
alur.forEach((a) => console.log(" -", a.nama));
