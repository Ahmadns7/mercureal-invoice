# MercuReal Invoice

A freelancer invoice and expense tracker for Nigerian freelancers. Money is in naira (₦), stored as kobo so there is no float drift. Frontend only: all data lives in your browser's localStorage.

## Features

- Dashboard: invoiced, paid, outstanding, expenses, and cash-basis profit for the current month
- Invoices: line items, optional 7.5% VAT, client details, due date, auto-numbered (INV-YYYY-NNN)
- Mark invoices paid or unpaid, with a payment method (bank transfer, POS, cash, mobile money)
- Clients list
- Expenses with categories (data and airtime, transport, software, equipment, office, marketing, bank charges, other)
- Monthly summary view
- Print-friendly invoice page (window.print)
- Export and import all data as JSON
- Mobile-first layout, dark mode

## Setup

Requires Node 20 or newer.

    npm install
    npm run dev

Other scripts:

    npm run lint      # oxlint
    npm test          # vitest: money math, dates, summaries, import validation
    npm run build     # type-check and production build

## Screenshots

![Dashboard](docs/screenshots/dashboard.png)
![Invoice](docs/screenshots/invoice.png)
![Expenses](docs/screenshots/expenses.png)

## Notes

Your data is stored only in this browser. Clearing site data or switching browsers removes it, so export a JSON backup regularly from Settings.

## License

MIT. See LICENSE.
