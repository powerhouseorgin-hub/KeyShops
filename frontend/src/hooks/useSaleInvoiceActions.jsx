import React, { useCallback, useRef, useState } from 'react';
import { downloadPdf } from '../utils/pdfDelivery';
import { buildSaleInvoice, phoneProblem } from '../utils/vehicleSaleInvoice';
import SendInvoiceDialog from '../components/SendInvoiceDialog';

// Download Invoice / Send Invoice for one vehicle sale, used by the All Sales screens (Shop Admin and Super Admin) and their details
// screen. `resolveShop(sale)` supplies the receipt header (a shop's name / address / phone).
//   - downloadInvoice(sale): builds the receipt from the SAVED sale (all details, photos and both signatures, in the language the sale
//     was made in - Tamil by default) and saves it.
//   - sendInvoice(sale): checks the seller's and buyer's numbers, builds the same receipt and has the server send it to both on
//     WhatsApp at once; the dialog then shows each recipient's outcome. A failed recipient can be retried on its own (the PDF is kept).
//   - buildInvoiceFile(sale): the receipt without saving it (the bulk download uses it).
// `onDelivery(sale, results)` lets the screen update the sale it shows, so the delivery status is visible straight away.
export default function useSaleInvoiceActions({ api, T, resolveShop, registeredByName, onDelivery }) {
  const [busy, setBusy] = useState(null);
  const [send, setSend] = useState(null);
  const kept = useRef(null); // { saleId, file } - the receipt of the last send, reused when retrying

  const buildInvoiceFile = useCallback(async (sale) => {
    const shop = await resolveShop(sale);
    return buildSaleInvoice({ sale, shop, registeredByName });
  }, [resolveShop, registeredByName]);

  const downloadInvoice = useCallback(async (sale) => {
    setBusy(`${sale.id}:download`);
    try {
      const { pdf, fileName } = await buildInvoiceFile(sale);
      await downloadPdf(pdf, fileName);
    } catch (err) {
      if (err && err.name !== 'AbortError') {
        console.error('Vehicle sale invoice download failed:', err);
        window.alert(`${T.invoiceFailed}\n(${String(err.message || err).slice(0, 160)})`);
      }
    } finally {
      setBusy(null);
    }
  }, [buildInvoiceFile, T]);

  const runSend = useCallback(async (sale, parties, reuse) => {
    setSend((prev) => ({ phase: 'sending', sale, results: reuse ? prev?.results || {} : {} }));
    try {
      let file = reuse && kept.current?.saleId === sale.id ? kept.current.file : null;
      if (!file) {
        const { pdf, fileName } = await buildInvoiceFile(sale);
        file = new File([pdf.output('blob')], fileName, { type: 'application/pdf' });
        kept.current = { saleId: sale.id, file };
      }
      const res = await api.sendVehicleSaleInvoice(sale, file, parties && parties.length ? parties.join(',') : undefined);
      // keep the recipients that already succeeded; only the retried ones change
      setSend((prev) => ({ phase: 'result', sale, results: { ...(reuse ? prev?.results || {} : {}), ...res.results } }));
      onDelivery?.(sale, res.results);
    } catch (err) {
      console.error('Vehicle sale invoice send failed:', err);
      setSend((prev) => ({ phase: 'error', sale, results: prev?.results || {}, message: String(err?.message || err).slice(0, 200) }));
    }
  }, [api, buildInvoiceFile, onDelivery]);

  const sendInvoice = useCallback((sale) => {
    const problems = { seller: phoneProblem(sale.sellerPhone), buyer: phoneProblem(sale.buyerPhone) };
    if (problems.seller && problems.buyer) {
      // nothing can be sent: say why for each, without building anything
      setSend({
        phase: 'blocked', sale,
        results: { seller: { sent: false, reason: problems.seller }, buyer: { sent: false, reason: problems.buyer } },
      });
      return;
    }
    runSend(sale, undefined, false);
  }, [runSend]);

  const retry = useCallback((parties) => {
    if (send?.sale) runSend(send.sale, parties, true);
  }, [send, runSend]);

  const dialog = <SendInvoiceDialog state={send} T={T} onRetry={retry} onClose={() => setSend(null)} />;
  return { busy, downloadInvoice, sendInvoice, buildInvoiceFile, dialog };
}
