# IT Asset Control

Responsive inventory management dashboard backed by the managed Excel workbooks in `data/workbooks`.

## Start

Double-click `run_dashboard.cmd`, then use the dashboard at `http://127.0.0.1:8787`.

Edits from the details drawer are written directly to the relevant workbook. A timestamped copy is created in `data/backups` before each save.

## Deploy on Vercel

The project includes a Vercel Python Function, static rewrites, Python dependencies, and persistent workbook synchronization.

1. In the Vercel project, open **Storage**.
2. Create a **private Blob store** and connect it to Production and Preview.
3. Confirm that Vercel created `BLOB_STORE_ID`; new connections use rotating
   OIDC credentials automatically. Older stores may use `BLOB_READ_WRITE_TOKEN`.
4. Redeploy the latest commit.
5. Open `/api/health` on the deployed domain. It should report `"environment":
   "vercel"`, `"blobConnected": true`, and `"blobAuth": "oidc"` (or `"token"`
   for an older store).

On the first request, the bundled workbooks seed the Blob store automatically. Future edits, moves, deletes, imports, and backups are written to Blob storage, while local development continues to use `data/workbooks`.

Vercel Functions limit request bodies to 4.5 MB. Because browser imports are Base64 encoded, deployed CSV/XLSX imports are limited to 3 MB and show a clear error before uploading larger files.

## Included workflows

- Search by employee, serial number, asset tag, department, or device details
- Filter and inspect assigned, in-stock, malfunctioned, snatched, and buyback laptops
- Low-stock alerts below five for headphones, mice, and laptops
- Upcoming-hire laptop workflow: Pending → Configuring → Ready → Done
- Assign laptop tag/serial, configuration owner, and setup notes
- Responsive desktop, tablet, and mobile layouts
