// Read and write the PDF document info dictionary (Title, Author, etc.) with pdf-lib.
// Dates are held as strings in the format of <input type="datetime-local"> (local time).

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
  for (const { key } of METADATA_FIELDS) {
    if (edited[key] !== original[key]) SETTERS[key](pdfDoc, edited[key]);
  }
};
