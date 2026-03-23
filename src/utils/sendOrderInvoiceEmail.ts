import RNFS from 'react-native-fs';
import apiService from '../api/client';
import { getCompany, getGuid, getTallylocId, getUserEmail, getUserName } from '../store/storage';

function normalizeEmail(v: string | null | undefined): string {
  if (v == null) return '';
  const s = String(v).trim();
  return s === '-' ? '' : s;
}

/**
 * Send order invoice PDF to customer email in background (fire-and-forget).
 * - Never throws (logs errors only).
 * - Used when user clicks "Place Order" on Order Entry.
 */
export async function sendOrderInvoiceEmail(opts: {
  masterId: string | number | null | undefined;
  orderNumber: string | null | undefined;
  toEmail: string | null | undefined;
  customerEmailCc: string | null | undefined;
}): Promise<void> {
  const masterIdStr = opts.masterId != null ? String(opts.masterId).trim() : '';
  const orderNumber = String(opts.orderNumber ?? '').trim();

  const toEmail = normalizeEmail(opts.toEmail);
  const customerEmailCc = normalizeEmail(opts.customerEmailCc);

  try {
    const [tallylocId, coName, guid, fromEmail, senderName] = await Promise.all([
      getTallylocId(),
      getCompany(),
      getGuid(),
      getUserEmail(),
      getUserName(),
    ]);

    if (!tallylocId || !coName || !guid) {
      console.warn('[OrderInvoiceEmail] Email not configured: missing session data', { tallylocId, coName, guid });
      return;
    }

    if (!fromEmail) {
      console.warn('[OrderInvoiceEmail] Email not configured: missing from_email (login email)');
      return;
    }
    if (!senderName) {
      console.warn('[OrderInvoiceEmail] Email not configured: missing sender_name (login name)');
      return;
    }
    if (!orderNumber) {
      console.warn('[OrderInvoiceEmail] Email not configured: missing orderNumber');
      return;
    }
    if (!toEmail) {
      console.warn('[OrderInvoiceEmail] Email not configured: missing to_email (customer EMAIL)');
      return;
    }
    if (!masterIdStr) {
      console.warn('[OrderInvoiceEmail] Email not configured: missing masterId (pdf generation needs it)');
      return;
    }

    const pdfPath = await fetchOrderPdfToFile(masterIdStr);
    if (!pdfPath) {
      console.warn('[OrderInvoiceEmail] Could not generate PDF; skipping email', { masterId: masterIdStr });
      return;
    }

    const fileUrl = pdfPath.startsWith('file://') ? pdfPath : `file://${pdfPath}`;
    const fileName = pdfPath.split('/').pop() || 'order.pdf';

    const subject = `Order ${orderNumber}`;
    const email_body = 'Dear Sir/Madam,\n\nPlease find the invoice attached for your reference.';
    // cc_email should include login email + customer's EMAILCC (if provided).
    const cc_email = `${fromEmail}${customerEmailCc ? `,${customerEmailCc}` : ''}`;

    const payloadForLog = {
      tallyloc_id: String(tallylocId),
      co_name: coName,
      co_guid: guid,
      from_email: fromEmail,
      to_email: toEmail,
      cc_email,
      sender_name: senderName,
      subject,
      email_body,
      attachments: {
        uri: fileUrl,
        type: 'application/pdf',
        name: fileName,
      },
    };

    const formData = new FormData();
    formData.append('tallyloc_id', String(tallylocId));
    formData.append('co_name', coName);
    formData.append('co_guid', guid);
    formData.append('from_email', fromEmail);
    formData.append('to_email', toEmail);
    formData.append('cc_email', cc_email);
    formData.append('sender_name', senderName);
    formData.append('subject', subject);
    formData.append('email_body', email_body);
    formData.append(
      'attachments',
      { uri: fileUrl, type: 'application/pdf', name: fileName } as any
    );

    console.log('[OrderInvoiceEmail] Email API payload:', JSON.stringify(payloadForLog, null, 2));

    await apiService.sendTallydataShareEmail(formData, { skipUnauthorizedRedirect: true }).catch((err: unknown) => {
      console.warn('[OrderInvoiceEmail] Email API call failed', err);
    });

    console.log('[OrderInvoiceEmail] Sent invoice email', { orderNumber, toEmail });
  } catch (err: unknown) {
    console.warn('[OrderInvoiceEmail] Unexpected error', err);
  }
}

async function fetchOrderPdfToFile(masterId: string): Promise<string | null> {
  try {
    const [t, c, g] = await Promise.all([getTallylocId(), getCompany(), getGuid()]);
    if (!t || !c || !g) {
      console.warn('[OrderInvoiceEmail] PDF generation: missing session data', { t, c, g });
      return null;
    }

    const reqRes = await apiService.requestTallyPdf({
      tallyloc_id: t,
      company: c,
      guid: g,
      master_id: masterId,
    });

    const requestId = reqRes?.data?.request_id;
    if (!requestId) {
      console.warn('[OrderInvoiceEmail] PDF generation: request_id missing', reqRes?.data);
      return null;
    }

    const maxAttempts = 90;
    const delayMs = 1500;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((r) => setTimeout(r, delayMs));
      const statusRes = await apiService.getTallyPdfStatus(requestId);
      const status = statusRes?.data?.status;

      if (status === 'ready' && statusRes?.data?.pdf_base64) {
        const base64 = statusRes.data.pdf_base64;
        const safeName = `order_${masterId}_${Date.now()}.pdf`;
        const path = `${RNFS.CachesDirectoryPath}/${safeName}`;
        if (await RNFS.exists(path)) await RNFS.unlink(path);
        await RNFS.writeFile(path, base64, 'base64');
        return path;
      }

      if (status && status !== 'pending') {
        console.warn('[OrderInvoiceEmail] PDF generation status (non-pending)', status);
        return null;
      }
    }

    console.warn('[OrderInvoiceEmail] PDF generation timed out', { masterId });
    return null;
  } catch (err: unknown) {
    console.warn('[OrderInvoiceEmail] PDF generation error', err);
    return null;
  }
}

