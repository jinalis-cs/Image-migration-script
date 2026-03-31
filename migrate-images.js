const axios = require("axios");
const xlsx = require("xlsx");

const SHOP = "jinali-cirkle.myshopify.com";
const ACCESS_TOKEN = "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";
const EXCEL_FILE = "./image_file.xlsx";
const IMAGE_COLUMN = "Image URL";        // 👈 Your Google Drive URL column
const CDN_COLUMN = "Shopify Image URL";  // 👈 New column to be added

const GQL = `https://${SHOP}/admin/api/2024-01/graphql.json`;
const HEADERS = { "X-Shopify-Access-Token": ACCESS_TOKEN, "Content-Type": "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function toDirectUrl(url) {
  const id = url?.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] || url?.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1];
  return id ? `https://drive.google.com/uc?export=download&id=${id}` : url;
}

async function uploadImage(url) {
  const res = await axios.post(GQL, {
    query: `mutation { fileCreate(files: { contentType: IMAGE, originalSource: "${toDirectUrl(url)}" }) { files { id ... on MediaImage { fileStatus image { url } } } userErrors { message } } }`
  }, { headers: HEADERS });

  const file = res.data.data?.fileCreate?.files?.[0];
  if (!file?.id) return null;

  // Poll until READY
  for (let i = 0; i < 15; i++) {
    await sleep(3000);
    const poll = await axios.post(GQL, {
      query: `query { node(id: "${file.id}") { ... on MediaImage { fileStatus image { url } } } }`
    }, { headers: HEADERS });
    const node = poll.data.data?.node;
    if (node?.fileStatus === "READY") return node.image.url;
  }
  return null;
}

async function main() {
  const wb = xlsx.readFile(EXCEL_FILE);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(ws);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row[IMAGE_COLUMN] || row[CDN_COLUMN]?.includes("cdn.shopify.com")) continue;

    console.log(`[${i + 1}/${rows.length}] Uploading...`);
    row[CDN_COLUMN] = (await uploadImage(row[IMAGE_COLUMN])) || "FAILED";
    console.log(`  → ${row[CDN_COLUMN]}`);

    if ((i + 1) % 10 === 0) {
      wb.Sheets[wb.SheetNames[0]] = xlsx.utils.json_to_sheet(rows);
      xlsx.writeFile(wb, EXCEL_FILE);
      console.log("  💾 Progress saved");
    }

    await sleep(600);
  }

  wb.Sheets[wb.SheetNames[0]] = xlsx.utils.json_to_sheet(rows);
  xlsx.writeFile(wb, EXCEL_FILE);
  console.log("✅ Done! Shopify CDN URLs saved to Excel.");
}

main();