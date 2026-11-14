// Read and write PDF metadata with pdf-lib.
// The source of truth is the document info dictionary (Title, Author, etc.).
// If the PDF also has an XMP metadata stream, changed fields are written there too,
// because some viewers (e.g. Acrobat) show XMP values first.
// Dates are held as strings in the format of <input type="datetime-local"> (local time).

import { PDFName, PDFRef, PDFRawStream, decodePDFRawStream } from 'pdf-lib';

export const METADATA_FIELDS = [
  { key: 'title', label: 'Title', type: 'text' },
  { key: 'author', label: 'Author', type: 'text' },
  { key: 'subject', label: 'Subject', type: 'text' },
  { key: 'keywords', label: 'Keywords', type: 'text' },
  { key: 'creator', label: 'Creator', type: 'text' },
  { key: 'producer', label: 'Producer', type: 'text' },
  { key: 'creationDate', label: 'Created', type: 'datetime-local' },
  { key: 'modificationDate', label: 'Modified', type: 'datetime-local' },
];

const pad = (n) => String(n).padStart(2, '0');

export const dateToInputValue = (date) => {
  if (!(date instanceof Date) || isNaN(date)) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const readMetadata = (pdfDoc) => ({
  title: pdfDoc.getTitle() ?? '',
  author: pdfDoc.getAuthor() ?? '',
  subject: pdfDoc.getSubject() ?? '',
  keywords: pdfDoc.getKeywords() ?? '',
  creator: pdfDoc.getCreator() ?? '',
  producer: pdfDoc.getProducer() ?? '',
  creationDate: dateToInputValue(pdfDoc.getCreationDate()),
  modificationDate: dateToInputValue(pdfDoc.getModificationDate()),
});

const SETTERS = {
  title: (doc, v) => doc.setTitle(v),
  author: (doc, v) => doc.setAuthor(v),
  subject: (doc, v) => doc.setSubject(v),
  // setKeywords joins an array with spaces; one element keeps the user's string as-is.
  keywords: (doc, v) => doc.setKeywords([v]),
  creator: (doc, v) => doc.setCreator(v),
  producer: (doc, v) => doc.setProducer(v),
  creationDate: (doc, v) => v && doc.setCreationDate(new Date(v)),
  modificationDate: (doc, v) => v && doc.setModificationDate(new Date(v)),
};

// Write only the fields the user changed, so untouched values (and date precision) stay exact.
export const applyMetadata = (pdfDoc, original, edited) => {
  const changed = METADATA_FIELDS.map(({ key }) => key).filter((key) => edited[key] !== original[key]);
  for (const key of changed) SETTERS[key](pdfDoc, edited[key]);
  if (changed.length) syncXmp(pdfDoc, edited, changed);
};

// ---- XMP ----

const NS = {
  x: 'adobe:ns:meta/',
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  dc: 'http://purl.org/dc/elements/1.1/',
  pdf: 'http://ns.adobe.com/pdf/1.3/',
  xmp: 'http://ns.adobe.com/xap/1.0/',
  xml: 'http://www.w3.org/XML/1998/namespace',
};

// kind: 'alt' = language alternative (rdf:Alt), 'seq' = ordered list (rdf:Seq), 'text' = simple value
const XMP_PROPS = {
  title: { ns: 'dc', name: 'title', kind: 'alt' },
  author: { ns: 'dc', name: 'creator', kind: 'seq' },
  subject: { ns: 'dc', name: 'description', kind: 'alt' },
  keywords: { ns: 'pdf', name: 'Keywords', kind: 'text' },
  creator: { ns: 'xmp', name: 'CreatorTool', kind: 'text' },
  producer: { ns: 'pdf', name: 'Producer', kind: 'text' },
  creationDate: { ns: 'xmp', name: 'CreateDate', kind: 'text' },
  modificationDate: { ns: 'xmp', name: 'ModifyDate', kind: 'text' },
};

// datetime-local string -> XMP date with local time zone offset, e.g. 2024-05-06T07:08:00+02:00
const toXmpDate = (value) => {
  const date = new Date(value);
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  return `${value.length === 16 ? `${value}:00` : value}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
};

const setXmpProperty = (xml, descriptions, { ns, name, kind }, value) => {
  const prefixed = `${ns}:${name}`;
  // A simple property can be stored as an attribute of an rdf:Description.
  for (const desc of descriptions) {
    if (desc.hasAttributeNS(NS[ns], name)) {
      if (kind === 'text') {
        desc.setAttributeNS(NS[ns], prefixed, value);
        return;
      }
      desc.removeAttributeNS(NS[ns], name);
    }
  }

  let prop = null;
  for (const desc of descriptions) {
    prop = Array.from(desc.childNodes).find((n) => n.namespaceURI === NS[ns] && n.localName === name) ?? null;
    if (prop) break;
  }
  if (!prop) {
    prop = xml.createElementNS(NS[ns], prefixed);
    // Prefer the rdf:Description that already declares this namespace.
    const target = descriptions.find((d) => d.lookupNamespaceURI(ns) === NS[ns]) ?? descriptions[0];
    target.appendChild(prop);
  }

  if (kind === 'text') {
    prop.textContent = value;
    return;
  }

  // Container property: replace all items with a single item.
  while (prop.firstChild) prop.removeChild(prop.firstChild);
  const container = xml.createElementNS(NS.rdf, kind === 'alt' ? 'rdf:Alt' : 'rdf:Seq');
  const item = xml.createElementNS(NS.rdf, 'rdf:li');
  if (kind === 'alt') item.setAttributeNS(NS.xml, 'xml:lang', 'x-default');
  item.textContent = value;
  container.appendChild(item);
  prop.appendChild(container);
};

// Update the changed fields in the XMP stream, if the PDF has one. Other XMP data is kept.
const syncXmp = (pdfDoc, edited, changedKeys) => {
  const metadataKey = PDFName.of('Metadata');
  const entry = pdfDoc.catalog.get(metadataKey);
  const stream = entry instanceof PDFRef ? pdfDoc.context.lookup(entry) : entry;
  if (!(stream instanceof PDFRawStream)) return;

  try {
    const text = new TextDecoder().decode(decodePDFRawStream(stream).decode());
    const xml = new DOMParser().parseFromString(text, 'application/xml');
    if (xml.getElementsByTagName('parsererror').length) throw new Error('Invalid XMP');
    const descriptions = Array.from(xml.getElementsByTagNameNS(NS.rdf, 'Description'));
    if (!descriptions.length) throw new Error('XMP has no rdf:Description');

    for (const key of changedKeys) {
      const value = edited[key];
      const isDate = key === 'creationDate' || key === 'modificationDate';
      if (isDate && !value) continue; // Same as the info dictionary: an empty date is not written.
      setXmpProperty(xml, descriptions, XMP_PROPS[key], isDate ? toXmpDate(value) : value);
    }

    // XMP should stay uncompressed so other tools can find it.
    const newStream = pdfDoc.context.stream(
      new TextEncoder().encode(new XMLSerializer().serializeToString(xml)),
      { Type: 'Metadata', Subtype: 'XML' },
    );
    if (entry instanceof PDFRef) pdfDoc.context.assign(entry, newStream);
    else pdfDoc.catalog.set(metadataKey, pdfDoc.context.register(newStream));
  } catch (e) {
    // The info dictionary is already updated; a broken XMP stream must not block the export.
    console.warn('Could not update XMP metadata:', e);
  }
};
