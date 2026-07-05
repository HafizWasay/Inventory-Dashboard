# IT Asset Control

Responsive inventory management dashboard backed by the managed Excel workbooks in `data/workbooks`.

## Start

Double-click `run_dashboard.cmd`, then use the dashboard at `http://127.0.0.1:8787`.

Edits from the details drawer are written directly to the relevant workbook. A timestamped copy is created in `data/backups` before each save.

## Included workflows

- Search by employee, serial number, asset tag, department, or device details
- Filter and inspect assigned, in-stock, malfunctioned, snatched, and buyback laptops
- Low-stock alerts below five for headphones, mice, and laptops
- Upcoming-hire laptop workflow: Pending → Configuring → Ready → Done
- Assign laptop tag/serial, configuration owner, and setup notes
- Responsive desktop, tablet, and mobile layouts
