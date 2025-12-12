// deepquill/lib/generateShippingLabel.cjs
const PDFDocument = require('pdfkit');
const path = require('path');

/**
 * order: {
 *   id: number,
 *   name: string,
 *   address: {
 *     line1: string,
 *     line2?: string,
 *     city: string,
 *     state: string,
 *     postalCode: string,
 *     country: string,
 *   },
 *   apCode?: string
 * }
 */
function generateShippingLabel(res, order) {
  const {
    id: orderId,
    name: customerName,
    address,
    apCode,
  } = order;

  if (!address) {
    throw new Error('Order missing shipping address');
  }

  const {
    line1: address1,
    line2: address2,
    city,
    state,
    postalCode,
    country,
  } = address;

  // 4x6 inches at 72 dpi => 288 x 432 points
  const doc = new PDFDocument({
    size: [288, 432],
    margin: 12,
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="label-${orderId}.pdf"`
  );

  doc.pipe(res);

  // --- Header: logo + brand ---
  const logoPath = path.join(
    __dirname,
    '../public/deepquill-logo-black.png'
  );

  try {
    doc.image(logoPath, {
      fit: [80, 80],
      align: 'center',
      valign: 'top',
    });
  } catch (e) {
    console.warn('Logo not found or failed to load:', e.message);
  }

  doc
    .fontSize(12)
    .text('DeepQuill Fulfillment', { align: 'center' })
    .moveDown(0.3)
    .fontSize(8)
    .text(
      'If undeliverable, return to: DeepQuill LLC, [YOUR RETURN ADDRESS]',
      { align: 'center' }
    );

  doc.moveDown(0.5);
  doc.moveTo(12, doc.y).lineTo(288 - 12, doc.y).stroke(); // divider
  doc.moveDown(0.5);

  // --- SHIP TO block ---
  doc
    .fontSize(10)
    .font('Helvetica-Bold')
    .text('SHIP TO:', { align: 'left' })
    .moveDown(0.2);

  doc
    .fontSize(12)
    .font('Helvetica-Bold')
    .text(customerName);

  doc
    .fontSize(11)
    .font('Helvetica')
    .text(address1);

  if (address2) {
    doc.text(address2);
  }

  doc.text(`${city}, ${state} ${postalCode}`);
  doc.text(country || 'United States');

  doc.moveDown(1);

  // --- Bottom band: order meta ---
  const bottomY = 432 - 36;
  doc.moveTo(12, bottomY).lineTo(288 - 12, bottomY).stroke();

  doc
    .fontSize(9)
    .font('Helvetica-Bold')
    .text(`Order # ${orderId}`, 12, bottomY + 4, { continued: true });

  if (apCode) {
    doc
      .font('Helvetica')
      .text(`   AP Code: ${apCode}`);
  }

  doc.end();
}

module.exports = { generateShippingLabel };

